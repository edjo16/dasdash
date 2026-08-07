/**
 * Frontend de la herramienta "Presentation Cards" (módulo Tools).
 *
 * Flujo: subir imágenes de tarjetas -> emparejar frente/dorso (opcional) ->
 * POST /api/tools/cards/extract por tarjeta (secuencial, con progreso) ->
 * tabla de revisión -> crear el contacto en BADACO y/o exportar a Excel/CSV.
 *
 * La tabla tiene dos tipos de celda:
 *   - texto  : el valor tal cual lo leyó el modelo (editable).
 *   - enlace : Company / Job Level / Country. La tarjeta trae texto libre pero
 *              BADACO guarda ids (bmc_id, bmjl_id, cpais), así que la celda
 *              muestra la etiqueta del catálogo y conserva el id por debajo.
 *              El texto leído en la tarjeta queda editable encima: al
 *              corregirlo se vuelve a pedir el emparejado al servidor.
 *
 * La configuración (columnas y catálogos) la inyecta la vista en
 * `window.__pcConfig`. Exportación 100% en cliente reutilizando lo que ya
 * carga el layout (xlsx.core.min.js + FileSaver).
 */
(function () {
  'use strict';

  var CFG = window.__pcConfig || {};
  var COLUMNS = CFG.columns || [];
  var CATALOGS = CFG.catalogs || { companies: [], jobLevels: [], countries: [] };
  var BADACO = !!CFG.badacoEnabled;

  /** Campos de datos que devuelve el modelo (los que se exportan como texto). */
  var DATA_KEYS = [];
  COLUMNS.forEach(function (col) {
    var key = col.type === 'link' ? col.source : col.key;
    if (key && DATA_KEYS.indexOf(key) === -1) DATA_KEYS.push(key);
  });

  /** Columnas de enlace activas: { company: col, jobLevel: col, country: col }. */
  var LINK_COLUMNS = {};
  COLUMNS.forEach(function (col) { if (col.type === 'link') LINK_COLUMNS[col.link] = col; });

  /** Campos que ya tienen su propia columna de texto editable. */
  var TEXT_KEYS = COLUMNS.filter(function (col) { return col.type === 'text'; }).map(function (col) { return col.key; });

  var ALLOWED = /\.(png|jpe?g|webp)$/i;
  var MAX_FILES = 40;
  var REMATCH_DELAY = 500;

  var els = {};
  var state = {
    files: [], // { id, file, previewUrl, isBack }
    rows: [],  // { id, file, data, match, links, status, issue }
    processing: false,
    sending: false,
    pendingContact: null, // fila esperando a que el modal de contacto guarde
    pendingCompany: null, // fila esperando a que el modal de empresa guarde
    catalogsDirty: false, // hay una empresa nueva que el servidor aún no tiene en caché
    updateExisting: false, // por defecto, ¿los correos repetidos se actualizan?
    collapsed: false // panel de ingesta plegado
  };
  var nextId = 1;
  var nextRowId = 1;
  var validateTimer = null;

  /** Índices id -> etiqueta por catálogo, para pintar sin volver a buscar. */
  var catalogIndex = {};

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els.dropzone = $('pcDropzone');
    els.fileInput = $('pcFileInput');
    els.browseBtn = $('pcBrowseBtn');
    els.files = $('pcFiles');
    els.filesCount = $('pcFilesCount');
    els.fileList = $('pcFileList');
    els.clearBtn = $('pcClearBtn');
    els.processBtn = $('pcProcessBtn');
    els.status = $('pcStatus');
    els.statusFill = $('pcStatusFill');
    els.statusText = $('pcStatusText');
    els.empty = $('pcEmpty');
    els.results = $('pcResults');
    els.tableBody = $('pcTableBody');
    els.meta = $('pcMeta');
    els.summary = $('pcSummary');
    els.resetBtn = $('pcResetBtn');
    els.uploadAllBtn = $('pcUploadAllBtn');
    els.uploadAllLabel = $('pcUploadAllLabel');
    els.recheckBtn = $('pcRecheckBtn');
    els.bulkText = $('pcBulkText');
    els.updateExisting = $('pcUpdateExisting');
    els.updateExistingWrap = $('pcUpdateExistingWrap');
    els.layout = $('pcLayout');
    els.inputPanel = $('pcInputPanel');
    els.collapseBtn = $('pcCollapseBtn');
    els.uploadBar = $('pcUploadBar');
    els.showUploadBtn = $('pcShowUploadBtn');
  }

  /* ---------------- Panel de ingesta plegable ---------------- */

  /**
   * Pliega o despliega la sección de carga. Terminada la subida ya no hace
   * falta, así que se pliega sola y la tabla se queda con todo el ancho; la
   * barra superior la devuelve cuando haga falta.
   */
  function setCollapsed(collapsed) {
    state.collapsed = !!collapsed;
    if (els.layout) els.layout.classList.toggle('is-collapsed', state.collapsed);
    if (els.uploadBar) els.uploadBar.classList.toggle('d-none', !state.collapsed);
  }

  /* ---------------- Catálogos de BADACO ---------------- */

  /** Etiqueta visible de una empresa: "Nombre (País)" igual que en el modal. */
  function companyLabel(entry) {
    return entry.label + (entry.hint ? ' (' + entry.hint + ')' : '');
  }

  function buildCatalogs() {
    ['companies', 'jobLevels', 'countries'].forEach(function (name) {
      var list = CATALOGS[name] || [];
      var byId = {};
      var byLabel = {};
      list.forEach(function (entry) {
        var label = name === 'companies' ? companyLabel(entry) : entry.label;
        byId[String(entry.id)] = label;
        byLabel[normalizeLabel(label)] = String(entry.id);
        // También por el nombre suelto, para aceptar lo que escriba el usuario.
        if (!byLabel[normalizeLabel(entry.label)]) byLabel[normalizeLabel(entry.label)] = String(entry.id);
      });
      catalogIndex[name] = { list: list, byId: byId, byLabel: byLabel };
    });

    // Las empresas pueden ser miles: se usa un datalist compartido (con
    // búsqueda incremental del navegador) en vez de un <select> por fila.
    var datalist = document.createElement('datalist');
    datalist.id = 'pcCompanyList';
    (CATALOGS.companies || []).forEach(function (entry) {
      var option = document.createElement('option');
      option.value = companyLabel(entry);
      datalist.appendChild(option);
    });
    document.body.appendChild(datalist);
    els.companyList = datalist;

    // Job levels y países son listas cortas: se clona un <select> ya armado.
    els.selectTemplates = {};
    ['jobLevels', 'countries'].forEach(function (name) {
      var select = document.createElement('select');
      select.className = 'pc-link__select';
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '—';
      select.appendChild(blank);
      (CATALOGS[name] || []).forEach(function (entry) {
        var option = document.createElement('option');
        option.value = String(entry.id);
        option.textContent = entry.label;
        select.appendChild(option);
      });
      els.selectTemplates[name] = select;
    });
  }

  function normalizeLabel(value) {
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function labelOf(catalog, id) {
    if (id == null || id === '') return '';
    var index = catalogIndex[catalog];
    return (index && index.byId[String(id)]) || '';
  }

  function idOfLabel(catalog, label) {
    var index = catalogIndex[catalog];
    if (!index) return null;
    var id = index.byLabel[normalizeLabel(label)];
    return id == null ? null : id;
  }

  /* ---------------- File handling ---------------- */

  function addFiles(fileList) {
    var rejected = 0;
    Array.prototype.forEach.call(fileList, function (file) {
      if (state.files.length >= MAX_FILES) { rejected++; return; }
      if (!ALLOWED.test(file.name)) { rejected++; return; }
      state.files.push({
        id: nextId++,
        file: file,
        previewUrl: URL.createObjectURL(file),
        isBack: false
      });
    });

    if (rejected) {
      setStatus(rejected + ' file(s) skipped (only PNG, JPG, JPEG, WEBP; max ' + MAX_FILES + ' files).', 'error');
    } else {
      hideStatus();
    }
    renderFileList();
  }

  function removeFile(id) {
    var idx = state.files.findIndex(function (f) { return f.id === id; });
    if (idx === -1) return;
    URL.revokeObjectURL(state.files[idx].previewUrl);
    state.files.splice(idx, 1);
    renderFileList();
  }

  function clearFiles() {
    state.files.forEach(function (f) { URL.revokeObjectURL(f.previewUrl); });
    state.files = [];
    els.fileInput.value = '';
    renderFileList();
    hideStatus();
  }

  function renderFileList() {
    els.fileList.innerHTML = '';

    if (!state.files.length) {
      els.files.classList.add('d-none');
      els.processBtn.disabled = true;
      return;
    }

    els.files.classList.remove('d-none');
    els.processBtn.disabled = state.processing;

    state.files.forEach(function (entry, i) {
      // Un archivo no puede ser "dorso" si es el primero o si el anterior ya es dorso.
      var canBeBack = i > 0 && !state.files[i - 1].isBack;
      if (!canBeBack) entry.isBack = false;

      var row = document.createElement('div');
      row.className = 'pc-file' + (entry.isBack ? ' is-back' : '');

      var checkbox = canBeBack
        ? '<label class="pc-file__back" title="Merge this image with the previous card as its back side">' +
          '<input type="checkbox" data-back="' + entry.id + '"' + (entry.isBack ? ' checked' : '') + '>' +
          '<span>Back of previous card</span></label>'
        : '';

      row.innerHTML =
        '<img class="pc-file__thumb" src="' + entry.previewUrl + '" alt="">' +
        '<div class="pc-file__info">' +
        '<span class="pc-file__name">' + escapeHtml(entry.file.name) + '</span>' +
        '<small class="pc-file__size">' + formatBytes(entry.file.size) + '</small>' +
        '</div>' +
        checkbox +
        '<button type="button" class="pc-file__remove" data-remove="' + entry.id + '" title="Remove">' +
        '<i class="fas fa-times"></i></button>';

      els.fileList.appendChild(row);
    });

    var cards = buildCards();
    els.filesCount.textContent = state.files.length + ' image(s) — ' + cards.length + ' card(s)';
  }

  /** Agrupa los archivos en tarjetas: [frente] o [frente, dorso]. */
  function buildCards() {
    var cards = [];
    for (var i = 0; i < state.files.length; i++) {
      var front = state.files[i];
      var back = null;
      if (i + 1 < state.files.length && state.files[i + 1].isBack) {
        back = state.files[i + 1];
        i++;
      }
      cards.push({ front: front, back: back });
    }
    return cards;
  }

  /* ---------------- Status ---------------- */

  function showStatus(indeterminate) {
    els.status.classList.remove('d-none');
    els.statusText.className = 'tt-status__text';
    if (indeterminate) {
      els.statusFill.classList.add('is-indeterminate');
    } else {
      els.statusFill.classList.remove('is-indeterminate');
    }
  }

  function setStatus(text, type) {
    showStatus(type !== 'progress');
    els.statusText.textContent = text;
    if (type === 'error') els.statusText.classList.add('is-error');
    if (type === 'success') els.statusText.classList.add('is-success');
    // Con el panel de carga plegado este aviso no se ve: se repite como toast.
    if (state.collapsed && type === 'error') toast(text, 2);
  }

  function setProgress(pct, text) {
    showStatus(false);
    els.statusFill.classList.remove('is-indeterminate');
    els.statusFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (text) els.statusText.textContent = text;
  }

  function hideStatus() {
    els.status.classList.add('d-none');
    els.statusFill.style.width = '0';
  }

  /* ---------------- Main flow ---------------- */

  async function process() {
    var cards = buildCards();
    if (!cards.length || state.processing) return;

    state.processing = true;
    els.processBtn.disabled = true;
    var failures = 0;

    try {
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var fileLabel = card.front.file.name + (card.back ? ' + ' + card.back.file.name : '');
        var label = 'Analyzing card ' + (i + 1) + ' of ' + cards.length + ' (' + fileLabel + ')...';
        setProgress((i / cards.length) * 100, label);

        var row;
        try {
          var result = await extractCard(card);
          row = makeRow(fileLabel, result.data, result.match, result.images);
        } catch (err) {
          console.error(err);
          failures++;
          row = makeRow(fileLabel + ' (failed: ' + (err.message || 'error') + ')', {}, null);
          row.failed = true;
        }

        state.rows.push(row);
        renderRow(row);
        showResults();
        setProgress(((i + 1) / cards.length) * 100, label);
      }

      updateMeta();
      clearFiles();
      updateSummary();
      // Se avisa de los duplicados y de lo que falta antes de que el usuario
      // pulse nada: la columna Status queda al día sola.
      if (BADACO) validateAll(true);
      if (failures) {
        // El aviso vive en el panel de carga: se deja abierto para que se lea.
        setStatus('Done with ' + failures + ' failed card(s). Check the table.', 'error');
      } else {
        setStatus('Done — ' + cards.length + ' card(s) processed.', 'success');
        setTimeout(hideStatus, 2000);
        // Subidas las tarjetas, lo que queda por revisar es la tabla.
        setCollapsed(true);
      }
    } finally {
      state.processing = false;
      els.processBtn.disabled = !state.files.length;
    }
  }

  async function extractCard(card) {
    var fd = new FormData();
    fd.append('front', card.front.file);
    if (card.back) fd.append('back', card.back.file);

    var res = await fetch('/api/tools/cards/extract', { method: 'POST', body: fd });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.result !== 1) {
      throw new Error(data.error || 'Extraction failed (' + res.status + ')');
    }
    // El servidor deja la imagen aparcada y devuelve un token: el alta del
    // contacto lo usa para archivarla junto a la ficha en Badaco.
    return {
      data: data.data || {},
      match: data.match || null,
      images: {
        front: (data.image && data.image.token) || null,
        back: (data.backImage && data.backImage.token) || null
      }
    };
  }

  /** Construye una fila del modelo a partir de la respuesta del servidor. */
  function makeRow(file, data, match, images) {
    var row = {
      id: nextRowId++,
      file: file,
      data: {},
      match: {},
      links: {},
      inputs: {},
      saved: false,   // ya existe en BADACO
      failed: false,  // la extracción falló
      status: 'draft', // draft | ready | error | saving | saved
      issue: null,     // { code, message, fields }
      // Qué hacer si el correo ya está en BADACO: null = lo que diga el
      // interruptor general, true/false = decisión tomada en esta fila.
      updateExisting: null,
      mode: 'create',  // create | update (lo confirma el servidor)
      existingId: null, // contacto que se actualizaría
      existingName: null,
      contactId: null,
      images: images || { front: null, back: null }, // tokens de las imágenes aparcadas
      files: [],       // imágenes ya archivadas (las devuelve el alta)
      fileWarning: null,
      el: null
    };
    DATA_KEYS.forEach(function (key) { row.data[key] = data[key] || ''; });
    applyMatch(row, match);
    return row;
  }

  /** Vuelca el emparejado del servidor en la fila (id auto-seleccionado + alternativas). */
  function applyMatch(row, match) {
    Object.keys(LINK_COLUMNS).forEach(function (link) {
      var result = (match && match[link]) || { id: null, label: '', confidence: 'none', options: [] };
      row.match[link] = result;
      row.links[link] = result.id == null ? null : String(result.id);
    });
  }

  /* ---------------- Rendering ---------------- */

  function showResults() {
    els.empty.classList.add('d-none');
    els.results.classList.remove('d-none');
  }

  function renderRow(row) {
    var tr = document.createElement('tr');
    row.el = tr;
    if (row.failed) tr.className = 'is-failed';

    var tdFile = document.createElement('td');
    tdFile.className = 'pc-table__file';
    row.fileCell = tdFile;
    renderFileCell(row);
    tr.appendChild(tdFile);

    COLUMNS.forEach(function (column) {
      var td = document.createElement('td');
      if (column.type === 'link' && BADACO) {
        td.className = 'pc-table__link';
        td.appendChild(linkCell(row, column));
      } else {
        td.appendChild(textInput(row, column.type === 'link' ? column.source : column.key));
      }
      tr.appendChild(td);
    });

    if (BADACO) {
      var tdStatus = document.createElement('td');
      tdStatus.className = 'pc-table__status';
      row.statusCell = tdStatus;
      tr.appendChild(tdStatus);

      var tdActions = document.createElement('td');
      tdActions.className = 'pc-table__actions';

      // Acción principal: la fila se crea en BADACO tal cual está en la tabla.
      var sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'btn btn-primary btn-sm pc-action';
      sendBtn.title = 'Create this contact in Badaco right now';
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
      sendBtn.addEventListener('click', function () { sendRows([row], { single: true }); });
      row.actionBtn = sendBtn;
      tdActions.appendChild(sendBtn);

      // Acción secundaria: el formulario completo, para lo que la tarjeta no
      // trae (evento, relación, colaborador asignado...).
      var formBtn = document.createElement('button');
      formBtn.type = 'button';
      formBtn.className = 'btn btn-outline-secondary btn-sm pc-action';
      formBtn.title = 'Open the full Badaco form instead (event, relationship, assignees…)';
      formBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
      formBtn.addEventListener('click', function () { openBadacoContact(row); });
      row.formBtn = formBtn;
      tdActions.appendChild(formBtn);

      tr.appendChild(tdActions);
      renderStatus(row);
    }

    els.tableBody.appendChild(tr);
    updateSummary();
  }

  /**
   * Celda "File": el nombre de la imagen y, una vez creado el contacto, el
   * enlace a la foto ya archivada en Badaco (o el aviso de que no se pudo).
   */
  function renderFileCell(row) {
    var cell = row.fileCell;
    if (!cell) return;
    cell.innerHTML = '';
    cell.title = row.file || '';

    var name = document.createElement('span');
    name.className = 'pc-file__name';
    name.textContent = row.file || '';
    cell.appendChild(name);

    (row.files || []).forEach(function (file) {
      var link = document.createElement('a');
      link.className = 'pc-file__link';
      link.href = file.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Card image saved in Badaco (' + file.side + '): ' + file.file_name;
      link.innerHTML = '<i class="fas fa-image"></i>';
      cell.appendChild(link);
    });

    if (row.fileWarning) {
      var warn = document.createElement('span');
      warn.className = 'pc-file__warn';
      warn.title = row.fileWarning;
      warn.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
      cell.appendChild(warn);
    }
  }

  function textInput(row, key) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'pc-table__input';
    input.value = row.data[key] || '';
    row.inputs[key] = input;
    input.addEventListener('input', function () {
      row.data[key] = this.value;
      // Todo menos el nombre alimenta alguna sugerencia: el puesto da el job
      // level; email/web dan la empresa; dirección y teléfonos dan el país.
      if (key !== 'name') scheduleRematch(row);
      if (key === 'name' || key === 'email') {
        // Editar lo obligatorio limpia el aviso viejo y vuelve a validar.
        refreshRowState(row);
        scheduleValidation();
      }
    });
    return input;
  }

  /**
   * Celda enlazada: texto leído en la tarjeta (editable) + valor de BADACO
   * (id) + estado de la coincidencia y alternativas sugeridas.
   */
  function linkCell(row, column) {
    var wrap = document.createElement('div');
    wrap.className = 'pc-link';
    row['wrap_' + column.link] = wrap;

    // Lo que dice la tarjeta. Editarlo vuelve a pedir el emparejado.
    // Si ese campo ya tiene su propia columna editable (Job Level nace de Job
    // Title) no se duplica el input: se editaría el mismo dato en dos sitios.
    if (TEXT_KEYS.indexOf(column.source) === -1) {
      var raw = document.createElement('input');
      raw.type = 'text';
      raw.className = 'pc-link__raw';
      raw.value = row.data[column.source] || '';
      raw.placeholder = 'Read from the card';
      raw.title = 'Text read from the card — edit it to search Badaco again';
      raw.addEventListener('input', function () {
        row.data[column.source] = this.value;
        scheduleRematch(row);
      });
      wrap.appendChild(raw);
    }

    // Valor de BADACO.
    var control;
    if (column.catalog === 'companies') {
      control = document.createElement('input');
      control.type = 'text';
      control.className = 'pc-link__select pc-link__select--search';
      control.setAttribute('list', 'pcCompanyList');
      control.placeholder = 'Type to search Badaco…';
      control.value = labelOf('companies', row.links[column.link]);
      control.addEventListener('change', function () {
        var id = idOfLabel('companies', this.value);
        row.links[column.link] = id;
        if (id) this.value = labelOf('companies', id);
        refreshLinkCell(row, column);
      });
    } else {
      control = els.selectTemplates[column.catalog].cloneNode(true);
      control.value = row.links[column.link] || '';
      control.addEventListener('change', function () {
        row.links[column.link] = this.value || null;
        refreshLinkCell(row, column);
      });
    }
    row['control_' + column.link] = control;
    wrap.appendChild(control);

    var meta = document.createElement('div');
    meta.className = 'pc-link__meta';
    row['meta_' + column.link] = meta;
    wrap.appendChild(meta);

    renderLinkMeta(row, column);
    return wrap;
  }

  /** Chip de confianza + alternativas ("¿quisiste decir...?") + crear empresa. */
  function renderLinkMeta(row, column) {
    var meta = row['meta_' + column.link];
    if (!meta) return;
    meta.innerHTML = '';

    var match = row.match[column.link] || {};
    var linked = row.links[column.link];
    // "manual" = el usuario eligió algo distinto de lo que sugirió el emparejado.
    var manual = !!linked && !(match.id != null && String(match.id) === String(linked));
    var confidence;
    if (linked) confidence = manual ? 'high' : (match.confidence || 'high');
    else confidence = (match.options && match.options.length) ? 'low' : 'none';

    // El borde de la celda repite el estado, para localizar de un vistazo lo
    // que hay que revisar sin leer cada chip.
    var wrap = row['wrap_' + column.link];
    if (wrap) wrap.className = 'pc-link pc-link--' + (manual ? 'manual' : confidence);

    var chip = document.createElement('span');
    chip.className = 'pc-conf pc-conf--' + (manual ? 'manual' : confidence);
    chip.textContent = manual ? 'Selected' : confidenceLabel(confidence, match.reason);
    chip.title = manual ? 'Chosen manually' : confidenceTitle(confidence, match);
    meta.appendChild(chip);

    // Alternativas que no son la ya seleccionada.
    (match.options || []).forEach(function (option) {
      if (linked && String(option.id) === String(linked)) return;
      var suggestion = document.createElement('button');
      suggestion.type = 'button';
      suggestion.className = 'pc-suggest';
      suggestion.innerHTML = '<i class="fas fa-arrow-turn-up pc-suggest__icon"></i>' +
        '<span class="pc-suggest__text">' + escapeHtml(option.label) + '</span>';
      suggestion.title = 'Use "' + option.label + '" (' + Math.round((option.score || 0) * 100) + '% match)';
      suggestion.addEventListener('click', function () {
        row.links[column.link] = String(option.id);
        var control = row['control_' + column.link];
        if (control) {
          control.value = column.catalog === 'companies'
            ? labelOf('companies', option.id)
            : String(option.id);
        }
        refreshLinkCell(row, column);
      });
      meta.appendChild(suggestion);
    });

    // La empresa es obligatoria para crear el contacto: si no existe, se crea.
    if (column.creatable && !linked) {
      var create = document.createElement('button');
      create.type = 'button';
      create.className = 'pc-suggest pc-suggest--create';
      create.innerHTML = '<i class="fas fa-plus me-1"></i>New company';
      create.title = 'Create this company in Badaco with the card data';
      create.addEventListener('click', function () { openBadacoCompany(row); });
      meta.appendChild(create);
    }
  }

  function refreshLinkCell(row, column) {
    renderLinkMeta(row, column);
    if (column.link === 'company') {
      refreshRowState(row);
      scheduleValidation();
    }
    updateSummary();
  }

  function confidenceLabel(confidence, reason) {
    if (confidence === 'none') return 'Not found';
    if (confidence === 'low') return 'Pick one';
    if (confidence === 'medium') return 'Likely';
    return reason === 'domain' ? 'Matched by domain' : 'Matched';
  }

  function confidenceTitle(confidence, match) {
    if (confidence === 'low') {
      return 'No confident match for "' + (match.raw || '') + '". Closest records are listed next to it.';
    }
    if (confidence === 'none') {
      return match.raw
        ? 'No Badaco record resembles "' + match.raw + '". Pick one or create it.'
        : 'The card did not provide this value.';
    }
    var pct = Math.round((match.score || 0) * 100);
    var by = {
      domain: 'matched by email/website domain',
      exact: 'exact name match',
      address: 'taken from the address',
      phone: 'taken from the phone country code',
      rule: 'derived from the job title',
      similar: 'similar name',
      suggested: 'similar name'
    }[match.reason] || 'similar name';
    return 'Card said "' + (match.raw || '') + '" — ' + by + ' (' + pct + '%)';
  }

  /** Re-emparejado en el servidor tras editar el texto de la tarjeta. */
  function scheduleRematch(row) {
    if (!BADACO) return;
    clearTimeout(row.rematchTimer);
    row.rematchTimer = setTimeout(function () { rematch(row); }, REMATCH_DELAY);
  }

  async function rematch(row) {
    try {
      var res = await fetch('/api/tools/cards/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: row.data, refresh: state.catalogsDirty })
      });
      state.catalogsDirty = false;
      var payload = await res.json();
      if (!res.ok || payload.result !== 1) return;

      Object.keys(LINK_COLUMNS).forEach(function (link) {
        var column = LINK_COLUMNS[link];
        var result = payload.match[link] || { id: null, label: '', confidence: 'none', options: [] };
        var previous = row.match[link] || {};
        row.match[link] = result;

        // Se respeta lo que el usuario haya elegido a mano; sólo se reemplaza
        // el valor si seguía siendo el que sugirió el emparejado anterior.
        var untouched = row.links[link] == null || (previous.id != null && String(previous.id) === String(row.links[link]));
        if (untouched) {
          row.links[link] = result.id == null ? null : String(result.id);
          var control = row['control_' + link];
          if (control) {
            control.value = column.catalog === 'companies'
              ? labelOf('companies', row.links[link])
              : (row.links[link] || '');
          }
        }
        renderLinkMeta(row, column);
      });
      updateSummary();
    } catch (error) {
      console.error('rematch failed', error);
    }
  }

  /* ---------------- Integración con BADACO ---------------- */

  /** Abre el modal de contacto pre-llenado con los datos y los ids resueltos. */
  function openBadacoContact(row) {
    if (typeof window.openNewContactModal !== 'function') {
      setStatus('The Badaco contact form is not available on this page.', 'error');
      return;
    }
    state.pendingContact = row;
    window.openNewContactModal({
      name: row.data.name || '',
      email: row.data.email || '',
      phone: row.data.phone_number || row.data.mobile || '',
      job_title: row.data.job_title || '',
      address: row.data.address || '',
      company: row.data.company || '',
      bmc_id: row.links.company || null,
      bmjl_id: row.links.jobLevel || null,
      country: row.links.country || null
    });
  }

  /** Abre el modal de empresa pre-llenado con lo que trae la tarjeta. */
  function openBadacoCompany(row) {
    if (typeof window.openNewCompanyModal !== 'function') {
      setStatus('The Badaco company form is not available on this page.', 'error');
      return;
    }
    state.pendingCompany = row;
    window.openNewCompanyModal({
      nombre: row.data.company || '',
      website: row.data.website || '',
      email: row.data.email || '',
      pais: row.links.country || '',
      telefono: row.data.phone_number || row.data.mobile || '',
      address: row.data.address || ''
    });
  }

  /** El modal de empresa avisa aquí cuando guarda: se enlaza la fila al vuelo. */
  window._badacoCompanyRefresh = function (company) {
    if (!company || !company.bmc_id) return;

    var entry = { id: String(company.bmc_id), label: company.nombre, hint: '' };
    if (company.isNew) {
      state.catalogsDirty = true;
      CATALOGS.companies.push(entry);
      catalogIndex.companies.byId[entry.id] = entry.label;
      catalogIndex.companies.byLabel[normalizeLabel(entry.label)] = entry.id;
      var option = document.createElement('option');
      option.value = entry.label;
      els.companyList.appendChild(option);
    }

    var row = state.pendingCompany;
    state.pendingCompany = null;
    if (!row || !LINK_COLUMNS.company) return;

    row.links.company = String(company.bmc_id);
    var control = row['control_company'];
    if (control) control.value = labelOf('companies', company.bmc_id);
    refreshLinkCell(row, LINK_COLUMNS.company);
  };

  /** El modal de contacto avisa aquí cuando guarda: se marca la fila. */
  window._badacoContactRefresh = function (contact) {
    var row = state.pendingContact;
    state.pendingContact = null;
    if (!row) return;
    markSaved(row, contact && contact.contact_id);
    // El alta la hizo el formulario, así que la imagen se adjunta ahora.
    attachCardImages(row, contact && contact.contact_id);
  };

  /**
   * Archiva la imagen de la tarjeta contra un contacto creado desde el
   * formulario completo. El contacto ya existe: si esto falla sólo se avisa en
   * la celda del archivo.
   */
  async function attachCardImages(row, contactId) {
    var images = row.images || {};
    if (!contactId || (!images.front && !images.back)) return;

    try {
      var res = await fetch('/api/tools/cards/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          image_token: images.front,
          back_image_token: images.back
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.result !== 1) throw new Error(data.error || 'Could not archive the card image');

      row.files = data.files || [];
      row.fileWarning = data.warning || null;
    } catch (error) {
      console.error('attach card image failed', error);
      row.fileWarning = 'The contact was created, but its card image could not be archived.';
    }
    row.images = { front: null, back: null };
    renderFileCell(row);
  }

  /* ---------------- Alta directa en BADACO ---------------- */

  /** Título corto de cada motivo de rechazo (el largo lo da el servidor). */
  var ISSUE_TITLES = {
    missing_fields: 'Required data missing',
    invalid_email: 'Invalid email',
    duplicate_batch: 'Repeated in this batch',
    duplicate_badaco: 'Already in Badaco',
    unknown_company: 'Company not found',
    insert_failed: 'Badaco rejected it',
    network: 'Could not reach Badaco'
  };

  /** Lo que BADACO exige y la fila todavía no tiene. */
  function missingFields(row) {
    var missing = [];
    if (!String(row.data.name || '').trim()) missing.push('Name');
    if (!String(row.data.email || '').trim()) missing.push('Email');
    if (LINK_COLUMNS.company && !row.links.company) missing.push('Company');
    return missing;
  }

  /** Filas que aún no están en BADACO (una extracción fallida se puede rellenar a mano). */
  function pendingRows() {
    return state.rows.filter(function (row) { return !row.saved; });
  }

  function readyRows() {
    return pendingRows().filter(function (row) { return !missingFields(row).length; });
  }

  /** ¿Esta fila debe actualizar el contacto si el correo ya está en BADACO? */
  function updatesExisting(row) {
    return row.updateExisting == null ? state.updateExisting : !!row.updateExisting;
  }

  /** Lo que viaja al servidor por fila. `ref` permite devolver el resultado a su fila. */
  function rowPayload(row) {
    return {
      ref: row.id,
      label: row.file,
      update_existing: updatesExisting(row),
      name: row.data.name,
      email: row.data.email,
      job_title: row.data.job_title,
      phone_number: row.data.phone_number || row.data.mobile,
      address: row.data.address,
      bmc_id: row.links.company,
      bmjl_id: row.links.jobLevel,
      country: row.links.country,
      // Tokens de las imágenes aparcadas en /extract: el servidor las archiva
      // en //<DB_SERVER>/BADACO/<id> sólo si el contacto llega a crearse.
      image_token: row.images && row.images.front,
      back_image_token: row.images && row.images.back
    };
  }

  /**
   * Recalcula el estado local de la fila tras una edición: el aviso viejo deja
   * de ser cierto en cuanto el usuario toca el dato que lo provocó, así que se
   * borra y el chip vuelve a decir sólo lo que falta (el servidor confirmará).
   */
  function refreshRowState(row) {
    if (row.saved || row.status === 'saving') return;
    row.issue = null;
    // El duplicado se comprueba contra el correo actual: cambiarlo deja sin
    // valor lo que dijo el servidor la última vez.
    row.mode = 'create';
    row.existingId = null;
    row.status = missingFields(row).length ? 'draft' : 'ready';
    renderStatus(row);
    updateSummary();
  }

  function markSaved(row, contactId, mode) {
    row.saved = true;
    row.issue = null;
    row.status = 'saved';
    row.mode = mode || 'create';
    if (contactId) row.contactId = contactId;
    renderStatus(row);
    updateSummary();
  }

  /**
   * Cambia la decisión de esta fila ante un correo repetido y vuelve a
   * comprobarla contra BADACO, para que el chip diga ya lo que va a pasar.
   */
  function setRowUpdate(row, update) {
    row.updateExisting = update;
    row.issue = null;
    row.mode = 'create';
    row.status = missingFields(row).length ? 'draft' : 'ready';
    renderStatus(row);
    updateSummary();
    validateAll(true);
  }

  /** Pinta la columna Status y deja los botones de la fila en el estado correcto. */
  function renderStatus(row) {
    if (!BADACO || !row.statusCell) return;
    var cell = row.statusCell;
    cell.innerHTML = '';

    if (row.el) {
      row.el.classList.toggle('is-saved', row.status === 'saved');
      row.el.classList.toggle('is-error', row.status === 'error');
    }

    var missing = missingFields(row);
    var chip = document.createElement('span');

    if (row.status === 'saved') {
      chip.className = 'pc-state pc-state--ok';
      chip.innerHTML = '<i class="fas fa-circle-check"></i>' +
        (row.mode === 'update' ? 'Updated' : 'Created') + (row.contactId ? ' #' + row.contactId : '');
      chip.title = row.mode === 'update'
        ? 'The contact that already existed in Badaco was updated with this card'
        : 'This contact already exists in Badaco';
    } else if (row.status === 'saving') {
      chip.className = 'pc-state pc-state--busy';
      chip.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Sending…';
    } else if (row.issue) {
      chip.className = 'pc-state pc-state--bad';
      chip.innerHTML = '<i class="fas fa-circle-exclamation"></i>' + escapeHtml(ISSUE_TITLES[row.issue.code] || 'Not sent');
      chip.title = row.issue.message || '';
    } else if (missing.length) {
      chip.className = 'pc-state pc-state--warn';
      chip.innerHTML = '<i class="fas fa-triangle-exclamation"></i>Needs ' + escapeHtml(missing.join(', '));
      chip.title = row.failed
        ? 'The AI could not read this card: type the data by hand or upload a sharper photo.'
        : 'Badaco requires ' + missing.join(', ') + ' before creating the contact.';
    } else if (row.mode === 'update') {
      chip.className = 'pc-state pc-state--update';
      chip.innerHTML = '<i class="fas fa-rotate"></i>Will update' + (row.existingId ? ' #' + row.existingId : '');
      chip.title = 'This email is already in Badaco' + (row.existingName ? ' (' + row.existingName + ')' : '') +
        ': the card data will overwrite that contact instead of creating a new one.';
    } else {
      chip.className = 'pc-state pc-state--ready';
      chip.innerHTML = '<i class="fas fa-circle-check"></i>Ready';
      chip.title = 'Everything Badaco needs is filled in — press Send';
    }
    cell.appendChild(chip);

    // El motivo completo se lee sin pasar el ratón por encima.
    var detail = row.issue ? row.issue.message : (row.failed && missing.length ? 'The card could not be read — complete it by hand.' : '');
    if (detail) {
      var note = document.createElement('div');
      note.className = 'pc-state__detail';
      note.textContent = detail;
      cell.appendChild(note);
    }

    // Un correo repetido no es un callejón sin salida: la fila puede
    // actualizar el contacto que ya está en BADACO (y volver atrás).
    if (!row.saved && row.status !== 'saving') {
      var action = null;
      if (row.issue && row.issue.code === 'duplicate_badaco') {
        action = document.createElement('button');
        action.className = 'pc-state__action';
        action.innerHTML = '<i class="fas fa-rotate"></i>Update the existing one';
        action.title = 'Overwrite the contact already in Badaco' +
          (row.existingId ? ' (#' + row.existingId + ')' : '') + ' with this card';
        action.addEventListener('click', function () { setRowUpdate(row, true); });
      } else if (row.mode === 'update') {
        action = document.createElement('button');
        action.className = 'pc-state__action pc-state__action--undo';
        action.innerHTML = '<i class="fas fa-ban"></i>Do not update it';
        action.title = 'Leave the contact in Badaco untouched — this row will be reported as duplicated';
        action.addEventListener('click', function () { setRowUpdate(row, false); });
      }
      if (action) {
        action.type = 'button';
        action.disabled = state.sending;
        cell.appendChild(action);
      }
    }

    if (row.actionBtn) {
      var busy = row.status === 'saving';
      row.actionBtn.disabled = busy || row.status === 'saved' || state.sending;
      if (row.status === 'saved') {
        row.actionBtn.className = 'btn btn-success btn-sm pc-action';
        row.actionBtn.innerHTML = '<i class="fas fa-check"></i>';
        row.actionBtn.title = 'Contact already created in Badaco';
      } else {
        var updating = row.mode === 'update';
        row.actionBtn.className = 'btn btn-primary btn-sm pc-action';
        row.actionBtn.innerHTML = busy
          ? '<i class="fas fa-spinner fa-spin"></i>'
          : (updating ? '<i class="fas fa-rotate"></i>' : '<i class="fas fa-paper-plane"></i>');
        row.actionBtn.title = missing.length
          ? 'Send to Badaco — it still needs ' + missing.join(', ')
          : (updating
            ? 'Update the contact already in Badaco' + (row.existingId ? ' (#' + row.existingId + ')' : '') + ' with this card'
            : 'Create this contact in Badaco right now');
      }
    }
    if (row.formBtn) row.formBtn.disabled = row.status === 'saved' || state.sending;
  }

  /** Vuelca la respuesta del servidor (alta real o `dryRun`) sobre las filas. */
  function applyResults(targets, results) {
    var byRef = {};
    targets.forEach(function (row) { byRef[row.id] = row; });

    (results || []).forEach(function (result) {
      var row = byRef[result.ref];
      if (!row) return;
      if (result.status === 'created' || result.status === 'updated') {
        row.files = result.files || [];
        row.fileWarning = result.file_warning || null;
        row.images = { front: null, back: null }; // ya consumidas por el servidor
        renderFileCell(row);
        markSaved(row, result.contact_id, result.status === 'updated' ? 'update' : 'create');
      } else if (result.status === 'error') {
        row.existingId = result.existing_contact_id || null;
        row.existingName = result.existing_name || null;
        row.contactId = result.existing_contact_id || row.contactId;
        row.mode = 'create';
        row.issue = { code: result.code, message: result.message, fields: result.fields || [] };
        row.status = 'error';
        renderStatus(row);
      } else {
        // dryRun: el servidor dice si esta fila crearía o actualizaría.
        row.issue = null;
        row.mode = result.mode === 'update' ? 'update' : 'create';
        row.existingId = result.existing_contact_id || null;
        row.existingName = result.existing_name || null;
        row.status = 'ready';
        renderStatus(row);
      }
    });
  }

  /** Envía las filas indicadas a BADACO y reporta fila por fila lo que pasó. */
  async function sendRows(rows, options) {
    var opts = options || {};
    var targets = (rows || []).filter(function (row) { return !row.saved; });
    if (!targets.length || state.sending) return;

    state.sending = true;
    clearTimeout(validateTimer);
    targets.forEach(function (row) {
      row.status = 'saving';
      row.issue = null;
    });
    state.rows.forEach(renderStatus);
    updateBulkButton();
    setBulkText('<i class="fas fa-spinner fa-spin me-1"></i>Sending ' + targets.length + ' contact(s) to Badaco…');

    try {
      var res = await fetch('/api/tools/cards/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: targets.map(rowPayload) })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.result !== 1) {
        throw new Error(data.error || 'Badaco answered with an error (' + res.status + ')');
      }

      applyResults(targets, data.results);
      reportOutcome(targets, data.created || 0, data.updated || 0, opts);
    } catch (error) {
      console.error('send to badaco failed', error);
      // Ninguna fila llegó: todas quedan marcadas y se explica el motivo.
      targets.forEach(function (row) {
        row.status = 'error';
        row.issue = {
          code: 'network',
          fields: [],
          message: error.message || 'The request never reached Badaco. Check your connection and try again.'
        };
      });
      setBulkText('<i class="fas fa-circle-exclamation me-1"></i>Nothing was sent — Badaco did not answer.', 'bad');
      toast('Nothing was sent: ' + (error.message || 'connection error'), 2);
      openReportModal(targets, 'The request never reached Badaco, so no contact was created.');
    } finally {
      state.sending = false;
      state.rows.forEach(renderStatus);
      updateSummary();
    }
  }

  /** "3 created, 1 updated" — sólo se nombra lo que realmente pasó. */
  function outcomeText(created, updated) {
    var parts = [];
    if (created || !updated) parts.push(created + ' created');
    if (updated) parts.push(updated + ' updated');
    return parts.join(', ');
  }

  /** Resultado del envío: toast + texto en la barra + modal con lo que falló. */
  function reportOutcome(targets, created, updated, opts) {
    var failed = targets.filter(function (row) { return row.status === 'error'; });
    var done = outcomeText(created, updated);

    if (!failed.length) {
      setBulkText('<i class="fas fa-circle-check me-1"></i>' + done + ' in Badaco.', 'ok');
      toast(done + ' in Badaco', 1);
      return;
    }

    setBulkText('<i class="fas fa-triangle-exclamation me-1"></i>' + done + ' — ' +
      failed.length + ' row(s) could not be sent.', 'warn');
    toast(done + ', ' + failed.length + ' could not be sent', 2);

    // Con una sola fila el chip ya lo explica todo; el modal sería un estorbo.
    if (opts.single && failed.length === 1) {
      focusRowIssue(failed[0]);
      return;
    }
    openReportModal(failed, (created + updated)
      ? done + ' in Badaco. These rows stayed out:'
      : 'Nothing was saved in Badaco. These rows have problems:');
  }

  /** Comprobación previa (no crea nada): campos obligatorios y correos repetidos. */
  function scheduleValidation() {
    if (!BADACO) return;
    clearTimeout(validateTimer);
    validateTimer = setTimeout(function () { validateAll(true); }, 900);
  }

  async function validateAll(silent) {
    if (!BADACO || state.sending) return;

    // Lo que ya sabemos incompleto no se consulta: su aviso lo pinta el chip.
    state.rows.forEach(function (row) {
      if (!row.saved && missingFields(row).length && (!row.issue || row.issue.code === 'missing_fields')) {
        row.issue = null;
        row.status = 'draft';
        renderStatus(row);
      }
    });

    var targets = readyRows();
    if (!targets.length) {
      updateSummary();
      if (!silent) {
        setBulkText('Nothing to check yet: no row has Name, Email and Company filled in.', 'warn');
        toast('No row is complete enough to check', 2);
      }
      return;
    }

    if (!silent) setBulkText('<i class="fas fa-spinner fa-spin me-1"></i>Checking ' + targets.length + ' row(s) against Badaco…');
    try {
      var res = await fetch('/api/tools/cards/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, contacts: targets.map(rowPayload) })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.result !== 1) throw new Error(data.error || 'Check failed');

      applyResults(targets, data.results);
      if (!silent) {
        var blocked = data.failed || 0;
        var willUpdate = (data.results || []).filter(function (r) {
          return r.status === 'ready' && r.mode === 'update';
        }).length;
        setBulkText(blocked
          ? '<i class="fas fa-triangle-exclamation me-1"></i>' + blocked + ' row(s) would be rejected — see the Status column.'
          : '<i class="fas fa-circle-check me-1"></i>' + (data.ready || 0) + ' row(s) are ready to send' +
            (willUpdate ? ' (' + willUpdate + ' would update an existing contact).' : '.'),
          blocked ? 'warn' : 'ok');
        toast(blocked ? blocked + ' row(s) need attention' : 'All checked rows are ready', blocked ? 2 : 1);
      }
    } catch (error) {
      console.error('badaco check failed', error);
      if (!silent) {
        setBulkText('<i class="fas fa-circle-exclamation me-1"></i>The check could not be completed.', 'bad');
        toast('Could not check the rows against Badaco', 2);
      }
    } finally {
      updateSummary();
    }
  }

  /** "Send all": avisa antes si hay filas que se quedarían fuera. */
  function sendAll() {
    var pending = pendingRows();
    var ready = readyRows();
    var incomplete = pending.length - ready.length;

    if (!ready.length) {
      showModal(
        'None of the rows has Name, Email and Company filled in yet. Complete at least one row — the Status column tells you what each one is missing.',
        null, null,
        { title: 'Nothing to send', okText: 'Got it', cancelText: 'Close', type: 'warning' }
      );
      return;
    }

    // Sobrescribir fichas que ya están en BADACO se avisa siempre.
    var willUpdate = ready.filter(function (row) { return row.mode === 'update'; }).length;

    if (incomplete || willUpdate) {
      var lines = ['<b>' + ready.length + '</b> row(s) will be sent to Badaco.'];
      if (willUpdate) {
        lines.push('<b>' + willUpdate + '</b> of them will <b>overwrite</b> a contact that already exists ' +
          '(same email). Only what the card provides is replaced; the event, relationship and assignees stay as they are.');
      }
      if (incomplete) {
        lines.push('<b>' + incomplete + '</b> row(s) will stay here because they are missing Name, Email or Company.');
      }
      showModal(
        lines.join('<br>'),
        function () { sendRows(ready); },
        null,
        {
          title: incomplete ? 'Send ' + ready.length + ' of ' + pending.length + '?' : 'Send ' + ready.length + ' row(s)?',
          okText: 'Send ' + ready.length,
          cancelText: 'Cancel',
          type: 'warning'
        }
      );
      return;
    }

    sendRows(ready);
  }

  /* ---------------- Informe de lo que no se pudo subir ---------------- */

  /**
   * Modal con las filas rechazadas: motivo por fila y, para cada una, arreglarla
   * o borrarla. Reutiliza el aspecto de modalMixin (.modal-mixin/.modal-content).
   */
  function openReportModal(rows, intro) {
    var host = document.createElement('div');
    host.className = 'modal-mixin';

    var items = rows.map(function (row) {
      var who = [row.data.name, row.data.email, labelOf('companies', row.links.company) || row.data.company]
        .filter(Boolean).map(escapeHtml).join(' · ');
      return '' +
        '<li class="pc-report__item">' +
          '<div class="pc-report__head">' +
            '<span class="pc-report__file" title="' + escapeHtml(row.file || '') + '">' + escapeHtml(row.file || 'Card') + '</span>' +
            '<span class="pc-state pc-state--bad"><i class="fas fa-circle-exclamation"></i>' +
              escapeHtml(ISSUE_TITLES[row.issue && row.issue.code] || 'Not sent') + '</span>' +
          '</div>' +
          (who ? '<div class="pc-report__who">' + who + '</div>' : '') +
          '<div class="pc-report__msg">' + escapeHtml((row.issue && row.issue.message) || 'It could not be sent.') + '</div>' +
          '<div class="pc-report__row-actions">' +
            // El duplicado tiene salida propia: actualizar el que ya existe.
            (row.issue && row.issue.code === 'duplicate_badaco'
              ? '<button type="button" class="pc-report__link" data-update="' + row.id + '">' +
                '<i class="fas fa-rotate me-1"></i>Update the existing contact</button>'
              : '') +
            '<button type="button" class="pc-report__link" data-fix="' + row.id + '">' +
              '<i class="fas fa-pen me-1"></i>Edit this row</button>' +
            '<button type="button" class="pc-report__link pc-report__link--danger" data-drop="' + row.id + '">' +
              '<i class="fas fa-trash-can me-1"></i>Remove it</button>' +
          '</div>' +
        '</li>';
    }).join('');

    host.innerHTML =
      '<div class="modal-overlay"></div>' +
      '<div class="modal-content pc-report">' +
        '<div class="modal-icon">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e67e22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '</div>' +
        '<div class="modal-title">' + rows.length + ' row(s) were not sent to Badaco</div>' +
        '<div class="modal-message">' + escapeHtml(intro || '') + '</div>' +
        '<ul class="pc-report__list">' + items + '</ul>' +
        '<div class="modal-actions pc-report__actions">' +
          '<button type="button" class="modal-btn-cancel" data-act="close">Close</button>' +
          '<button type="button" class="pc-report__danger" data-act="drop-all">' +
            '<i class="fas fa-trash-can me-1"></i>Remove all ' + rows.length + '</button>' +
          '<button type="button" class="modal-btn-ok" style="background:#00586f" data-act="fix-first">' +
            '<i class="fas fa-pen me-1"></i>Fix them</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(host);

    function close() { if (host.parentNode) host.parentNode.removeChild(host); }

    host.querySelector('.modal-overlay').addEventListener('click', close);
    host.addEventListener('click', function (e) {
      var target = e.target.closest('[data-fix],[data-drop],[data-update],[data-act]');
      if (!target) return;

      var updateId = target.getAttribute('data-update');
      if (updateId) {
        var toUpdate = rowById(Number(updateId));
        if (toUpdate) {
          setRowUpdate(toUpdate, true);
          toast('Row marked to update the existing contact — press Send again', 1);
        }
        var updated = target.closest('.pc-report__item');
        if (updated) updated.remove();
        if (!host.querySelector('.pc-report__item')) close();
        return;
      }

      var fixId = target.getAttribute('data-fix');
      if (fixId) {
        close();
        focusRowIssue(rowById(Number(fixId)));
        return;
      }

      var dropId = target.getAttribute('data-drop');
      if (dropId) {
        removeRow(rowById(Number(dropId)));
        var item = target.closest('.pc-report__item');
        if (item) item.remove();
        if (!host.querySelector('.pc-report__item')) close();
        return;
      }

      var act = target.getAttribute('data-act');
      if (act === 'close') close();
      if (act === 'fix-first') {
        close();
        // La primera que siga en la tabla (el usuario pudo borrar alguna aquí).
        focusRowIssue(rows.find(function (row) { return state.rows.indexOf(row) !== -1; }));
      }
      if (act === 'drop-all') {
        close();
        showModal(
          'The ' + rows.length + ' row(s) that could not be sent will be removed from the table. ' +
          'The data on them will be lost — export to Excel first if you need it.',
          function () {
            rows.forEach(removeRow);
            toast(rows.length + ' row(s) removed', 1);
          },
          null,
          { title: 'Remove the failed rows?', okText: 'Remove them', cancelText: 'Keep them', type: 'danger' }
        );
      }
    });
  }

  function rowById(id) {
    return state.rows.find(function (row) { return row.id === id; });
  }

  /** Lleva al usuario a la celda que hay que corregir. */
  function focusRowIssue(row) {
    if (!row || !row.el) return;
    row.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.el.classList.remove('is-flash');
    void row.el.offsetWidth; // reinicia la animación
    row.el.classList.add('is-flash');

    var fields = (row.issue && row.issue.fields && row.issue.fields.length) ? row.issue.fields : missingFields(row);
    var target = null;
    if (fields[0] === 'Company') target = row.control_company;
    else if (fields[0] === 'Email') target = row.inputs.email;
    else if (fields[0] === 'Name') target = row.inputs.name;
    target = target || row.inputs.email || row.inputs.name;

    if (target) {
      setTimeout(function () {
        target.focus();
        if (target.select) target.select();
      }, 350);
    }
  }

  function removeRow(row) {
    if (!row) return;
    var idx = state.rows.indexOf(row);
    if (idx === -1) return;
    state.rows.splice(idx, 1);
    if (row.el && row.el.parentNode) row.el.parentNode.removeChild(row.el);
    if (state.pendingContact === row) state.pendingContact = null;
    if (state.pendingCompany === row) state.pendingCompany = null;

    if (!state.rows.length) {
      els.results.classList.add('d-none');
      els.empty.classList.remove('d-none');
    }
    updateMeta();
    updateSummary();
  }

  /* ---------------- Resumen ---------------- */

  function summaryPill(tone, icon, text) {
    return '<span class="pc-summary__pill pc-summary__pill--' + tone + '">' +
      '<i class="fas ' + icon + '"></i>' + escapeHtml(text) + '</span>';
  }

  function updateSummary() {
    if (!els.summary || !BADACO) return;

    var created = 0, updated = 0, ready = 0, willUpdate = 0, blocked = 0, rejected = 0;
    state.rows.forEach(function (row) {
      if (row.saved) {
        if (row.mode === 'update') updated++;
        else created++;
      } else if (row.issue) rejected++;
      else if (missingFields(row).length) blocked++;
      else {
        ready++;
        if (row.mode === 'update') willUpdate++;
      }
    });

    var parts = [];
    if (created) parts.push(summaryPill('ok', 'fa-circle-check', created + ' created in Badaco'));
    if (updated) parts.push(summaryPill('ok', 'fa-rotate', updated + ' updated in Badaco'));
    parts.push(summaryPill('ready', 'fa-paper-plane', ready + ' ready to send'));
    if (willUpdate) parts.push(summaryPill('warn', 'fa-rotate', willUpdate + ' will update an existing contact'));
    if (blocked) parts.push(summaryPill('warn', 'fa-triangle-exclamation', blocked + ' missing name, email or company'));
    if (rejected) parts.push(summaryPill('bad', 'fa-circle-exclamation', rejected + ' rejected — see Status'));
    els.summary.innerHTML = parts.join('');

    updateBulkButton();
  }

  function updateBulkButton() {
    if (!els.uploadAllBtn) return;
    var pending = pendingRows().length;
    var ready = readyRows().length;

    els.uploadAllBtn.disabled = state.sending || !ready;
    if (els.uploadAllLabel) {
      els.uploadAllLabel.textContent = state.sending
        ? 'Sending…'
        : 'Send all to Badaco' + (ready ? ' (' + ready + ')' : '');
    }
    if (els.recheckBtn) els.recheckBtn.disabled = state.sending || !pending;
    if (els.updateExisting) els.updateExisting.disabled = state.sending;
  }

  function setBulkText(html, tone) {
    if (!els.bulkText) return;
    els.bulkText.innerHTML = html;
    els.bulkText.className = 'pc-bulk__text' + (tone ? ' is-' + tone : '');
  }

  function toast(message, icon) {
    if (typeof window.launch_toast === 'function') window.launch_toast(message, icon == null ? 0 : icon);
  }

  function updateMeta() {
    els.meta.textContent = state.rows.length + ' card(s)';
  }

  function resetAll() {
    state.rows = [];
    state.pendingContact = null;
    state.pendingCompany = null;
    els.tableBody.innerHTML = '';
    els.results.classList.add('d-none');
    els.empty.classList.remove('d-none');
    if (els.summary) els.summary.innerHTML = '';
    setBulkText('Send every reviewed row to Badaco in one go. Rows with problems are reported back, never silently skipped.');
    updateBulkButton();
    clearFiles();
    // Vuelve a hacer falta la zona de carga.
    setCollapsed(false);
  }

  /* ---------------- Export ---------------- */

  /** Cabeceras: File + columnas visibles + ids de BADACO al final. */
  function exportHeaders() {
    var headers = ['File'];
    COLUMNS.forEach(function (column) { headers.push(column.label); });
    if (BADACO) {
      if (LINK_COLUMNS.company) headers.push('bmc_id');
      if (LINK_COLUMNS.jobLevel) headers.push('bmjl_id');
      if (LINK_COLUMNS.country) headers.push('country_code');
    }
    return headers;
  }

  function exportRows() {
    return state.rows.map(function (row) {
      var out = { File: row.file || '' };
      COLUMNS.forEach(function (column) {
        if (column.type === 'link' && BADACO) {
          // Se exporta la etiqueta legible; el id va en su propia columna.
          out[column.label] = labelOf(column.catalog, row.links[column.link]) || row.data[column.source] || '';
        } else {
          out[column.label] = row.data[column.type === 'link' ? column.source : column.key] || '';
        }
      });
      if (BADACO) {
        if (LINK_COLUMNS.company) out.bmc_id = row.links.company || '';
        if (LINK_COLUMNS.jobLevel) out.bmjl_id = row.links.jobLevel || '';
        if (LINK_COLUMNS.country) out.country_code = row.links.country || '';
      }
      return out;
    });
  }

  function exportResult(kind) {
    if (!state.rows.length) return;
    var base = 'processed_cards_' + new Date().toISOString().slice(0, 10);
    var headers = exportHeaders();
    var rows = exportRows();

    if (kind === 'xlsx') {
      if (typeof XLSX === 'undefined') {
        setStatus('Excel library not loaded. Use CSV instead.', 'error');
        return;
      }
      var aoa = [headers].concat(rows.map(function (r) {
        return headers.map(function (h) { return r[h]; });
      }));
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cards');
      var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), base + '.xlsx');
    } else if (kind === 'csv') {
      var quote = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      // BOM para que Excel abra el UTF-8 correctamente.
      var csv = '﻿' + headers.map(quote).join(',') + '\r\n' +
        rows.map(function (r) {
          return headers.map(function (h) { return quote(r[h]); }).join(',');
        }).join('\r\n') + '\r\n';
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    }
  }

  function saveBlob(blob, filename) {
    if (typeof window.saveAs === 'function') {
      window.saveAs(blob, filename);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- Helpers ---------------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
  }

  /* ---------------- Wire up ---------------- */

  function bind() {
    els.browseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      els.fileInput.click();
    });
    els.fileInput.addEventListener('change', function () {
      if (this.files && this.files.length) addFiles(this.files);
      this.value = '';
    });
    els.clearBtn.addEventListener('click', clearFiles);
    els.processBtn.addEventListener('click', process);
    els.resetBtn.addEventListener('click', function () {
      // Vaciar la tabla con filas sin subir es la forma fácil de perder trabajo.
      var pending = BADACO ? pendingRows().length : 0;
      if (!pending) { resetAll(); return; }
      showModal(
        '<b>' + pending + '</b> row(s) have not been created in Badaco yet and will be lost. ' +
        'Send them first, or download the Excel if you want to keep them.',
        resetAll, null,
        { title: 'Clear the table?', okText: 'Clear anyway', cancelText: 'Go back', type: 'danger' }
      );
    });

    if (els.uploadAllBtn) els.uploadAllBtn.addEventListener('click', sendAll);
    if (els.recheckBtn) els.recheckBtn.addEventListener('click', function () { validateAll(false); });

    // Plegar / desplegar la sección de ingesta.
    if (els.collapseBtn) els.collapseBtn.addEventListener('click', function () { setCollapsed(true); });
    if (els.showUploadBtn) {
      els.showUploadBtn.addEventListener('click', function () {
        setCollapsed(false);
        if (els.inputPanel) els.inputPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    // Interruptor general de "actualizar lo que ya existe": manda sobre las
    // decisiones sueltas de cada fila, así que las limpia y vuelve a comprobar.
    if (els.updateExisting) {
      els.updateExisting.addEventListener('change', function () {
        state.updateExisting = this.checked;
        if (els.updateExistingWrap) els.updateExistingWrap.classList.toggle('is-on', this.checked);
        state.rows.forEach(function (row) {
          if (row.saved) return;
          row.updateExisting = null;
          row.issue = null;
          row.mode = 'create';
          row.status = missingFields(row).length ? 'draft' : 'ready';
          renderStatus(row);
        });
        updateSummary();
        validateAll(true);
      });
    }

    // Delegación: quitar archivo / marcar dorso.
    els.fileList.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove]');
      if (btn) removeFile(Number(btn.getAttribute('data-remove')));
    });
    els.fileList.addEventListener('change', function (e) {
      var check = e.target.closest('[data-back]');
      if (!check) return;
      var entry = state.files.find(function (f) { return f.id === Number(check.getAttribute('data-back')); });
      if (entry) entry.isBack = check.checked;
      renderFileList();
    });

    // Drag & drop
    ['dragenter', 'dragover'].forEach(function (evt) {
      els.dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        els.dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      els.dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        els.dropzone.classList.remove('is-dragover');
      });
    });
    els.dropzone.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addFiles(files);
    });
    els.dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput.click();
      }
    });

    // Export buttons
    document.querySelectorAll('[data-export]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        exportResult(this.getAttribute('data-export'));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    if (!els.dropzone) return; // no estamos en la página
    if (BADACO) buildCatalogs();
    bind();
  });
})();
