/* ═══════════════════════════════════════════════════════════
   Document Translations — nucleo compartido
   -----------------------------------------------------------
   Toda la interfaz de traduccion de documentos (modales, polling,
   listado, toasts) vive aqui. Es agnostica del modulo: no sabe si
   el archivo pertenece a un approval o a un caso de CRM.

   Cada modulo crea su instancia describiendo unicamente como se
   identifica un documento en sus endpoints:

     window.DocumentTranslations.create({
       endpointBase: '/crm-translate',
       docParams:   function (ref) { return { crm_id: ref.crmId, msg_id: ref.msgId, filename: ref.filename }; },
       scopeParams: function (ref) { return { crm_id: ref.crmId }; },
       onChanged:   function (ref) { ...refrescar la vista del modulo... }
     })

   `ref` es un objeto opaco para el nucleo: lo construye el modulo y
   se lo devuelve tal cual a docParams/scopeParams/onChanged. Lo unico
   que el nucleo lee de el es `filename`, para los titulos.

   El backend procesa la traduccion en background, asi que aqui solo
   se encola y se hace polling del estado.

   Los estilos son los de /css/document-translations.css (clases atr-*).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 4000;
  var POLL_MAX_ATTEMPTS = 450; // ~30 min

  var MODAL_IDS = ['dtrTranslateModal', 'dtrTranslationsModal', 'dtrPreviewModal'];

  // Markup e ids son unicos en la pagina; `activeInstance` decide a que
  // instancia van los eventos cuando hay mas de un modulo cargado.
  var markupReady = false;
  var activeInstance = null;

  // ── Utilidades ───────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  /** Icono FontAwesome segun la extension del archivo de origen. */
  function fileIconFor(filename) {
    var name = String(filename || '').toLowerCase();
    if (/\.pdf$/.test(name)) return 'fa-file-pdf';
    if (/\.(docx?|dotx?|docm|dotm)$/.test(name)) return 'fa-file-word';
    if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return 'fa-file-image';
    if (/\.(odt|ott|rtf|txt|md|markdown|log)$/.test(name)) return 'fa-file-alt';
    if (/\.csv$/.test(name)) return 'fa-file-csv';
    return 'fa-file';
  }

  function fileLabel(filename) {
    return '<i class="fas ' + fileIconFor(filename) + ' me-1"></i>' + escapeHtml(filename);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (e) { return ''; }
  }

  function toQuery(params) {
    return Object.keys(params || {})
      .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      })
      .join('&');
  }

  function request(url, options) {
    var opts = options || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function openModal(id) {
    var modal = el(id);
    if (modal) modal.classList.add('open');
  }

  function closeModal(id) {
    var modal = el(id);
    if (modal) modal.classList.remove('open');
  }

  // ── Markup (inyectado una sola vez en la pagina) ─────────
  function ensureMarkup() {
    if (markupReady) return;
    markupReady = true;

    var wrapper = document.createElement('div');
    wrapper.innerHTML = [
      // Modal: nueva traduccion
      '<div id="dtrTranslateModal" class="app-modal atr-modal">',
      '  <div class="app-modal-dialog" style="max-width:520px;">',
      '    <div class="app-modal-header">',
      '      <h6 class="app-modal-title"><i class="fas fa-language me-2"></i>Translate document</h6>',
      '      <button type="button" class="app-modal-close" data-atr-close="dtrTranslateModal" aria-label="Close">&times;</button>',
      '    </div>',
      '    <div class="app-modal-body">',
      '      <p class="atr-filename" id="atrSourceFilename"></p>',
      '      <div class="atr-field">',
      '        <label class="atr-label" for="atrSourceLang">Source language</label>',
      '        <select id="atrSourceLang" class="form-select form-select-sm"></select>',
      '      </div>',
      '      <div class="atr-field">',
      '        <label class="atr-label" for="atrTargetLang">Target language</label>',
      '        <select id="atrTargetLang" class="form-select form-select-sm"></select>',
      '        <small id="atrTargetHint" class="atr-hint"></small>',
      '      </div>',
      '      <div id="atrCreateFeedback" class="atr-feedback"></div>',
      '    </div>',
      '    <div class="app-modal-footer">',
      '      <button type="button" class="btn btn-outline-secondary btn-sm" data-atr-close="dtrTranslateModal">Cancel</button>',
      '      <button type="button" id="atrSubmitBtn" class="btn btn-sm atr-btn-primary">',
      '        <i class="fas fa-language me-1"></i>Translate',
      '      </button>',
      '    </div>',
      '  </div>',
      '</div>',
      // Modal: traducciones existentes
      '<div id="dtrTranslationsModal" class="app-modal atr-modal">',
      '  <div class="app-modal-dialog" style="max-width:680px;">',
      '    <div class="app-modal-header">',
      '      <h6 class="app-modal-title"><i class="fas fa-globe me-2"></i>Translations</h6>',
      '      <button type="button" class="app-modal-close" data-atr-close="dtrTranslationsModal" aria-label="Close">&times;</button>',
      '    </div>',
      '    <div class="app-modal-body">',
      '      <p class="atr-filename" id="atrListFilename"></p>',
      '      <div id="atrList" class="atr-list"></div>',
      '    </div>',
      '    <div class="app-modal-footer">',
      '      <button type="button" class="btn btn-outline-secondary btn-sm" data-atr-close="dtrTranslationsModal">Close</button>',
      '      <button type="button" id="atrNewFromListBtn" class="btn btn-sm atr-btn-primary">',
      '        <i class="fas fa-plus me-1"></i>New translation',
      '      </button>',
      '    </div>',
      '  </div>',
      '</div>',
      // Modal: preview del texto traducido (paso previo a generar el documento)
      '<div id="dtrPreviewModal" class="app-modal atr-modal">',
      '  <div class="app-modal-dialog atr-preview-dialog">',
      '    <div class="app-modal-header">',
      '      <h6 class="app-modal-title"><i class="fas fa-eye me-2"></i>Translation preview</h6>',
      '      <button type="button" class="app-modal-close" data-atr-close="dtrPreviewModal" aria-label="Close">&times;</button>',
      '    </div>',
      '    <div class="app-modal-body atr-preview-body">',
      '      <p class="atr-filename" id="atrPreviewFilename"></p>',
      '      <p class="atr-hint" id="atrPreviewHint"></p>',
      '      <textarea id="atrPreviewText" class="atr-preview-text" spellcheck="false"></textarea>',
      '      <div class="atr-preview-meta">',
      '        <span id="atrPreviewCount"></span>',
      '        <span id="atrPreviewDirty" class="atr-preview-dirty"></span>',
      '      </div>',
      '      <div id="atrPreviewFeedback" class="atr-feedback"></div>',
      '    </div>',
      '    <div class="app-modal-footer">',
      '      <div id="atrPreviewDocLinks" class="atr-preview-links"></div>',
      '      <button type="button" class="btn btn-outline-secondary btn-sm" data-atr-close="dtrPreviewModal">Close</button>',
      '      <button type="button" id="atrGenerateBtn" class="btn btn-sm atr-btn-primary">',
      '        <i class="fas fa-file-pdf me-1"></i>Generate document',
      '      </button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);

    // Cierre por boton y por click en el backdrop.
    document.querySelectorAll('[data-atr-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(this.getAttribute('data-atr-close'));
      });
    });
    MODAL_IDS.forEach(function (id) {
      var modal = el(id);
      if (!modal) return;
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal(id);
      });
    });

    el('atrSubmitBtn').addEventListener('click', function () {
      if (activeInstance) activeInstance.submitTranslation();
    });
    el('atrNewFromListBtn').addEventListener('click', function () {
      if (!activeInstance) return;
      closeModal('dtrTranslationsModal');
      activeInstance.openTranslateModal(activeInstance.currentRef);
    });
    el('atrTargetLang').addEventListener('change', renderTargetHint);
    el('atrGenerateBtn').addEventListener('click', function () {
      if (activeInstance) activeInstance.generateDocument();
    });
    el('atrPreviewText').addEventListener('input', renderPreviewMeta);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      MODAL_IDS.forEach(function (id) {
        var modal = el(id);
        if (modal && modal.classList.contains('open')) closeModal(id);
      });
    });
  }

  /* Idiomas de escritura derecha-a-izquierda, para orientar el textarea. */
  var RTL_LANGS = { ara: 1, heb: 1 };

  /** Contador de caracteres y aviso de cambios sin generar. */
  function renderPreviewMeta() {
    var textarea = el('atrPreviewText');
    var count = el('atrPreviewCount');
    var dirty = el('atrPreviewDirty');
    if (!textarea || !count) return;

    var value = textarea.value;
    count.textContent = value.length.toLocaleString() + ' characters';

    if (!dirty) return;
    var changed = activeInstance
      && activeInstance.previewOriginalText !== null
      && value !== activeInstance.previewOriginalText;
    dirty.innerHTML = changed
      ? '<i class="fas fa-pen me-1"></i>Edited — your changes are saved when you generate the document.'
      : '';
  }

  /** Avisa antes de encolar si el idioma no tiene fuente PDF instalada. */
  function renderTargetHint() {
    var select = el('atrTargetLang');
    var hint = el('atrTargetHint');
    if (!select || !hint) return;

    var option = select.options[select.selectedIndex];
    if (option && option.getAttribute('data-unsupported') === '1') {
      hint.className = 'atr-hint atr-hint--warn';
      hint.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>' +
        'This language needs a Unicode font on the server to render the PDF. ' +
        'Ask IT to install it before translating.';
    } else {
      hint.className = 'atr-hint';
      hint.textContent = 'The text is translated first so you can review it. '
        + 'Nothing is written next to the original until you generate the document.';
    }
  }

  function fillLanguageSelects(data) {
    var sourceSelect = el('atrSourceLang');
    var targetSelect = el('atrTargetLang');
    var support = data.targetSupport || {};

    sourceSelect.innerHTML = Object.keys(data.sourceLanguages || {}).map(function (name) {
      var code = data.sourceLanguages[name];
      return '<option value="' + escapeHtml(code) + '"' + (code === 'auto' ? ' selected' : '') + '>' +
        escapeHtml(name) + '</option>';
    }).join('');

    targetSelect.innerHTML = Object.keys(data.targetLanguages || {}).map(function (name) {
      var code = data.targetLanguages[name];
      var info = support[code];
      var unsupported = info && info.supported === false;
      return '<option value="' + escapeHtml(code) + '"' +
        (code === 'eng' ? ' selected' : '') +
        (unsupported ? ' data-unsupported="1"' : '') + '>' +
        escapeHtml(name) + (unsupported ? ' (PDF font not installed)' : '') +
        '</option>';
    }).join('');

    renderTargetHint();
  }

  function setFeedbackIn(boxId, message, kind) {
    var box = el(boxId);
    if (!box) return;
    if (!message) {
      box.textContent = '';
      box.className = 'atr-feedback';
      return;
    }
    box.className = 'atr-feedback atr-feedback--' + (kind || 'info');
    box.innerHTML = message;
  }

  function setFeedback(message, kind) {
    setFeedbackIn('atrCreateFeedback', message, kind);
  }

  function setPreviewFeedback(message, kind) {
    setFeedbackIn('atrPreviewFeedback', message, kind);
  }

  function statusBadge(status) {
    var map = {
      pending: ['atr-badge--wait', 'fa-clock', 'Queued'],
      processing: ['atr-badge--wait', 'fa-spinner fa-spin', 'Translating'],
      translated: ['atr-badge--review', 'fa-eye', 'Ready to review'],
      completed: ['atr-badge--ok', 'fa-check', 'Document ready'],
      failed: ['atr-badge--error', 'fa-times', 'Failed']
    };
    var cfg = map[status] || map.pending;
    return '<span class="atr-badge ' + cfg[0] + '"><i class="fas ' + cfg[1] + ' me-1"></i>' + cfg[2] + '</span>';
  }

  /** Aviso no bloqueante al terminar el job. */
  function notifyFinished(translation) {
    var ok = translation.status === 'translated' || translation.status === 'completed';
    var toast = document.createElement('div');
    toast.className = 'atr-toast ' + (ok ? 'atr-toast--ok' : 'atr-toast--error');
    toast.innerHTML =
      '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + ' me-2"></i>' +
      '<div><strong>' + escapeHtml(translation.source_filename) + '</strong><br>' +
      (ok
        ? 'Translation to ' + escapeHtml(translation.target_lang_name || translation.target_lang) +
          ' is ready to review.'
        : escapeHtml(translation.error_message || 'Translation failed.')) +
      '</div>';

    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('atr-toast--visible'); }, 20);
    setTimeout(function () {
      toast.classList.remove('atr-toast--visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 6000);
  }

  // ── Instancia por modulo ─────────────────────────────────
  function create(config) {
    var endpointBase = String(config.endpointBase || '').replace(/\/$/, '');
    var docParams = config.docParams || function (ref) { return ref; };
    var scopeParams = config.scopeParams || function (ref) { return ref; };
    var onChanged = config.onChanged || function () {};

    var languagesCache = null;
    var pollTimers = {};

    var api = {
      currentRef: null,
      // Texto tal y como vino del servidor, para detectar ediciones.
      previewOriginalText: null,
      previewTranslation: null,
      openTranslateModal: openTranslateModal,
      openTranslationsModal: openTranslationsModal,
      openPreview: openPreview,
      generateDocument: generateDocument,
      resumePolling: startPolling,
      submitTranslation: submitTranslation
    };

    function loadLanguages() {
      if (languagesCache) return Promise.resolve(languagesCache);
      return request(endpointBase + '/languages').then(function (data) {
        languagesCache = data;
        return data;
      });
    }

    // ── Crear traduccion ───────────────────────────────────
    function openTranslateModal(ref) {
      if (!ref || !ref.filename) return;
      ensureMarkup();
      activeInstance = api;
      api.currentRef = ref;

      el('atrSourceFilename').innerHTML = fileLabel(ref.filename);
      setFeedback('');
      el('atrSubmitBtn').disabled = true;
      openModal('dtrTranslateModal');

      loadLanguages().then(function (data) {
        fillLanguageSelects(data);
        el('atrSubmitBtn').disabled = false;
      }).catch(function (err) {
        setFeedback('Could not load the language list: ' + escapeHtml(err.message), 'error');
      });
    }

    function submitTranslation() {
      var btn = el('atrSubmitBtn');
      var ref = api.currentRef;
      var targetLang = el('atrTargetLang').value;
      var sourceLang = el('atrSourceLang').value;

      if (!ref) return;
      if (!targetLang) {
        setFeedback('Please choose a target language.', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Queueing...';
      setFeedback('');

      var body = docParams(ref);
      body.target_lang = targetLang;
      body.source_lang = sourceLang;

      request(endpointBase + '/create', { method: 'POST', body: body })
        .then(function (data) {
          var translation = data.translation || {};
          var message = data.alreadyQueued
            ? 'This translation is already in progress.'
            : 'Translation queued. It runs in the background — you can keep working. '
              + 'When it finishes you can review the text and then generate the document.';

          setFeedback('<i class="fas fa-check-circle me-1"></i>' + message, 'success');
          startPolling(ref, translation.id);

          setTimeout(function () {
            closeModal('dtrTranslateModal');
            openTranslationsModal(ref);
          }, 1200);
        })
        .catch(function (err) {
          setFeedback('<i class="fas fa-exclamation-circle me-1"></i>' + escapeHtml(err.message), 'error');
        })
        .finally(function () {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-language me-1"></i>Translate';
        });
    }

    // ── Preview y generacion del documento ─────────────────

    /**
     * Abre el texto traducido para revisarlo. Es el paso intermedio del
     * flujo: hasta que no se pulsa "Generate document" no se escribe nada
     * junto al archivo original.
     */
    function openPreview(ref, translationId) {
      if (!ref || !translationId) return;
      ensureMarkup();
      activeInstance = api;
      api.currentRef = ref;
      api.previewOriginalText = null;
      api.previewTranslation = null;

      var textarea = el('atrPreviewText');
      el('atrPreviewFilename').innerHTML = fileLabel(ref.filename);
      el('atrPreviewHint').textContent = 'Loading the translated text...';
      el('atrPreviewDocLinks').innerHTML = '';
      el('atrPreviewCount').textContent = '';
      el('atrPreviewDirty').innerHTML = '';
      textarea.value = '';
      textarea.disabled = true;
      textarea.dir = 'auto';
      el('atrGenerateBtn').disabled = true;
      setPreviewFeedback('');
      openModal('dtrPreviewModal');

      var query = scopeParams(ref);
      query.id = translationId;

      request(endpointBase + '/preview?' + toQuery(query))
        .then(function (data) {
          var t = data.translation || {};
          api.previewTranslation = t;
          api.previewOriginalText = data.text || '';

          textarea.value = api.previewOriginalText;
          textarea.disabled = false;
          textarea.dir = RTL_LANGS[t.target_lang] ? 'rtl' : 'ltr';

          el('atrPreviewHint').textContent = t.has_document
            ? 'This translation already has a document. Edit the text and generate it '
              + 'again to replace it.'
            : 'Review the machine translation and correct it if needed, then generate '
              + 'the document. It is saved next to the original file.';

          renderPreviewDocLinks(t);
          renderPreviewMeta();
          el('atrGenerateBtn').innerHTML = t.has_document
            ? '<i class="fas fa-sync-alt me-1"></i>Regenerate document'
            : '<i class="fas fa-file-pdf me-1"></i>Generate document';
          el('atrGenerateBtn').disabled = false;
        })
        .catch(function (err) {
          el('atrPreviewHint').textContent = '';
          setPreviewFeedback(
            '<i class="fas fa-exclamation-circle me-1"></i>' + escapeHtml(err.message), 'error');
        });
    }

    function renderPreviewDocLinks(translation) {
      var box = el('atrPreviewDocLinks');
      if (!box) return;
      box.innerHTML = translation && translation.has_document
        ? '<a class="atr-action" href="' + escapeHtml(translation.file_url) + '" target="_blank" ' +
          'title="Open current document"><i class="fas fa-external-link-alt"></i></a>' +
          '<a class="atr-action" href="' + escapeHtml(translation.download_url) + '" ' +
          'title="Download current document"><i class="fas fa-download"></i></a>'
        : '';
    }

    function generateDocument() {
      var btn = el('atrGenerateBtn');
      var textarea = el('atrPreviewText');
      var ref = api.currentRef;
      var translation = api.previewTranslation;
      if (!ref || !translation) return;

      var text = textarea.value;
      if (!text.trim()) {
        setPreviewFeedback('The translated text cannot be empty.', 'error');
        return;
      }

      var label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';
      setPreviewFeedback('');

      var body = scopeParams(ref);
      body.id = translation.id;
      body.text = text;

      request(endpointBase + '/generate', { method: 'POST', body: body })
        .then(function (data) {
          var t = data.translation || {};
          api.previewTranslation = t;
          api.previewOriginalText = text;

          setPreviewFeedback(
            '<i class="fas fa-check-circle me-1"></i>Document generated and saved next to ' +
            'the original file.', 'success');
          renderPreviewDocLinks(t);
          renderPreviewMeta();
          btn.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Regenerate document';

          var listModal = el('dtrTranslationsModal');
          if (listModal && listModal.classList.contains('open')) loadTranslations(ref);
          onChanged(ref);
        })
        .catch(function (err) {
          setPreviewFeedback(
            '<i class="fas fa-exclamation-circle me-1"></i>' + escapeHtml(err.message), 'error');
          btn.innerHTML = label;
        })
        .finally(function () {
          btn.disabled = false;
        });
    }

    // ── Polling del job ────────────────────────────────────
    function startPolling(ref, translationId) {
      if (!translationId || pollTimers[translationId]) return;

      var attempts = 0;
      pollTimers[translationId] = setInterval(function () {
        attempts += 1;
        if (attempts > POLL_MAX_ATTEMPTS) {
          stopPolling(translationId);
          return;
        }

        var query = scopeParams(ref);
        query.id = translationId;

        request(endpointBase + '/status?' + toQuery(query))
          .then(function (data) {
            var t = data.translation;
            if (!t) return;

            // `translated` es terminal para el motor: a partir de ahi el
            // avance depende de que el usuario genere el documento.
            if (t.status === 'translated' || t.status === 'completed' || t.status === 'failed') {
              stopPolling(translationId);
              notifyFinished(t);
              // Refrescar la lista abierta y la vista del modulo.
              var listModal = el('dtrTranslationsModal');
              if (listModal && listModal.classList.contains('open') && activeInstance === api) {
                loadTranslations(ref);
              }
              onChanged(ref);
            }
          })
          .catch(function () { /* red intermitente: se reintenta en el siguiente tick */ });
      }, POLL_INTERVAL_MS);
    }

    function stopPolling(translationId) {
      if (pollTimers[translationId]) {
        clearInterval(pollTimers[translationId]);
        delete pollTimers[translationId];
      }
    }

    // ── Listado de traducciones ────────────────────────────
    function openTranslationsModal(ref) {
      if (!ref || !ref.filename) return;
      ensureMarkup();
      activeInstance = api;
      api.currentRef = ref;

      el('atrListFilename').innerHTML = fileLabel(ref.filename);
      el('atrList').innerHTML = '<div class="atr-loading"><i class="fas fa-spinner fa-spin me-2"></i>Loading translations...</div>';
      openModal('dtrTranslationsModal');
      loadTranslations(ref);
    }

    function loadTranslations(ref) {
      request(endpointBase + '/list?' + toQuery(docParams(ref)))
        .then(function (data) {
          renderTranslations(data.translations || [], ref);
        })
        .catch(function (err) {
          el('atrList').innerHTML =
            '<div class="atr-empty">Could not load translations: ' + escapeHtml(err.message) + '</div>';
        });
    }

    function renderTranslations(translations, ref) {
      var list = el('atrList');

      if (!translations.length) {
        list.innerHTML =
          '<div class="atr-empty"><i class="fas fa-globe atr-empty__icon"></i>' +
          '<p>No translations yet for this file.</p></div>';
        return;
      }

      list.innerHTML = translations.map(function (t) {
        var meta = [
          t.created_by_name ? escapeHtml(t.created_by_name) : null,
          formatDate(t.created_at),
          t.has_document && t.page_count ? t.page_count + ' page(s)' : null,
          !t.has_document && t.char_count ? t.char_count.toLocaleString() + ' characters' : null
        ].filter(Boolean).join(' · ');

        var actions = '';
        if (t.has_preview) {
          actions +=
            '<button type="button" class="atr-action" data-atr-preview="' + t.id + '" ' +
            'title="' + (t.has_document ? 'Review text / regenerate' : 'Review text and generate the document') + '">' +
            '<i class="fas fa-eye"></i></button>';
        }
        if (t.has_document) {
          actions +=
            '<a class="atr-action" href="' + escapeHtml(t.file_url) + '" target="_blank" title="Open translation">' +
            '<i class="fas fa-external-link-alt"></i></a>' +
            '<a class="atr-action" href="' + escapeHtml(t.download_url) + '" title="Download">' +
            '<i class="fas fa-download"></i></a>';
        }
        actions +=
          '<button type="button" class="atr-action atr-action--danger" data-atr-delete="' + t.id + '" title="Remove from list">' +
          '<i class="fas fa-trash"></i></button>';

        var error = t.status === 'failed' && t.error_message
          ? '<div class="atr-item__error">' + escapeHtml(t.error_message) + '</div>'
          : '';

        return '<div class="atr-item">' +
          '<div class="atr-item__main">' +
          '<div class="atr-item__title">' +
          escapeHtml(t.target_lang_name || t.target_lang) +
          ' <span class="atr-item__version">v' + t.version + '</span> ' +
          statusBadge(t.status) +
          '</div>' +
          '<div class="atr-item__meta">' + escapeHtml(meta) + '</div>' +
          error +
          '</div>' +
          '<div class="atr-item__actions">' + actions + '</div>' +
          '</div>';
      }).join('');

      // Reanudar el polling de los que siguen en curso (p. ej. tras recargar).
      translations.forEach(function (t) {
        if (t.status === 'pending' || t.status === 'processing') {
          startPolling(ref, t.id);
        }
      });

      list.querySelectorAll('[data-atr-preview]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openPreview(ref, Number(this.getAttribute('data-atr-preview')));
        });
      });

      list.querySelectorAll('[data-atr-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-atr-delete');
          if (!window.confirm('Remove this translation from the list?')) return;

          var body = scopeParams(ref);
          body.id = Number(id);

          request(endpointBase + '/delete', { method: 'POST', body: body })
            .then(function () {
              loadTranslations(ref);
              onChanged(ref);
            })
            .catch(function (err) {
              window.alert('Could not remove the translation: ' + err.message);
            });
        });
      });
    }

    return api;
  }

  window.DocumentTranslations = { create: create };
})();
