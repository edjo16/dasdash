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
    rows: [],  // { file, data, match, links, saved }
    processing: false,
    pendingContactRow: -1,
    pendingCompanyRow: -1,
    catalogsDirty: false // hay una empresa nueva que el servidor aún no tiene en caché
  };
  var nextId = 1;

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
          row = makeRow(fileLabel, result.data, result.match);
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
      if (failures) {
        setStatus('Done with ' + failures + ' failed card(s). Check the table.', 'error');
      } else {
        setStatus('Done — ' + cards.length + ' card(s) processed.', 'success');
        setTimeout(hideStatus, 2000);
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
    return { data: data.data || {}, match: data.match || null };
  }

  /** Construye una fila del modelo a partir de la respuesta del servidor. */
  function makeRow(file, data, match) {
    var row = { file: file, data: {}, match: {}, links: {}, saved: false, failed: false, el: null };
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
    tdFile.textContent = row.file || '';
    tdFile.title = row.file || '';
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
      var tdActions = document.createElement('td');
      tdActions.className = 'pc-table__actions text-center';
      var badacoBtn = document.createElement('button');
      badacoBtn.type = 'button';
      badacoBtn.className = 'btn btn-outline-primary btn-sm';
      badacoBtn.title = 'Create this contact in Badaco';
      badacoBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
      badacoBtn.addEventListener('click', function () { openBadacoContact(row); });
      row.actionBtn = badacoBtn;
      tdActions.appendChild(badacoBtn);
      tr.appendChild(tdActions);
    }

    els.tableBody.appendChild(tr);
    updateSummary();
  }

  function textInput(row, key) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'pc-table__input';
    input.value = row.data[key] || '';
    input.addEventListener('input', function () {
      row.data[key] = this.value;
      // Todo menos el nombre alimenta alguna sugerencia: el puesto da el job
      // level; email/web dan la empresa; dirección y teléfonos dan el país.
      if (key !== 'name') scheduleRematch(row);
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
      control.className = 'pc-link__select';
      control.setAttribute('list', 'pcCompanyList');
      control.placeholder = 'Link a Badaco company';
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

    var chip = document.createElement('span');
    chip.className = 'pc-conf pc-conf--' + confidence;
    chip.textContent = manual ? 'Selected' : confidenceLabel(confidence, match.reason);
    chip.title = manual ? 'Chosen manually' : confidenceTitle(confidence, match);
    meta.appendChild(chip);

    // Alternativas que no son la ya seleccionada.
    (match.options || []).forEach(function (option) {
      if (linked && String(option.id) === String(linked)) return;
      var suggestion = document.createElement('button');
      suggestion.type = 'button';
      suggestion.className = 'pc-suggest';
      suggestion.textContent = option.label;
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
    state.pendingContactRow = state.rows.indexOf(row);
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
    state.pendingCompanyRow = state.rows.indexOf(row);
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

    var row = state.rows[state.pendingCompanyRow];
    state.pendingCompanyRow = -1;
    if (!row || !LINK_COLUMNS.company) return;

    row.links.company = String(company.bmc_id);
    var control = row['control_company'];
    if (control) control.value = labelOf('companies', company.bmc_id);
    refreshLinkCell(row, LINK_COLUMNS.company);
  };

  /** El modal de contacto avisa aquí cuando guarda: se marca la fila. */
  window._badacoContactRefresh = function () {
    var row = state.rows[state.pendingContactRow];
    state.pendingContactRow = -1;
    if (!row) return;

    row.saved = true;
    if (row.el) row.el.classList.add('is-saved');
    if (row.actionBtn) {
      row.actionBtn.className = 'btn btn-success btn-sm';
      row.actionBtn.innerHTML = '<i class="fas fa-check"></i>';
      row.actionBtn.title = 'Contact already created in Badaco';
      row.actionBtn.disabled = true;
    }
    updateSummary();
  };

  /* ---------------- Resumen ---------------- */

  function rowIsReady(row) {
    if (row.failed) return false;
    if (!row.data.name || !row.data.email) return false;
    return !LINK_COLUMNS.company || !!row.links.company;
  }

  function updateSummary() {
    if (!els.summary || !BADACO) return;

    var ready = 0, saved = 0, blocked = 0;
    state.rows.forEach(function (row) {
      if (row.saved) saved++;
      else if (rowIsReady(row)) ready++;
      else blocked++;
    });

    var parts = [];
    if (saved) parts.push('<span class="pc-summary__ok"><i class="fas fa-check-circle me-1"></i>' + saved + ' created</span>');
    parts.push('<span class="pc-summary__ready"><i class="fas fa-user-plus me-1"></i>' + ready + ' ready to create</span>');
    if (blocked) parts.push('<span class="pc-summary__warn"><i class="fas fa-triangle-exclamation me-1"></i>' + blocked + ' need a name, email or company</span>');
    els.summary.innerHTML = parts.join('');
  }

  function updateMeta() {
    els.meta.textContent = state.rows.length + ' card(s)';
  }

  function resetAll() {
    state.rows = [];
    state.pendingContactRow = -1;
    state.pendingCompanyRow = -1;
    els.tableBody.innerHTML = '';
    els.results.classList.add('d-none');
    els.empty.classList.remove('d-none');
    if (els.summary) els.summary.innerHTML = '';
    clearFiles();
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
    els.resetBtn.addEventListener('click', resetAll);

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
