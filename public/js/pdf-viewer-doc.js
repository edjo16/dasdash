/* ═══════════════════════════════════════════════════════════
   PDF Document Viewer (view + write text, NO signatures)
   ------------------------------------------------------------
   Visor de PDF reutilizable. No conoce ningun modulo: el que lo
   abre inyecta un "source" con la forma:

     PdfDocViewer.open({
       filename:   'contrato.pdf',
       canWrite:   true,
       fileUrl:    function (version, forceDownload) -> string,
       fetchInfo:  function (version) -> Promise<{ result, pages, versions, ... }>,
       applyWrites:function (version, writes) -> Promise<{ result, version, ... }>,
       onSaved:    function (json) {}            // opcional
     })

   Comparte los estilos de /css/pdf-viewer.css con el visor de
   firmas de APPROVALS (pdf-viewer-sign.js), pero es independiente.
   Dependencias: pdf.js (window.pdfjsLib), showModal (modalMixin.js)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  let source = null;
  let pdfDoc = null;
  let pdfInfo = null;
  let totalPages = 0;
  let currentPage = 1;
  let currentScale = 1.2;
  let currentVersion = 'latest';
  let selectedFilename = '';
  let documentAnnotations = [];
  let activeTextEditors = [];
  let annotationDraftPayload = null;
  let annotationsDirty = false;
  let scrollLockY = 0;

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;
  const MOBILE_BREAKPOINT = 768;
  const MIN_TEXT_FONT_SIZE = 8;
  const MAX_TEXT_FONT_SIZE = 72;

  // ── Pinch state ──────────────────────────────────────────
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchTimeout = null;
  let resizeTimer = null;

  // ── DOM refs (assigned on first open) ────────────────────
  let modal, canvasArea, toolbar, zoomHint, topStatusBar;

  window.PdfDocViewer = { open, close };

  function el(id) {
    return modal ? modal.querySelector('#' + id) : null;
  }

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function isLatest() {
    return String(currentVersion || 'latest') === 'latest';
  }

  // ── Public API ───────────────────────────────────────────
  function open(docSource) {
    if (!docSource || typeof docSource.fileUrl !== 'function') {
      console.error('PdfDocViewer.open: invalid source');
      return;
    }
    if (!window.pdfjsLib) {
      showAlert('PDF viewer unavailable', 'The PDF library could not be loaded. Please reload the page.');
      return;
    }

    source = docSource;
    currentVersion = 'latest';
    selectedFilename = docSource.filename || '';
    currentPage = 1;
    resetWriteState();

    ensureModal();
    modal.classList.add('open');
    lockBodyScroll();
    showStatus('', '');
    updateFilenameLabel();

    if (isMobile()) {
      fitWidthScale().then(loadInfo);
    } else {
      currentScale = 1.2;
      loadPdf().then(loadInfo);
    }
  }

  async function close() {
    if (hasPendingWrites() && !(await confirmDiscardStagedWrites('close the viewer'))) {
      return;
    }
    if (modal) modal.classList.remove('open');
    unlockBodyScroll();
    pdfDoc = null;
    pdfInfo = null;
    source = null;
    resetWriteState();
    if (canvasArea) canvasArea.innerHTML = '';
    showStatus('', '');
  }

  function resetWriteState() {
    documentAnnotations = [];
    activeTextEditors = [];
    annotationDraftPayload = null;
    annotationsDirty = false;
    if (canvasArea) canvasArea.classList.remove('annotation-mode');
  }

  // ── Scroll lock ──────────────────────────────────────────
  function lockBodyScroll() {
    scrollLockY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = -scrollLockY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }

  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
    window.scrollTo(0, scrollLockY);
  }

  // ── Modal DOM ────────────────────────────────────────────
  function ensureModal() {
    if (modal) return;

    modal = document.createElement('div');
    modal.id = 'pdfDocViewerModal';
    modal.className = 'pdf-viewer-modal';
    modal.innerHTML = [
      '<div class="pdf-viewer-container">',
      '  <div class="pdf-main-area">',
      '    <div class="pdf-toolbar">',
      '      <div class="pdf-toolbar-group">',
      '        <button class="pdf-btn" id="pdfDocClose" title="Close" style="background-color:#840000">',
      '          <i class="fas fa-arrow-left"></i> Back',
      '        </button>',
      '        <button class="pdf-btn" id="pdfDocZoomOut" title="Zoom out"><i class="fas fa-search-minus"></i></button>',
      '        <span class="pdf-page-info pdf-zoom-level" id="pdfDocZoomLevel">120%</span>',
      '        <button class="pdf-btn" id="pdfDocZoomIn" title="Zoom in"><i class="fas fa-search-plus"></i></button>',
      '        <button class="pdf-btn pdf-hide-mobile" id="pdfDocZoomFit" title="Fit width"><i class="fas fa-expand-arrows-alt"></i></button>',
      '      </div>',
      '      <div class="pdf-toolbar-divider pdf-secondary-group"></div>',
      '      <div class="pdf-toolbar-group pdf-secondary-group">',
      '        <button class="pdf-btn" id="pdfDocDownload" title="Download"><i class="fas fa-download"></i></button>',
      '        <span class="pdf-page-info" id="pdfDocPageInfo"></span>',
      '      </div>',
      '      <div class="pdf-toolbar-divider pdf-version-group"></div>',
      '      <div class="pdf-toolbar-group pdf-version-group">',
      '        <span class="pdf-version-label">Version</span>',
      '        <select class="pdf-version-select" id="pdfDocVersionSelect">',
      '          <option value="latest">Latest</option>',
      '        </select>',
      '      </div>',
      '      <div class="pdf-toolbar-divider pdf-write-group"></div>',
      '      <div class="pdf-toolbar-group pdf-write-group">',
      '        <button class="pdf-btn" id="pdfDocWriteBtn" title="Write text on PDF">',
      '          <span class="pdf-t-icon">T</span> <span class="btn-label">Write</span>',
      '        </button>',
      '        <button class="pdf-btn" id="pdfDocSaveWritesBtn" title="Save staged text" disabled>',
      '          <i class="fas fa-save"></i> <span class="btn-label">Save text</span>',
      '        </button>',
      '      </div>',
      '      <div class="pdf-toolbar-group pdf-more-group">',
      '        <button class="pdf-btn" id="pdfDocMoreBtn" title="More options"><i class="fas fa-ellipsis-v"></i></button>',
      '      </div>',
      '      <span class="pdf-filename" id="pdfDocFilename"></span>',
      '    </div>',
      '    <div class="pdf-more-panel hidden" id="pdfDocMorePanel"></div>',
      '    <div class="pdf-top-status" id="pdfDocTopStatus" aria-live="polite"></div>',
      '    <div class="pdf-canvas-area" id="pdfDocCanvasArea">',
      '      <div style="color:#aaa;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading PDF...</div>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div class="pdf-zoom-hint" id="pdfDocZoomHint"></div>',
    ].join('');
    document.body.appendChild(modal);

    canvasArea = el('pdfDocCanvasArea');
    toolbar = modal.querySelector('.pdf-toolbar');
    zoomHint = el('pdfDocZoomHint');
    topStatusBar = el('pdfDocTopStatus');

    el('pdfDocClose').addEventListener('click', close);
    el('pdfDocZoomIn').addEventListener('click', function () { setZoom(currentScale + 0.2); });
    el('pdfDocZoomOut').addEventListener('click', function () { setZoom(currentScale - 0.2); });
    el('pdfDocZoomFit').addEventListener('click', function () { fitWidth(); });
    el('pdfDocDownload').addEventListener('click', downloadPdf);
    el('pdfDocWriteBtn').addEventListener('click', toggleWriteMode);
    el('pdfDocSaveWritesBtn').addEventListener('click', saveWrites);
    el('pdfDocVersionSelect').addEventListener('change', function () {
      changeVersion(this.value, this);
    });
    el('pdfDocMoreBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMorePanel();
    });

    document.addEventListener('click', function (e) {
      const panel = el('pdfDocMorePanel');
      if (panel && !panel.classList.contains('hidden') &&
          !panel.contains(e.target) && !e.target.closest('#pdfDocMoreBtn')) {
        panel.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') return void close();
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
      if (e.key === 'ArrowRight') goToPage(currentPage + 1);
    });

    setupPinchZoom();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 300); });
  }

  function updateFilenameLabel() {
    const label = el('pdfDocFilename');
    if (label) label.textContent = selectedFilename || (source && source.filename) || '';
  }

  // ── Loading ──────────────────────────────────────────────
  function streamUrl(forceDownload) {
    return source.fileUrl(currentVersion || 'latest', !!forceDownload);
  }

  async function loadPdf() {
    updateFilenameLabel();
    try {
      pdfDoc = await pdfjsLib.getDocument(streamUrl(false)).promise;
      totalPages = pdfDoc.numPages;
      await renderAllPages();
    } catch (err) {
      canvasArea.innerHTML = '<div style="color:#f66;padding:20px;">Error loading PDF: ' +
        escapeHtml(err.message) + '</div>';
    }
  }

  async function fitWidthScale() {
    updateFilenameLabel();
    try {
      pdfDoc = await pdfjsLib.getDocument(streamUrl(false)).promise;
      totalPages = pdfDoc.numPages;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      currentScale = Math.max(MIN_SCALE, (canvasArea.clientWidth - 20) / viewport.width);
      await renderAllPages();
    } catch (err) {
      canvasArea.innerHTML = '<div style="color:#f66;padding:20px;">Error loading PDF: ' +
        escapeHtml(err.message) + '</div>';
    }
  }

  async function loadInfo() {
    if (typeof source.fetchInfo !== 'function') {
      updateWriteControls();
      return;
    }
    try {
      const json = await source.fetchInfo(currentVersion || 'latest');
      if (!json || json.result !== 1) {
        showAlert('Error', (json && json.error) || 'Could not load document information');
        close();
        return;
      }
      pdfInfo = json;
      selectedFilename = json.selectedFilename || selectedFilename;
      updateFilenameLabel();
      renderVersionSelector();
      updateWriteControls();
    } catch (e) {
      if (e && e.status === 409) {
        showAlert('File Locked', e.message || 'The file is currently open by another user.');
      } else {
        showAlert('Error', 'Could not load the document. Please try again.');
      }
      close();
    }
  }

  // ── Rendering ────────────────────────────────────────────
  async function renderAllPages() {
    activeTextEditors = [];
    canvasArea.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: currentScale });

      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.dataset.page = i;
      wrapper.style.width = viewport.width + 'px';
      wrapper.style.height = viewport.height + 'px';

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      wrapper.appendChild(canvas);

      bindPageClick(i, wrapper);
      canvasArea.appendChild(wrapper);
    }
    updatePageInfo();
    renderDocumentAnnotations();
  }

  function bindPageClick(pageNum, wrapper) {
    wrapper.addEventListener('click', function (e) {
      if (!annotationDraftPayload) return;
      if (e.target.closest('.pdf-text-editor') || e.target.closest('.pdf-write-preview')) return;

      const rect = wrapper.getBoundingClientRect();
      createTextEditorOnPage(pageNum, e.clientX - rect.left, e.clientY - rect.top, wrapper);
    });
  }

  function updatePageInfo() {
    const info = el('pdfDocPageInfo');
    if (info) info.textContent = totalPages ? totalPages + ' pages' : '';
    const zoom = el('pdfDocZoomLevel');
    if (zoom) zoom.textContent = Math.round(currentScale * 100) + '%';
  }

  function goToPage(n) {
    if (n < 1 || n > totalPages) return;
    currentPage = n;
    const wrapper = canvasArea.querySelector('[data-page="' + n + '"]');
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function setZoom(scale) {
    if (activeTextEditors.length > 0 && !(await confirmDiscardStagedWrites('change zoom'))) return;
    currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    if (pdfDoc) await renderAllPages();
  }

  async function fitWidth(skipPrompt) {
    if (!skipPrompt && activeTextEditors.length > 0 &&
        !(await confirmDiscardStagedWrites('fit page width'))) return;
    if (!pdfDoc) return;
    const areaWidth = canvasArea.clientWidth - (isMobile() ? 20 : 40);
    if (pdfInfo && pdfInfo.pages && pdfInfo.pages.length > 0) {
      currentScale = areaWidth / pdfInfo.pages[0].width;
      await renderAllPages();
      return;
    }
    const page = await pdfDoc.getPage(1);
    currentScale = areaWidth / page.getViewport({ scale: 1 }).width;
    await renderAllPages();
  }

  function downloadPdf() {
    window.open(streamUrl(true), '_blank');
  }

  // ── Versions ─────────────────────────────────────────────
  function getSortedVersions() {
    const versions = (pdfInfo && Array.isArray(pdfInfo.versions)) ? pdfInfo.versions.slice() : [];
    return versions.sort(function (a, b) { return (Number(b.version) || 0) - (Number(a.version) || 0); });
  }

  function versionLabel(v) {
    const type = v.version_type === 'original' ? 'Original' : 'Edited';
    return 'v' + v.version + ' - ' + type;
  }

  function fillVersionOptions(select) {
    const versions = getSortedVersions();
    select.innerHTML = '';

    const latestOption = document.createElement('option');
    latestOption.value = 'latest';
    latestOption.textContent = versions.length > 0 ? 'Latest (v' + versions[0].version + ')' : 'Latest';
    select.appendChild(latestOption);

    versions.forEach(function (v) {
      const opt = document.createElement('option');
      opt.value = String(v.version);
      opt.textContent = versionLabel(v);
      select.appendChild(opt);
    });

    if (isLatest()) {
      select.value = 'latest';
      return;
    }
    const exists = versions.some(function (v) { return String(v.version) === String(currentVersion); });
    if (!exists) currentVersion = 'latest';
    select.value = exists ? String(currentVersion) : 'latest';
  }

  function renderVersionSelector() {
    const select = el('pdfDocVersionSelect');
    if (select) fillVersionOptions(select);
  }

  async function changeVersion(value, selectEl) {
    if (hasPendingWrites() && !(await confirmDiscardStagedWrites('switch versions'))) {
      if (selectEl) selectEl.value = String(currentVersion || 'latest');
      return;
    }
    currentVersion = value || 'latest';
    resetWriteState();
    renderStagedWritesState();

    if (isMobile()) {
      await fitWidthScale();
    } else {
      await loadPdf();
    }
    await loadInfo();
  }

  // ── More panel (mobile) ──────────────────────────────────
  function toggleMorePanel() {
    const panel = el('pdfDocMorePanel');
    if (!panel) return;
    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      return;
    }
    renderMorePanel(panel);
    panel.classList.remove('hidden');
  }

  function renderMorePanel(panel) {
    if (toolbar) {
      const statusVisible = topStatusBar && topStatusBar.classList.contains('visible');
      panel.style.top = (toolbar.offsetHeight + (statusVisible ? topStatusBar.offsetHeight : 0)) + 'px';
    }
    panel.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'pdf-more-version';
    const label = document.createElement('span');
    label.className = 'pdf-more-version-label';
    label.textContent = 'Version';
    const select = document.createElement('select');
    select.className = 'pdf-version-select';
    fillVersionOptions(select);
    select.addEventListener('change', async function () {
      const mainSelect = el('pdfDocVersionSelect');
      await changeVersion(this.value, this);
      if (mainSelect) mainSelect.value = String(currentVersion || 'latest');
      panel.classList.add('hidden');
    });
    wrap.appendChild(label);
    wrap.appendChild(select);
    panel.appendChild(wrap);

    const divider = document.createElement('div');
    divider.className = 'pdf-more-divider';
    panel.appendChild(divider);

    const items = [
      { icon: 'fa-expand-arrows-alt', label: 'Fit Width', fn: function () { fitWidth(); } },
      { icon: 'fa-download', label: 'Download', fn: downloadPdf },
    ];
    if (canWrite()) {
      items.push({ icon: 'fa-font', label: 'Write Text (T)', fn: toggleWriteMode });
      items.push({ icon: 'fa-save', label: 'Save Text', fn: saveWrites });
    }
    items.forEach(function (item) {
      const btn = document.createElement('button');
      btn.className = 'pdf-btn pdf-more-item';
      btn.innerHTML = '<i class="fas ' + item.icon + '"></i> ' + item.label;
      btn.addEventListener('click', function () {
        panel.classList.add('hidden');
        item.fn();
      });
      panel.appendChild(btn);
    });
  }

  // ── Write text on PDF ────────────────────────────────────
  function canWrite() {
    return !!(source && source.canWrite && typeof source.applyWrites === 'function');
  }

  function hasPendingWrites() {
    return (annotationsDirty && documentAnnotations.length > 0) ||
      activeTextEditors.some(function (entry) {
        return String((entry.textarea && entry.textarea.value) || '').trim().length > 0;
      });
  }

  function toggleWriteMode() {
    if (!canWrite()) return;
    if (!isLatest()) {
      showStatus('Text can only be added on the Latest version.', '#b06a00');
      return;
    }
    if (annotationDraftPayload) {
      clearWriteMode();
      showStatus('Text mode disabled.', '#6b7280');
      return;
    }
    annotationDraftPayload = { field_type: 'text', text: '', font_size: 12, color_hex: '#111111' };
    if (canvasArea) canvasArea.classList.add('annotation-mode');
    updateWriteControls();
    showStatus('Text mode enabled. Click on the PDF to create a text box.', '#00586f');
  }

  function clearWriteMode() {
    annotationDraftPayload = null;
    if (canvasArea) canvasArea.classList.remove('annotation-mode');
    updateWriteControls();
  }

  function updateWriteControls() {
    const writeBtn = el('pdfDocWriteBtn');
    const saveBtn = el('pdfDocSaveWritesBtn');
    const group = modal ? modal.querySelectorAll('.pdf-write-group') : [];
    const allowed = canWrite();

    group.forEach(function (node) { node.style.display = allowed ? '' : 'none'; });
    if (!allowed) return;

    if (writeBtn) {
      writeBtn.disabled = !isLatest();
      writeBtn.classList.toggle('active', !!annotationDraftPayload);
    }
    if (saveBtn) {
      saveBtn.disabled = !isLatest() || !annotationsDirty ||
        documentAnnotations.length === 0 || activeTextEditors.length > 0;
    }
  }

  function renderStagedWritesState() {
    const saveBtn = el('pdfDocSaveWritesBtn');
    if (saveBtn) {
      saveBtn.innerHTML = '<i class="fas fa-save"></i> <span class="btn-label">Save text' +
        (documentAnnotations.length ? ' (' + documentAnnotations.length + ')' : '') + '</span>';
    }
    updateWriteControls();
  }

  function createAnnotationElement(wrapper, annotation) {
    const preview = document.createElement('div');
    preview.className = 'pdf-write-preview pdf-write-preview-text';
    const fontSize = Number(annotation.font_size) || 12;
    preview.style.left = (annotation.position_x * currentScale) + 'px';
    preview.style.top = (wrapper.clientHeight - (annotation.position_y * currentScale) - (fontSize * currentScale)) + 'px';
    if (Number(annotation.box_width) > 0) {
      preview.style.width = (Number(annotation.box_width) * currentScale) + 'px';
    }
    preview.style.fontSize = (Math.max(MIN_TEXT_FONT_SIZE, fontSize) * currentScale) + 'px';
    preview.style.color = annotation.color_hex || '#111111';
    preview.textContent = annotation.text || '';
    wrapper.appendChild(preview);
  }

  function renderDocumentAnnotations() {
    canvasArea.querySelectorAll('.pdf-write-preview').forEach(function (node) { node.remove(); });
    documentAnnotations.forEach(function (annotation) {
      const wrapper = canvasArea.querySelector('[data-page="' + annotation.page_number + '"]');
      if (wrapper) createAnnotationElement(wrapper, annotation);
    });
  }

  function createTextEditorOnPage(pageNum, x, y, wrapper) {
    const editor = document.createElement('div');
    editor.className = 'pdf-text-editor';
    editor.style.left = Math.max(0, x - 20) + 'px';
    editor.style.top = Math.max(0, y - 18) + 'px';
    editor.innerHTML = [
      '<div class="pdf-text-editor-header">',
      '  <span class="pdf-text-editor-title">Text</span>',
      '  <div class="pdf-text-editor-actions">',
      '    <button class="pdf-btn pdf-text-editor-font-down" type="button" title="Smaller text">a-</button>',
      '    <button class="pdf-btn pdf-text-editor-font-up" type="button" title="Larger text">A+</button>',
      '    <button class="pdf-btn pdf-text-editor-apply" type="button">Apply</button>',
      '    <button class="pdf-btn pdf-text-editor-close" type="button">&times;</button>',
      '  </div>',
      '</div>',
      '<textarea class="pdf-text-editor-input" rows="1" placeholder="Type here..."></textarea>',
      '<div class="pdf-text-editor-resize" title="Resize"></div>',
    ].join('');
    wrapper.appendChild(editor);

    const textarea = editor.querySelector('.pdf-text-editor-input');
    const fontSize = Number(annotationDraftPayload && annotationDraftPayload.font_size) || 12;
    textarea.style.fontSize = (fontSize * currentScale) + 'px';
    textarea.focus();

    const entry = {
      id: 'te_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      element: editor,
      wrapper: wrapper,
      page_number: Number(pageNum),
      font_size: fontSize,
      color_hex: '#111111',
      textarea: textarea,
    };
    activeTextEditors.push(entry);

    makeDraggableByHandle(editor, wrapper, editor);
    makeResizable(editor, editor.querySelector('.pdf-text-editor-resize'));
    adjustTextEditorHeight(entry);

    textarea.addEventListener('input', function () { adjustTextEditorHeight(entry); });
    editor.querySelector('.pdf-text-editor-font-down').addEventListener('click', function (e) {
      e.stopPropagation();
      changeTextEditorFontSize(entry, -1);
    });
    editor.querySelector('.pdf-text-editor-font-up').addEventListener('click', function (e) {
      e.stopPropagation();
      changeTextEditorFontSize(entry, 1);
    });
    editor.querySelector('.pdf-text-editor-close').addEventListener('click', function (e) {
      e.stopPropagation();
      removeTextEditor(entry.id);
    });
    editor.querySelector('.pdf-text-editor-apply').addEventListener('click', function (e) {
      e.stopPropagation();
      applyTextEditor(entry.id);
    });
    updateWriteControls();
  }

  function removeTextEditor(editorId) {
    const index = activeTextEditors.findIndex(function (item) { return item.id === editorId; });
    if (index === -1) return;
    const entry = activeTextEditors[index];
    if (entry.element && entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
    activeTextEditors.splice(index, 1);
    updateWriteControls();
  }

  function applyTextEditor(editorId) {
    const entry = activeTextEditors.find(function (item) { return item.id === editorId; });
    if (!entry) return;

    const text = String(entry.textarea.value || '');
    if (!text.trim()) {
      showStatus('Please type text before applying.', '#dc3545');
      return;
    }

    const left = parseFloat(entry.element.style.left) || 0;
    const top = parseFloat(entry.element.style.top) || 0;
    const metrics = getTextEditorContentMetrics(entry, left, top);
    const renderedFontPx = getRenderedFontSize(entry);

    const annotation = {
      field_type: 'text',
      text: text,
      font_size: entry.font_size,
      color_hex: entry.color_hex,
      page_number: entry.page_number,
      // Se ancla al inicio del texto para que quede donde el usuario lo escribio.
      position_x: metrics.textLeftPx / currentScale,
      position_y: (entry.wrapper.clientHeight - metrics.textTopPx - renderedFontPx) / currentScale,
      box_width: metrics.boxWidthPx > 0 ? metrics.boxWidthPx / currentScale : null,
      box_height: metrics.boxHeightPx > 0 ? metrics.boxHeightPx / currentScale : null,
    };

    documentAnnotations.push(annotation);
    createAnnotationElement(entry.wrapper, annotation);
    annotationsDirty = true;
    removeTextEditor(editorId);
    renderStagedWritesState();
    showStatus('Text applied. You can add more boxes and then press "Save text".', '#00586f');
  }

  function getTextEditorContentMetrics(entry, editorLeft, editorTop) {
    const textarea = entry.textarea;
    if (!textarea) {
      return {
        textLeftPx: editorLeft,
        textTopPx: editorTop,
        boxWidthPx: entry.element ? entry.element.clientWidth : 0,
        boxHeightPx: entry.element ? entry.element.clientHeight : 0,
      };
    }

    const style = window.getComputedStyle(textarea);
    const padLeft = Number.parseFloat(style.paddingLeft) || 0;
    const padRight = Number.parseFloat(style.paddingRight) || 0;
    const padTop = Number.parseFloat(style.paddingTop) || 0;

    return {
      textLeftPx: editorLeft + textarea.offsetLeft + padLeft,
      textTopPx: editorTop + textarea.offsetTop + padTop,
      boxWidthPx: Math.max(1, (textarea.clientWidth || textarea.offsetWidth) - padLeft - padRight),
      boxHeightPx: Math.max(1, textarea.clientHeight || textarea.offsetHeight),
    };
  }

  function getRenderedFontSize(entry) {
    if (entry.textarea) {
      const fromStyle = Number.parseFloat(window.getComputedStyle(entry.textarea).fontSize);
      if (Number.isFinite(fromStyle) && fromStyle > 0) return fromStyle;
    }
    return (Number(entry.font_size) || 12) * currentScale;
  }

  function adjustTextEditorHeight(entry) {
    const input = entry.textarea;
    if (!input || !entry.element) return;
    input.style.height = 'auto';
    const minHeight = Math.round(getRenderedFontSize(entry) * 1.2);
    const nextHeight = Math.max(minHeight, Math.min(320, input.scrollHeight));
    input.style.height = nextHeight + 'px';
    entry.element.style.height = (nextHeight + 16) + 'px';
  }

  function changeTextEditorFontSize(entry, delta) {
    const next = Math.max(MIN_TEXT_FONT_SIZE,
      Math.min(MAX_TEXT_FONT_SIZE, (Number(entry.font_size) || 12) + delta));
    if (next === entry.font_size) {
      showStatus(next === MAX_TEXT_FONT_SIZE
        ? 'Maximum text size reached (' + MAX_TEXT_FONT_SIZE + ').'
        : 'Minimum text size reached (' + MIN_TEXT_FONT_SIZE + ').', '#6b7280');
      return;
    }
    entry.font_size = next;
    entry.textarea.style.fontSize = (next * currentScale) + 'px';
    adjustTextEditorHeight(entry);
  }

  function getWritesPayload() {
    return documentAnnotations.map(function (annotation) {
      return {
        field_type: 'text',
        text: String(annotation.text || ''),
        font_size: Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, Number(annotation.font_size) || 12)),
        color_hex: annotation.color_hex || '#111111',
        page_number: Number(annotation.page_number) || 1,
        position_x: Number(annotation.position_x) || 0,
        position_y: Number(annotation.position_y) || 0,
        box_width: Number(annotation.box_width) > 0 ? Number(annotation.box_width) : null,
        box_height: Number(annotation.box_height) > 0 ? Number(annotation.box_height) : null,
      };
    });
  }

  async function saveWrites() {
    if (!canWrite()) return;
    if (!isLatest()) {
      showStatus('Text can only be added on the Latest version.', '#b06a00');
      return;
    }
    if (!annotationsDirty || documentAnnotations.length === 0) {
      showStatus('No staged text to apply.', '#6b7280');
      return;
    }
    if (activeTextEditors.length > 0) {
      showStatus('Apply or close the open text boxes before saving.', '#b06a00');
      return;
    }

    const saveBtn = el('pdfDocSaveWritesBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="btn-label">Saving...</span>';
    }

    try {
      const json = await source.applyWrites(currentVersion || 'latest', getWritesPayload());
      if (!json || json.result !== 1) {
        throw new Error((json && json.error) || 'Could not apply text to the PDF');
      }

      resetWriteState();
      renderStagedWritesState();
      currentVersion = 'latest';
      showStatus('Text saved. Version ' + json.version + ' created (' + (json.edited_filename || '') + ').', '#155724');

      if (isMobile()) {
        await fitWidthScale();
      } else {
        await loadPdf();
      }
      await loadInfo();
      if (typeof source.onSaved === 'function') source.onSaved(json);
    } catch (e) {
      if (e && e.status === 409) {
        showAlert('File Locked', e.message || 'The file is currently open by another user. Please try again later.');
        showStatus('', '');
      } else {
        showStatus('Error saving text: ' + e.message, '#dc3545');
      }
    } finally {
      renderStagedWritesState();
    }
  }

  // ── Drag & resize ────────────────────────────────────────
  function makeDraggableByHandle(element, container, handle) {
    if (!handle) return;
    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });

    function onDown(e) {
      if (e.target.closest('button') ||
          e.target.closest('.pdf-text-editor-input') ||
          e.target.closest('.pdf-text-editor-resize')) return;
      e.preventDefault();
      const ev = e.touches ? e.touches[0] : e;
      startX = ev.clientX;
      startY = ev.clientY;
      origLeft = parseInt(element.style.left, 10) || 0;
      origTop = parseInt(element.style.top, 10) || 0;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      e.preventDefault();
      const ev = e.touches ? e.touches[0] : e;
      const newLeft = Math.max(0, Math.min(container.clientWidth - element.offsetWidth,
        origLeft + (ev.clientX - startX)));
      const newTop = Math.max(0, Math.min(container.clientHeight - element.offsetHeight,
        origTop + (ev.clientY - startY)));
      element.style.left = newLeft + 'px';
      element.style.top = newTop + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
  }

  function makeResizable(element, handle) {
    if (!handle) return;
    let startX, startY, origW, origH;

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });

    function onDown(e) {
      e.preventDefault();
      e.stopPropagation();
      const ev = e.touches ? e.touches[0] : e;
      startX = ev.clientX;
      startY = ev.clientY;
      origW = element.offsetWidth;
      origH = element.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      e.preventDefault();
      const ev = e.touches ? e.touches[0] : e;
      element.style.width = Math.max(60, origW + (ev.clientX - startX)) + 'px';
      element.style.height = Math.max(30, origH + (ev.clientY - startY)) + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
  }

  // ── Pinch zoom & resize ──────────────────────────────────
  function setupPinchZoom() {
    canvasArea.addEventListener('touchstart', onPinchStart, { passive: false });
    canvasArea.addEventListener('touchmove', onPinchMove, { passive: false });
    canvasArea.addEventListener('touchend', onPinchEnd);
  }

  function touchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPinchStart(e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
    pinchStartScale = currentScale;
  }

  function onPinchMove(e) {
    if (e.touches.length !== 2 || pinchStartDist === 0) return;
    e.preventDefault();
    const ratio = touchDistance(e.touches[0], e.touches[1]) / pinchStartDist;
    currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale * ratio));
    showZoomHint(Math.round(currentScale * 100) + '%');
    const zoom = el('pdfDocZoomLevel');
    if (zoom) zoom.textContent = Math.round(currentScale * 100) + '%';
  }

  function onPinchEnd(e) {
    if (pinchStartDist === 0 || e.touches.length >= 2) return;
    pinchStartDist = 0;
    hideZoomHint();
    if (pdfDoc) renderAllPages();
  }

  function showZoomHint(text) {
    if (!zoomHint) return;
    zoomHint.textContent = text;
    zoomHint.classList.add('visible');
    clearTimeout(pinchTimeout);
  }

  function hideZoomHint() {
    clearTimeout(pinchTimeout);
    pinchTimeout = setTimeout(function () {
      if (zoomHint) zoomHint.classList.remove('visible');
    }, 600);
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!modal || !modal.classList.contains('open') || !pdfDoc) return;
      // No interrumpir la escritura cuando el teclado virtual dispara resize.
      if (activeTextEditors.length > 0) return;
      if (isMobile()) {
        fitWidth(true);
      } else {
        renderAllPages();
      }
    }, 200);
  }

  // ── Feedback ─────────────────────────────────────────────
  function showStatus(message, color) {
    if (!topStatusBar) return;
    const text = String(message || '').trim();
    if (!text) {
      topStatusBar.classList.remove('visible');
      topStatusBar.innerHTML = '';
      return;
    }
    const tone = color || '#6b7280';
    topStatusBar.classList.add('visible');
    topStatusBar.style.borderColor = tone;
    topStatusBar.style.color = tone;
    topStatusBar.innerHTML = '<i class="fas fa-info-circle"></i><span>' + escapeHtml(text) + '</span>';
  }

  function showAlert(title, message) {
    if (typeof window.showModal === 'function') {
      window.showModal(message, null, null, { title: title, okText: 'OK', type: 'warning', hideCancel: true });
      return;
    }
    console.warn(title + ': ' + message);
  }

  function confirmDiscardStagedWrites(actionLabel) {
    return new Promise(function (resolve) {
      if (typeof window.showModal !== 'function') return resolve(true);
      window.showModal(
        'You have text that has not been saved to the PDF yet. Discard it and continue to ' + actionLabel + '?',
        function () { resolve(true); },
        function () { resolve(false); },
        { title: 'Discard staged text?', okText: 'Discard', cancelText: 'Keep editing', type: 'warning' }
      );
    });
  }

  function escapeHtml(raw) {
    return String(raw == null ? '' : raw)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();