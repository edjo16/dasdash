/**
 * Frontend de la herramienta "Multi-Language Translator" (módulo Tools).
 *
 * Flujo: subir archivo -> POST /api/tools/extract (OCR/PDF) ->
 * POST /api/tools/translate -> mostrar y exportar.
 *
 * Exportación 100% en cliente, reutilizando lo que ya carga el proyecto
 * (FileSaver) y APIs nativas del navegador (impresión para PDF, blob HTML
 * para Word). Sin dependencias nuevas.
 */
(function () {
  'use strict';

  var els = {};
  var state = {
    file: null,
    previewUrl: null,
    extracted: '',
    translated: '',
    detectedLang: null,
    history: []
  };

  // Rango RTL (hebreo + árabe) para orientar los textareas.
  var RTL_RE = /[֐-׿؀-ۿ]/;

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els.dropzone = $('ttDropzone');
    els.fileInput = $('ttFileInput');
    els.browseBtn = $('ttBrowseBtn');
    els.preview = $('ttPreview');
    els.previewBody = $('ttPreviewBody');
    els.fileName = $('ttFileName');
    els.clearBtn = $('ttClearBtn');
    els.sourceLang = $('ttSourceLang');
    els.targetLang = $('ttTargetLang');
    els.preprocess = $('ttPreprocess');
    els.processBtn = $('ttProcessBtn');
    els.status = $('ttStatus');
    els.statusFill = $('ttStatusFill');
    els.statusText = $('ttStatusText');
    els.empty = $('ttEmpty');
    els.results = $('ttResults');
    els.extracted = $('ttExtracted');
    els.translated = $('ttTranslated');
    els.meta = $('ttMeta');
    els.retranslate = $('ttRetranslate');
    els.history = $('ttHistory');
    els.historyList = $('ttHistoryList');
  }

  /* ---------------- File handling ---------------- */

  var ALLOWED = /\.(png|jpe?g|webp|pdf)$/i;

  function setFile(file) {
    if (!file) return;
    if (!ALLOWED.test(file.name)) {
      setStatus('Unsupported file type. Use PNG, JPG, JPEG, WEBP or PDF.', 'error');
      return;
    }
    clearPreviewUrl();
    state.file = file;
    els.fileName.textContent = file.name;
    renderPreview(file);
    els.preview.classList.remove('d-none');
    els.processBtn.disabled = false;
    hideStatus();
  }

  function renderPreview(file) {
    els.previewBody.innerHTML = '';
    if (/pdf$/i.test(file.name)) {
      els.previewBody.innerHTML =
        '<div class="tt-preview__pdf"><i class="fas fa-file-pdf"></i>' +
        '<span>' + escapeHtml(file.name) + '</span>' +
        '<small>' + formatBytes(file.size) + '</small></div>';
    } else {
      state.previewUrl = URL.createObjectURL(file);
      var img = new Image();
      img.src = state.previewUrl;
      img.alt = file.name;
      els.previewBody.appendChild(img);
    }
  }

  function clearPreviewUrl() {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
  }

  function clearFile() {
    clearPreviewUrl();
    state.file = null;
    els.fileInput.value = '';
    els.preview.classList.add('d-none');
    els.previewBody.innerHTML = '';
    els.processBtn.disabled = true;
    hideStatus();
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

  function setProgress(pct) {
    showStatus(false);
    els.statusFill.classList.remove('is-indeterminate');
    els.statusFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function hideStatus() {
    els.status.classList.add('d-none');
    els.statusFill.style.width = '0';
  }

  /* ---------------- Main flow ---------------- */

  async function process() {
    if (!state.file) return;
    els.processBtn.disabled = true;

    try {
      setStatus('Extracting text from the file...', 'progress');
      var extraction = await extractText();

      if (!extraction.text || !extraction.text.trim()) {
        setStatus('No readable text could be extracted. Try another language or file.', 'error');
        return;
      }

      state.extracted = extraction.text;
      state.detectedLang = extraction.detectedLang;
      showResults();
      renderExtracted(extraction);

      setStatus('Translating...', 'progress');
      var translation = await translate(extraction.text);
      state.translated = translation;
      renderTranslated(translation);

      addHistory(extraction);
      setStatus('Done', 'success');
      setTimeout(hideStatus, 1500);
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      els.processBtn.disabled = false;
    }
  }

  async function extractText() {
    var fd = new FormData();
    fd.append('file', state.file);
    fd.append('source_lang', els.sourceLang.value);
    fd.append('preprocess', els.preprocess.checked ? '1' : '0');

    var res = await fetch('/api/tools/extract', { method: 'POST', body: fd });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.result !== 1) {
      throw new Error(data.error || 'Extraction failed (' + res.status + ')');
    }
    return data;
  }

  async function translate(text) {
    var res = await fetch('/api/tools/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, target_lang: els.targetLang.value })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.result !== 1) {
      throw new Error(data.error || 'Translation failed (' + res.status + ')');
    }
    return data.translation;
  }

  async function retranslate() {
    var text = els.extracted.value.trim();
    if (!text) return;
    els.retranslate.disabled = true;
    try {
      setStatus('Translating...', 'progress');
      var translation = await translate(text);
      state.extracted = text;
      state.translated = translation;
      renderTranslated(translation);
      setStatus('Done', 'success');
      setTimeout(hideStatus, 1500);
    } catch (err) {
      setStatus(err.message || 'Translation failed', 'error');
    } finally {
      els.retranslate.disabled = false;
    }
  }

  /* ---------------- Rendering ---------------- */

  function showResults() {
    els.empty.classList.add('d-none');
    els.results.classList.remove('d-none');
  }

  function renderExtracted(extraction) {
    els.extracted.value = extraction.text;
    applyDir(els.extracted, extraction.text);
    var parts = [];
    if (extraction.method === 'ocr') parts.push('OCR');
    else if (extraction.method === 'embedded') parts.push('PDF text');
    if (extraction.pageCount) parts.push(extraction.pageCount + ' page(s)');
    if (extraction.detectedLang) parts.push('lang: ' + extraction.detectedLang);
    parts.push(extraction.chars + ' chars');
    els.meta.textContent = parts.join(' · ');
  }

  function renderTranslated(text) {
    els.translated.value = text;
    applyDir(els.translated, text);
  }

  function applyDir(el, text) {
    el.setAttribute('dir', RTL_RE.test(text) ? 'rtl' : 'ltr');
  }

  /* ---------------- History (session, in-memory) ---------------- */

  function addHistory(extraction) {
    var entry = {
      id: Date.now(),
      name: state.file ? state.file.name : 'text',
      source: els.sourceLang.options[els.sourceLang.selectedIndex].text,
      target: els.targetLang.options[els.targetLang.selectedIndex].text,
      extracted: state.extracted,
      translated: state.translated
    };
    state.history.unshift(entry);
    if (state.history.length > 12) state.history.pop();
    renderHistory();
  }

  function renderHistory() {
    if (!state.history.length) {
      els.history.classList.add('d-none');
      return;
    }
    els.history.classList.remove('d-none');
    els.historyList.innerHTML = '';
    state.history.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'tt-history-item';
      item.innerHTML =
        '<div class="tt-history-item__head">' +
        '<span class="tt-history-item__name">' + escapeHtml(entry.name) + '</span>' +
        '<span class="tt-history-item__langs">' + escapeHtml(entry.source) + ' → ' + escapeHtml(entry.target) + '</span>' +
        '</div>' +
        '<div class="tt-history-item__text">' + escapeHtml(entry.translated.slice(0, 160)) + '</div>';
      item.addEventListener('click', function () { restoreHistory(entry); });
      els.historyList.appendChild(item);
    });
  }

  function restoreHistory(entry) {
    state.extracted = entry.extracted;
    state.translated = entry.translated;
    showResults();
    els.meta.textContent = entry.source + ' → ' + entry.target;
    els.extracted.value = entry.extracted;
    applyDir(els.extracted, entry.extracted);
    renderTranslated(entry.translated);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- Export ---------------- */

  function exportResult(kind) {
    var text = els.translated.value;
    if (!text || !text.trim()) return;
    var base = 'translation_' + new Date().toISOString().slice(0, 10);

    if (kind === 'txt') {
      saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), base + '.txt');
    } else if (kind === 'csv') {
      var target = els.targetLang.options[els.targetLang.selectedIndex].text;
      // BOM para que Excel abra el UTF-8 correctamente (como pandas utf-8-sig).
      var csv = '﻿"Target Language","Translation"\r\n' +
        '"' + target.replace(/"/g, '""') + '","' + text.replace(/"/g, '""') + '"\r\n';
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    } else if (kind === 'word') {
      saveBlob(new Blob([buildWordHtml(text)], { type: 'application/msword;charset=utf-8' }), base + '.doc');
    } else if (kind === 'pdf') {
      printPdf(text);
    }
  }

  function buildWordHtml(text) {
    var dir = RTL_RE.test(text) ? 'rtl' : 'ltr';
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>Translation</title></head>' +
      '<body dir="' + dir + '"><h2>Translation</h2><p>' +
      escapeHtml(text).replace(/\n/g, '<br/>') + '</p></body></html>';
  }

  function printPdf(text) {
    var dir = RTL_RE.test(text) ? 'rtl' : 'ltr';
    var w = window.open('', '_blank');
    if (!w) {
      setStatus('Allow pop-ups to export as PDF (uses the print dialog).', 'error');
      return;
    }
    w.document.write(
      '<html><head><meta charset="utf-8"><title>Translation</title>' +
      '<style>body{font-family:Arial,Helvetica,sans-serif;padding:40px;line-height:1.6;' +
      'white-space:pre-wrap;word-wrap:break-word;}h2{margin-top:0;}</style></head>' +
      '<body dir="' + dir + '"><h2>Translation</h2><div>' + escapeHtml(text) + '</div></body></html>'
    );
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 300);
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
      if (this.files && this.files[0]) setFile(this.files[0]);
    });
    els.clearBtn.addEventListener('click', clearFile);
    els.processBtn.addEventListener('click', process);
    els.retranslate.addEventListener('click', retranslate);

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
      if (files && files[0]) setFile(files[0]);
    });
    els.dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput.click();
      }
    });

    // Export buttons (delegación)
    document.querySelectorAll('[data-export]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        exportResult(this.getAttribute('data-export'));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    if (!els.dropzone) return; // no estamos en la página
    bind();
  });
})();
