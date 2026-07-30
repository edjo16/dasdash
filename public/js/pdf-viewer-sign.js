/* ═══════════════════════════════════════════════════════════
   PDF Viewer & Digital Signature Module
   Dependencies: pdf.js (loaded via CDN), no external sig lib
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let currentScale = 1.2;
  let currentRowID = null;
  let currentFilename = null;
  let currentVersion = 'latest';
  let selectedResolvedFilename = null;
  let pdfInfo = null;
  let placedSignature = null;
  let signaturePadCanvas = null;
  let signaturePadCtx = null;
  let isDrawing = false;
  let lastPoint = null;
  let savedSignatures = [];
  let selectedSavedSig = null;
  let selectedSavedSigId = null;
  let selectedSavedSigMeta = null;
  let isPlacingMode = false;
  let isSigning = false;
  let documentAnnotations = [];
  let annotationDraftType = null;
  let annotationDraftPayload = null;
  let annotationsDirty = false;
  let activeTextEditors = [];
  let scrollLockY = 0;
  let signPanelMode = 'upload';
  let floatingSignaturesOpen = false;

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;
  const MOBILE_BREAKPOINT = 768;
  const MIN_TEXT_FONT_SIZE = 8;
  const MAX_TEXT_FONT_SIZE = 72;
  const SIGNATURE_MIN_ALPHA = 12;
  const SIGNATURE_TRIM_PADDING = 8;
  const SIGNATURE_BG_DISTANCE = 36;
  const SIGNATURE_MAX_EXPORT_WIDTH = 900;
  const SIGNATURE_MAX_EXPORT_HEIGHT = 320;
  const TYPED_SIGNATURE_MAX_CHARS = 80;
  const TYPED_SIGNATURE_MIN_SIZE = 16;
  const TYPED_SIGNATURE_MAX_SIZE = 56;
  const TYPED_SIGNATURE_DEFAULT_SIZE = 56;

  const TYPED_SIGNATURE_STYLES = {
    adobe: {
      label: 'Regular',
      fontFamily: '"Segoe Script", "Lucida Handwriting", "Brush Script MT", cursive',
      fontWeight: '600',
      fontStyle: 'italic',
      letterSpacingEm: 0.01,
    },
    elegant: {
      label: 'Elegant',
      fontFamily: '"Palace Script MT", "Brush Script MT", "Segoe Script", cursive',
      fontWeight: '500',
      fontStyle: 'italic',
      letterSpacingEm: 0.02,
    },
    clean: {
      label: 'Clean Script',
      fontFamily: '"Segoe Script", "Bradley Hand", "Lucida Handwriting", cursive',
      fontWeight: '600',
      fontStyle: 'italic',
      letterSpacingEm: 0,
    },
  };

  // ── Pinch state ──────────────────────────────────────────
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchTimeout = null;

  // ── DOM refs (assigned on open) ──────────────────────────
  let modal, canvasArea, toolbar, pageInfo;
  let signPanel, signPanelBody, placingBanner, zoomHint;
  let topStatusBar, floatingSignatures, floatingSigList;

  // ── Public API ───────────────────────────────────────────
  window.PdfViewerSign = { open, close };

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function open(RowID, filename, options) {
    var requestedVersion = 'latest';
    if (typeof options === 'string' || typeof options === 'number') {
      requestedVersion = options;
    } else if (options && options.version !== undefined) {
      requestedVersion = options.version;
    }

    currentRowID = RowID;
    currentFilename = filename;
    currentVersion = String(requestedVersion || 'latest');
    selectedResolvedFilename = filename;
    currentPage = 1;
    placedSignature = null;
    selectedSavedSigId = null;
    selectedSavedSigMeta = null;
    isPlacingMode = false;
    documentAnnotations = [];
    annotationDraftType = null;
    annotationDraftPayload = null;
    annotationsDirty = false;
    signPanelMode = 'upload';
    floatingSignaturesOpen = false;

    ensureModal();
    modal.classList.add('open');
    lockBodyScroll();
    closeSignPanel();
    hideFloatingSignatures();
    showSigStatus('', '#6b7280');

    if (isMobile()) {
      fitWidthScale().then(function () { loadPdfInfo(); });
    } else {
      currentScale = 1.2;
      loadPdf().then(function () { loadPdfInfo(); });
    }
    loadUserSignatures();
  }

  function getPdfStreamUrl(forceDownload) {
    var url = '/pdf-sign/signed-file?RowID=' + currentRowID +
      '&filename=' + encodeURIComponent(currentFilename) +
      '&version=' + encodeURIComponent(currentVersion || 'latest');
    if (forceDownload) {
      url += '&dl=1';
    }
    return url;
  }

  async function close() {
    if (hasPendingTextWrites() && !(await confirmDiscardStagedWrites('close the viewer'))) {
      return;
    }
    if (modal) modal.classList.remove('open');
    unlockBodyScroll();
    pdfDoc = null;
    placedSignature = null;
    selectedSavedSigMeta = null;
    isPlacingMode = false;
    documentAnnotations = [];
    activeTextEditors = [];
    annotationDraftType = null;
    annotationDraftPayload = null;
    annotationsDirty = false;
    clearAnnotationDraft();
    exitPlacingMode();
    closeSignPanel();
    hideFloatingSignatures();
    showSigStatus('', '#6b7280');
  }

  function hasPendingTextWrites() {
    return (
      (annotationsDirty && Array.isArray(documentAnnotations) && documentAnnotations.length > 0) ||
      activeTextEditors.some(function (editor) {
        return String(editor && editor.textarea && editor.textarea.value || '').trim().length > 0;
      })
    );
  }

  function showConfirmModal(message, options) {
    return new Promise(function (resolve) {
      if (typeof window.showModal !== 'function') {
        showSigStatus('Confirmation modal is not available right now.', '#dc3545');
        resolve(false);
        return;
      }

      window.showModal(
        message,
        function onOk() { resolve(true); },
        function onCancel() { resolve(false); },
        options || {}
      );
    });
  }

  async function confirmDiscardStagedWrites(actionLabel) {
    return showConfirmModal(
      'You have staged text that has not been applied to the PDF yet. Discard it and continue to ' + actionLabel + '?',
      {
        title: 'Discard staged text?',
        okText: 'Discard',
        cancelText: 'Keep editing',
        type: 'warning',
      }
    );
  }

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

  // ── Build modal DOM ─────────────────────────────────────
  function ensureModal() {
    if (document.getElementById('pdfViewerModal')) {
      modal = document.getElementById('pdfViewerModal');
      canvasArea = modal.querySelector('.pdf-canvas-area');
      toolbar = modal.querySelector('.pdf-toolbar');
      pageInfo = modal.querySelector('.pdf-page-info');
      signPanel = modal.querySelector('.pdf-sign-panel');
      signPanelBody = modal.querySelector('.pdf-sign-panel-body');
      placingBanner = modal.querySelector('.pdf-placing-banner');
      zoomHint = modal.querySelector('.pdf-zoom-hint');
      topStatusBar = modal.querySelector('#pdfTopStatus');
      floatingSignatures = modal.querySelector('#pdfFloatingSignatures');
      floatingSigList = modal.querySelector('#pdfFloatingSigList');
      return;
    }

    modal = document.createElement('div');
    modal.id = 'pdfViewerModal';
    modal.className = 'pdf-viewer-modal';
    modal.innerHTML = `
      <div class="pdf-viewer-container">
        <div class="pdf-main-area">
          <div class="pdf-toolbar">
            <div class="pdf-toolbar-group">
              <button class="pdf-btn" id="pdfCloseBtn" title="Close" style="background-color:#840000">
                <i class="fas fa-arrow-left"></i>
                Back
              </button>
              <button class="pdf-btn" id="pdfZoomOut" title="Zoom out"><i class="fas fa-search-minus"></i></button>
              <span class="pdf-page-info" id="pdfZoomLevel">120%</span>
              <button class="pdf-btn" id="pdfZoomIn" title="Zoom in"><i class="fas fa-search-plus"></i></button>
              <button class="pdf-btn pdf-hide-mobile" id="pdfZoomFit" title="Fit width"><i class="fas fa-expand-arrows-alt"></i></button>
              </div>
              <div class="pdf-toolbar-divider pdf-secondary-group"></div>
            <div class="pdf-toolbar-group pdf-secondary-group">
              <button class="pdf-btn" id="pdfDownload" title="Download"><i class="fas fa-download"></i></button>
              <button class="pdf-btn pdf-devteam-btn" id="pdfVerify" title="Verify integrity" style="display:none;"><i class="fas fa-shield-alt"></i></button>
              <button class="pdf-btn pdf-devteam-btn" id="pdfAudit" title="Audit trail" style="display:none;"><i class="fas fa-history"></i></button>
            </div>
            <div class="pdf-toolbar-divider"></div>
            <div class="pdf-toolbar-group pdf-version-group">
              <span class="pdf-version-label">Version</span>
              <select class="pdf-version-select" id="pdfVersionSelect">
                <option value="latest">Latest</option>
              </select>
            </div>
            <div class="pdf-toolbar-divider pdf-version-group"></div>
            <div class="pdf-toolbar-group">
              <button class="pdf-btn" id="pdfToggleSign" title="Open saved signatures">
                <i class="fas fa-signature"></i> <span class="btn-label">Sign</span>
              </button>
              <button class="pdf-btn" id="pdfOpenCommentModalBtn" title="Write text on PDF">
                <span class="pdf-t-icon">T</span> <span class="btn-label">Write</span>
              </button>
              <button class="pdf-btn" id="pdfSaveWritesBtn" title="Save staged text" disabled>
                <i class="fas fa-save"></i> <span class="btn-label">Save text</span>
              </button>
              <button class="pdf-btn" id="pdfOpenHistory" title="Signatures history">
                <i class="fas fa-history"></i> <span class="btn-label">History</span>
              </button>
            </div>
            <div class="pdf-toolbar-group pdf-more-group">
              <button class="pdf-btn" id="pdfMoreBtn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
            </div>
            <span class="pdf-filename" id="pdfFilename"></span>
          </div>
          <div class="pdf-more-panel hidden" id="pdfMorePanel"></div>
          <div class="pdf-top-status" id="pdfTopStatus" aria-live="polite"></div>
          <div class="pdf-floating-signatures hidden" id="pdfFloatingSignatures">
            <div class="pdf-floating-signatures-header">
              <span><i class="fas fa-signature"></i> Select Signature</span>
              <button class="pdf-btn" id="pdfCloseFloatingSignatures" title="Close">&times;</button>
            </div>
            <div class="pdf-floating-signatures-actions" id="pdfFloatingSignActions">
              <button class="pdf-btn" type="button" id="pdfFloatingUploadAction"><i class="fas fa-upload"></i> Upload</button>
              <button class="pdf-btn" type="button" id="pdfFloatingDrawAction"><i class="fas fa-pen"></i> Draw</button>
              <button class="pdf-btn" type="button" id="pdfFloatingTypeAction"><i class="fas fa-keyboard"></i> Type</button>
            </div>
            <div class="pdf-floating-signatures-list" id="pdfFloatingSigList">
              <span style="color:#999;font-size:.82rem;">Loading signatures...</span>
            </div>
          </div>
          <div class="pdf-placing-banner" id="pdfPlacingBanner">
            <span>Tap on the document to place your signature</span>
            <button class="pdf-btn" id="pdfCancelPlacing">Cancel</button>
          </div>
          <div class="pdf-canvas-area" id="pdfCanvasArea">
            <div style="color:#aaa;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading PDF...</div>
          </div>
        </div>
        <div class="pdf-sign-panel hidden" id="pdfSignPanel">
          <div class="pdf-sign-panel-header">
            <div class="pdf-sign-panel-header-left" id="pdfSignPanelTitle">
              <i class="fas fa-signature"></i> Signature Tools
            </div>
            <button class="pdf-sign-panel-close-mobile" id="pdfSignPanelClose" title="Close panel">&times;</button>
          </div>
          <div class="pdf-sign-panel-body" id="pdfSignPanelBody"></div>
        </div>
      </div>
      <div class="pdf-zoom-hint" id="pdfZoomHint"></div>
    `;
    document.body.appendChild(modal);

    canvasArea = modal.querySelector('#pdfCanvasArea');
    toolbar = modal.querySelector('.pdf-toolbar');
    pageInfo = modal.querySelector('#pdfPageInfo');
    signPanel = modal.querySelector('#pdfSignPanel');
    signPanelBody = modal.querySelector('#pdfSignPanelBody');
    placingBanner = modal.querySelector('#pdfPlacingBanner');
    zoomHint = modal.querySelector('#pdfZoomHint');
    topStatusBar = modal.querySelector('#pdfTopStatus');
    floatingSignatures = modal.querySelector('#pdfFloatingSignatures');
    floatingSigList = modal.querySelector('#pdfFloatingSigList');

    document.getElementById('pdfCloseBtn').addEventListener('click', close);
    document.getElementById('pdfZoomIn').addEventListener('click', function () { setZoom(currentScale + 0.2); });
    document.getElementById('pdfZoomOut').addEventListener('click', function () { setZoom(currentScale - 0.2); });
    document.getElementById('pdfZoomFit').addEventListener('click', fitWidth);
    document.getElementById('pdfDownload').addEventListener('click', downloadPdf);
    document.getElementById('pdfVerify').addEventListener('click', verifyIntegrity);
    document.getElementById('pdfAudit').addEventListener('click', showAuditTrail);
    document.getElementById('pdfVersionSelect').addEventListener('change', async function () {
      if (hasPendingTextWrites() && !(await confirmDiscardStagedWrites('switch versions'))) {
        this.value = String(currentVersion || 'latest');
        return;
      }
      currentVersion = this.value || 'latest';

      if (placedSignature && placedSignature.element) {
        placedSignature.element.remove();
        placedSignature = null;
      }
      activeTextEditors = [];
      documentAnnotations = [];
      setAnnotationsDirty(false);
      clearAnnotationDraft();
      exitPlacingMode();

      if (isMobile()) {
        await fitWidthScale();
      } else {
        await loadPdf();
      }
      await loadPdfInfo();
    });
    document.getElementById('pdfToggleSign').addEventListener('click', toggleFloatingSignatures);
    document.getElementById('pdfOpenHistory').addEventListener('click', toggleHistoryPanel);
    document.getElementById('pdfOpenCommentModalBtn').addEventListener('click', openCommentWriteModal);
    document.getElementById('pdfSaveWritesBtn').addEventListener('click', saveAnnotations);
    document.getElementById('pdfSignPanelClose').addEventListener('click', function () {
      closeSignPanel();
    });
    document.getElementById('pdfCloseFloatingSignatures').addEventListener('click', function () {
      hideFloatingSignatures();
    });
    document.getElementById('pdfFloatingUploadAction').addEventListener('click', function () {
      hideFloatingSignatures();
      openSignPanel('upload');
    });
    document.getElementById('pdfFloatingDrawAction').addEventListener('click', function () {
      hideFloatingSignatures();
      openSignPanel('draw');
    });
    document.getElementById('pdfFloatingTypeAction').addEventListener('click', function () {
      hideFloatingSignatures();
      openSignPanel('type');
    });
    document.getElementById('pdfCancelPlacing').addEventListener('click', exitPlacingMode);
    document.getElementById('pdfMoreBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMorePanel();
    });
    document.addEventListener('click', function (e) {
      var panel = document.getElementById('pdfMorePanel');
      if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && e.target.id !== 'pdfMoreBtn') {
        panel.classList.add('hidden');
      }

      if (
        floatingSignatures &&
        floatingSignaturesOpen &&
        !floatingSignatures.contains(e.target) &&
        e.target.id !== 'pdfToggleSign' &&
        !e.target.closest('#pdfToggleSign')
      ) {
        hideFloatingSignatures();
      }
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') {
        if (floatingSignaturesOpen) {
          hideFloatingSignatures();
          return;
        }
        if (signPanel && !signPanel.classList.contains('hidden')) {
          closeSignPanel();
          return;
        }
        close();
        return;
      }
      if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
      if (e.key === 'ArrowRight') goToPage(currentPage + 1);
    });

    setupPinchZoom();
    setupResizeHandler();
  }

  // ── Pinch-to-zoom ──────────────────────────────────────
  function setupPinchZoom() {
    canvasArea.addEventListener('touchstart', onPinchStart, { passive: false });
    canvasArea.addEventListener('touchmove', onPinchMove, { passive: false });
    canvasArea.addEventListener('touchend', onPinchEnd);
  }

  function getTouchDist(t1, t2) {
    var dx = t1.clientX - t2.clientX;
    var dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPinchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
      pinchStartScale = currentScale;
    }
  }

  function onPinchMove(e) {
    if (e.touches.length !== 2 || pinchStartDist === 0) return;
    e.preventDefault();
    var dist = getTouchDist(e.touches[0], e.touches[1]);
    var ratio = dist / pinchStartDist;
    var newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale * ratio));
    showZoomHint(Math.round(newScale * 100) + '%');
    currentScale = newScale;
    document.getElementById('pdfZoomLevel').textContent = Math.round(currentScale * 100) + '%';
  }

  function onPinchEnd(e) {
    if (pinchStartDist > 0 && e.touches.length < 2) {
      pinchStartDist = 0;
      hideZoomHint();
      if (pdfDoc) renderAllPages();
    }
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

  // ── Resize / orientation handling ──────────────────────
  var resizeTimer = null;

  function setupResizeHandler() {
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () {
      setTimeout(onResize, 300);
    });
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!modal || !modal.classList.contains('open') || !pdfDoc) return;
      if (isMobile()) {
        // Avoid interrupting text input when virtual keyboard/orientation triggers resize.
        if (activeTextEditors.length > 0) return;
        fitWidth(true);
      } else {
        renderAllPages();
      }
      if (floatingSignaturesOpen) {
        positionFloatingSignatures();
      }
      resizeSignaturePad();
    }, 200);
  }

  function resizeSignaturePad() {
    if (!signaturePadCanvas || !signaturePadCanvas.parentElement) return;
    var accordion = document.getElementById('drawSigAccordion');
    if (accordion && !accordion.classList.contains('open')) return;
    var imageData = null;
    if (signaturePadCtx) {
      try { imageData = signaturePadCtx.getImageData(0, 0, signaturePadCanvas.width, signaturePadCanvas.height); } catch (e) { /* empty */ }
    }
    var rect = signaturePadCanvas.parentElement.getBoundingClientRect();
    var newW = rect.width - 8;
    if (newW > 0 && Math.abs(signaturePadCanvas.width - newW) > 10) {
      signaturePadCanvas.width = newW;
      signaturePadCtx = signaturePadCanvas.getContext('2d');
      signaturePadCtx.strokeStyle = '#000';
      signaturePadCtx.lineWidth = 2;
      signaturePadCtx.lineCap = 'round';
      signaturePadCtx.lineJoin = 'round';
      if (imageData) {
        try { signaturePadCtx.putImageData(imageData, 0, 0); } catch (e) { /* empty */ }
      }
    }
  }

  // ── Placing mode (mobile) ──────────────────────────────
  function enterPlacingMode() {
    if (annotationDraftPayload) clearAnnotationDraft();
    hideFloatingSignatures();
    isPlacingMode = true;
    if (placingBanner) placingBanner.classList.add('visible');
    if (canvasArea) canvasArea.classList.add('placing-mode');
    if (isMobile()) {
      closeSignPanel();
    }
  }

  function exitPlacingMode() {
    isPlacingMode = false;
    if (placingBanner) placingBanner.classList.remove('visible');
    if (canvasArea) canvasArea.classList.remove('placing-mode');
  }

  function toggleMorePanel() {
    var panel = document.getElementById('pdfMorePanel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
      renderMorePanel();
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  }

  function renderMorePanel() {
    var panel = document.getElementById('pdfMorePanel');
    if (!panel) return;
    if (toolbar) {
      var topOffset = toolbar.offsetHeight + (topStatusBar && topStatusBar.classList.contains('visible') ? topStatusBar.offsetHeight : 0);
      panel.style.top = topOffset + 'px';
    }
    panel.innerHTML = '';

    // ── Version selector ───────────────────────────────────
    var versions = (pdfInfo && Array.isArray(pdfInfo.versions)) ? pdfInfo.versions.slice() : [];
    versions.sort(function (a, b) { return (Number(b.version) || 0) - (Number(a.version) || 0); });

    var vWrap = document.createElement('div');
    vWrap.className = 'pdf-more-version';
    var vLbl = document.createElement('span');
    vLbl.className = 'pdf-more-version-label';
    vLbl.textContent = 'Version';
    var vSel = document.createElement('select');
    vSel.className = 'pdf-version-select';

    var latestOpt = document.createElement('option');
    latestOpt.value = 'latest';
    latestOpt.textContent = versions.length > 0 ? 'Latest (v' + versions[0].version + ')' : 'Latest';
    vSel.appendChild(latestOpt);
    versions.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = String(v.version);
      opt.textContent = 'v' + v.version + ' - ' + (v.version_type === 'signed' ? 'Signed' : 'Original');
      vSel.appendChild(opt);
    });
    vSel.value = String(currentVersion || 'latest');
    vSel.addEventListener('change', async function () {
      if (hasPendingTextWrites() && !(await confirmDiscardStagedWrites('switch versions'))) {
        this.value = String(currentVersion || 'latest');
        return;
      }
      currentVersion = this.value || 'latest';
      var mainSel = document.getElementById('pdfVersionSelect');
      if (mainSel) mainSel.value = currentVersion;
      if (placedSignature && placedSignature.element) {
        placedSignature.element.remove();
        placedSignature = null;
      }
      activeTextEditors = [];
      documentAnnotations = [];
      setAnnotationsDirty(false);
      clearAnnotationDraft();
      exitPlacingMode();
      panel.classList.add('hidden');
      if (isMobile()) { await fitWidthScale(); } else { await loadPdf(); }
      await loadPdfInfo();
    });
    vWrap.appendChild(vLbl);
    vWrap.appendChild(vSel);
    panel.appendChild(vWrap);

    var hr = document.createElement('div');
    hr.className = 'pdf-more-divider';
    panel.appendChild(hr);

    // ── Action buttons ─────────────────────────────────────
    var items = [
      { icon: 'fa-signature', label: 'Saved Signatures', fn: toggleFloatingSignatures },
      { icon: 'fa-upload', label: 'Upload Signature', fn: function () { openSignPanel('upload'); } },
      { icon: 'fa-pen', label: 'Draw Signature', fn: function () { openSignPanel('draw'); } },
      { icon: 'fa-keyboard', label: 'Type Signature', fn: function () { openSignPanel('type'); } },
      { icon: 'fa-history', label: 'Signatures History', fn: toggleHistoryPanel },
      { icon: 'fa-expand-arrows-alt', label: 'Fit Width', fn: fitWidth },
      { icon: 'fa-download', label: 'Download', fn: downloadPdf },
      { icon: 'fa-font', label: 'Write Text (T)', fn: openCommentWriteModal },
      { icon: 'fa-save', label: 'Save Text', fn: saveAnnotations },
    ];
    if (pdfInfo && pdfInfo.is_devteam) {
      items.push({ icon: 'fa-shield-alt', label: 'Verify Integrity', fn: verifyIntegrity });
      items.push({ icon: 'fa-history', label: 'Audit Trail', fn: showAuditTrail });
    }
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'pdf-btn pdf-more-item';
      btn.innerHTML = '<i class="fas ' + item.icon + '"></i> ' + item.label;
      btn.addEventListener('click', function () {
        panel.classList.add('hidden');
        item.fn();
      });
      panel.appendChild(btn);
    });
  }

  function updateDevTeamButtons() {
    var isDevTeam = !!(pdfInfo && pdfInfo.is_devteam);
    var verifyBtn = document.getElementById('pdfVerify');
    var auditBtn = document.getElementById('pdfAudit');
    if (verifyBtn) verifyBtn.style.display = isDevTeam ? '' : 'none';
    if (auditBtn) auditBtn.style.display = isDevTeam ? '' : 'none';
  }

  // ── Load PDF with pdf.js ────────────────────────────────
  async function loadPdf() {
    var url = getPdfStreamUrl(false);
    document.getElementById('pdfFilename').textContent = selectedResolvedFilename || currentFilename;

    if (!window.pdfjsLib) {
      canvasArea.innerHTML = '<div style="color:#f66;padding:20px;">PDF.js library not loaded</div>';
      return;
    }

    try {
      pdfDoc = await pdfjsLib.getDocument(url).promise;
      totalPages = pdfDoc.numPages;
      await renderAllPages();
    } catch (err) {
      canvasArea.innerHTML = '<div style="color:#f66;padding:20px;">Error loading PDF: ' + err.message + '</div>';
    }
  }

  async function fitWidthScale() {
    var url = getPdfStreamUrl(false);
    document.getElementById('pdfFilename').textContent = selectedResolvedFilename || currentFilename;

    if (!window.pdfjsLib) {
      canvasArea.innerHTML = '<div style="color:#f66;padding:20px;">PDF.js library not loaded</div>';
      return;
    }

    try {
      pdfDoc = await pdfjsLib.getDocument(url).promise;
      totalPages = pdfDoc.numPages;
      var page = await pdfDoc.getPage(1);
      var viewport = page.getViewport({ scale: 1 });
      var areaWidth = canvasArea.clientWidth - 20;
      currentScale = Math.max(MIN_SCALE, areaWidth / viewport.width);
      await renderAllPages();
    } catch (err) {
      canvasArea.innerHTML = '<div style="color:#f66;padding:20px;">Error loading PDF: ' + err.message + '</div>';
    }
  }

  async function renderAllPages() {
    activeTextEditors = [];
    canvasArea.innerHTML = '';
    for (var i = 1; i <= totalPages; i++) {
      var page = await pdfDoc.getPage(i);
      var viewport = page.getViewport({ scale: currentScale });

      var wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.dataset.page = i;
      wrapper.style.width = viewport.width + 'px';
      wrapper.style.height = viewport.height + 'px';

      var canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      wrapper.appendChild(canvas);

      (function (pageNum, w) {
        w.addEventListener('click', function (e) {
          if (e.target.closest('.sig-overlay')) return;
          if (e.target.closest('.pdf-text-editor')) return;
          if (e.target.closest('.pdf-write-preview')) return;

          var rect = w.getBoundingClientRect();
          var x = e.clientX - rect.left;
          var y = e.clientY - rect.top;

          if (annotationDraftPayload) {
            createTextEditorOnPage(pageNum, x, y, w, annotationDraftPayload);
            return;
          }

          if (placedSignature || !selectedSavedSig) return;
          if (isMobile() && !isPlacingMode) return;
          placeSignatureOnPage(pageNum, x, y, w);
          exitPlacingMode();
        });
      })(i, wrapper);

      canvasArea.appendChild(wrapper);
    }
    updatePageInfo();
    renderDocumentAnnotations();
  }

  function updatePageInfo() {
    var el = document.getElementById('pdfPageInfo');
    if (el) el.textContent = totalPages + ' pages';
    var zl = document.getElementById('pdfZoomLevel');
    if (zl) zl.textContent = Math.round(currentScale * 100) + '%';
  }

  function renderVersionSelector() {
    var select = document.getElementById('pdfVersionSelect');
    if (!select) return;

    var versions = (pdfInfo && Array.isArray(pdfInfo.versions)) ? pdfInfo.versions.slice() : [];
    versions.sort(function (a, b) {
      return (Number(b.version) || 0) - (Number(a.version) || 0);
    });

    select.innerHTML = '';
    if (versions.length === 0) {
      var only = document.createElement('option');
      only.value = 'latest';
      only.textContent = 'Latest';
      select.appendChild(only);
      select.value = 'latest';
      return;
    }

    var latest = versions[0];
    var latestOption = document.createElement('option');
    latestOption.value = 'latest';
    latestOption.textContent = 'Latest (v' + latest.version + ')';
    select.appendChild(latestOption);

    versions.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = String(v.version);
      var typeLabel = v.version_type === 'signed' ? 'Signed' : 'Original';
      opt.textContent = 'v' + v.version + ' - ' + typeLabel;
      select.appendChild(opt);
    });

    if (String(currentVersion || 'latest') === 'latest') {
      select.value = 'latest';
    } else {
      var hasRequested = versions.some(function (v) {
        return String(v.version) === String(currentVersion);
      });
      select.value = hasRequested ? String(currentVersion) : 'latest';
      if (!hasRequested) {
        currentVersion = 'latest';
      }
    }
  }

  function goToPage(n) {
    if (n < 1 || n > totalPages) return;
    currentPage = n;
    var wrapper = canvasArea.querySelector('[data-page="' + n + '"]');
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function setZoom(scale) {
    if (activeTextEditors.length > 0 && !(await confirmDiscardStagedWrites('change zoom'))) {
      return;
    }
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    currentScale = scale;
    if (pdfDoc) renderAllPages();
  }

  async function fitWidth(skipPendingTextPrompt) {
    if (!skipPendingTextPrompt && activeTextEditors.length > 0 && !(await confirmDiscardStagedWrites('fit page width'))) {
      return;
    }
    if (!pdfDoc) return;
    var areaWidth = canvasArea.clientWidth - (isMobile() ? 20 : 40);
    if (pdfInfo && pdfInfo.pages && pdfInfo.pages.length > 0) {
      currentScale = areaWidth / pdfInfo.pages[0].width;
      renderAllPages();
    } else {
      pdfDoc.getPage(1).then(function (page) {
        var vp = page.getViewport({ scale: 1 });
        currentScale = areaWidth / vp.width;
        renderAllPages();
      });
    }
  }


  // ── Direct text writing on PDF (staged + apply) ────────
  function setAnnotationsDirty(value) {
    annotationsDirty = !!value;
    updateAnnotationControlsState();
  }

  function beginAnnotationDraft(payload) {
    if (String(currentVersion || 'latest') !== 'latest') {
      showSigStatus('Text can only be added on Latest version.', '#b06a00');
      return;
    }
    annotationDraftType = payload && payload.field_type ? String(payload.field_type) : 'text';
    annotationDraftPayload = {
      field_type: annotationDraftType,
      text: String(payload && payload.text ? payload.text : ''),
      font_size: Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, Number(payload && payload.font_size) || 12)),
      color_hex: (payload && payload.color_hex) || '#111111',
    };
    hideFloatingSignatures();
    if (canvasArea) canvasArea.classList.add('annotation-mode');
    if (isMobile()) closeSignPanel();
    updateAnnotationControlsState();
    showSigStatus('Placement mode active. Click on the PDF where this text should be written.', '#00586f');
  }

  function clearAnnotationDraft() {
    annotationDraftType = null;
    annotationDraftPayload = null;
    if (canvasArea) canvasArea.classList.remove('annotation-mode');
    updateAnnotationControlsState();
  }

  function createAnnotationElement(wrapper, annotation) {
    var preview = document.createElement('div');
    preview.className = 'pdf-write-preview pdf-write-preview-' + (annotation.field_type || 'text');
    preview.style.left = (annotation.position_x * currentScale) + 'px';
    preview.style.top = (wrapper.clientHeight - (annotation.position_y * currentScale) - ((Number(annotation.font_size) || 12) * currentScale)) + 'px';
    if (Number(annotation.box_width) > 0) {
      preview.style.width = (Number(annotation.box_width) * currentScale) + 'px';
    }
    preview.style.fontSize = (Math.max(MIN_TEXT_FONT_SIZE, Number(annotation.font_size) || 12) * currentScale) + 'px';
    preview.style.color = annotation.color_hex || '#111111';
    preview.textContent = annotation.text || '';
    wrapper.appendChild(preview);
  }

  function renderDocumentAnnotations() {
    canvasArea.querySelectorAll('.pdf-write-preview').forEach(function (el) {
      el.remove();
    });

    documentAnnotations.forEach(function (annotation) {
      var wrapper = canvasArea.querySelector('[data-page="' + annotation.page_number + '"]');
      if (!wrapper) return;
      createAnnotationElement(wrapper, annotation);
    });
  }

  function createTextEditorOnPage(pageNum, x, y, wrapper, draftPayload) {
    if (!wrapper) return;

    var editor = document.createElement('div');
    editor.className = 'pdf-text-editor';
    editor.style.left = Math.max(0, x - 20) + 'px';
    editor.style.top = Math.max(0, y - 18) + 'px';

    editor.innerHTML =
      '<div class="pdf-text-editor-header">' +
        '<span class="pdf-text-editor-title">Text</span>' +
        '<div class="pdf-text-editor-actions">' +
          '<button class="pdf-btn pdf-text-editor-font-down" type="button" title="Smaller text">a-</button>' +
          '<button class="pdf-btn pdf-text-editor-font-up" type="button" title="Larger text">A+</button>' +
          '<button class="pdf-btn pdf-text-editor-apply" type="button">Apply</button>' +
          '<button class="pdf-btn pdf-text-editor-close" type="button">&times;</button>' +
        '</div>' +
      '</div>' +
      '<textarea class="pdf-text-editor-input" rows="1" placeholder="Type here..."></textarea>' +
      '<div class="pdf-text-editor-resize" title="Resize"></div>';

    wrapper.appendChild(editor);

    var textArea = editor.querySelector('.pdf-text-editor-input');
    var fontSize = Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, Number(draftPayload && draftPayload.font_size) || 12));
    textArea.style.fontSize = (fontSize * currentScale) + 'px';
    textArea.value = String(draftPayload && draftPayload.text ? draftPayload.text : '');
    textArea.focus();

    var entry = {
      id: 'te_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      element: editor,
      wrapper: wrapper,
      page_number: Number(pageNum),
      font_size: fontSize,
      color_hex: '#111111',
      textarea: textArea,
    };
    activeTextEditors.push(entry);

    // Allow dragging from the box border/header, similar to signature placement behavior.
    makeDraggableByHandle(editor, wrapper, editor);
    makeResizable(editor, editor.querySelector('.pdf-text-editor-resize'));
    adjustTextEditorHeight(entry);

    textArea.addEventListener('input', function () {
      adjustTextEditorHeight(entry);
    });

    editor.querySelector('.pdf-text-editor-font-down').addEventListener('click', function (e) {
      e.stopPropagation();
      changeTextEditorFontSize(entry.id, -1);
    });

    editor.querySelector('.pdf-text-editor-font-up').addEventListener('click', function (e) {
      e.stopPropagation();
      changeTextEditorFontSize(entry.id, 1);
    });

    editor.querySelector('.pdf-text-editor-close').addEventListener('click', function (e) {
      e.stopPropagation();
      removeActiveTextEditor(entry.id);
    });

    editor.querySelector('.pdf-text-editor-apply').addEventListener('click', function (e) {
      e.stopPropagation();
      applyTextEditor(entry.id);
    });
  }

  function removeActiveTextEditor(editorId) {
    var index = activeTextEditors.findIndex(function (item) {
      return item.id === editorId;
    });
    if (index === -1) return;
    var item = activeTextEditors[index];
    if (item.element && item.element.parentNode) {
      item.element.parentNode.removeChild(item.element);
    }
    activeTextEditors.splice(index, 1);
  }

  function applyTextEditor(editorId) {
    var entry = activeTextEditors.find(function (item) {
      return item.id === editorId;
    });
    if (!entry || !entry.element || !entry.wrapper) return;

    var text = String(entry.textarea.value || '');
    if (!text.trim()) {
      showSigStatus('Please type text before applying.', '#dc3545');
      return;
    }

    var left = parseFloat(entry.element.style.left) || 0;
    var top = parseFloat(entry.element.style.top) || 0;
    var textMetrics = getTextEditorContentMetrics(entry, left, top);
    var renderedFontPx = getTextEditorRenderedFontSize(entry);
    var boxWidth = (textMetrics.boxWidthPx || 0) / currentScale;
    var boxHeight = (textMetrics.boxHeightPx || 0) / currentScale;

    var annotation = {
      local_id: 'w_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      field_type: 'text',
      text: text,
      font_size: entry.font_size,
      color_hex: entry.color_hex,
      page_number: entry.page_number,
      // Anchor to the textarea content start so applied text stays where the user typed it.
      position_x: textMetrics.textLeftPx / currentScale,
      position_y: (entry.wrapper.clientHeight - textMetrics.textTopPx - renderedFontPx) / currentScale,
      box_width: Number(boxWidth) > 0 ? boxWidth : null,
      box_height: Number(boxHeight) > 0 ? boxHeight : null,
    };

    documentAnnotations.push(annotation);
    createAnnotationElement(entry.wrapper, annotation);
    setAnnotationsDirty(true);
    renderStagedWritesList();
    removeActiveTextEditor(editorId);
    showSigStatus('Text applied. You can add more boxes and then Save text.', '#00586f');
  }

  function getTextEditorContentMetrics(entry, editorLeft, editorTop) {
    var textarea = entry && entry.textarea;
    var textLeftPx = editorLeft;
    var textTopPx = editorTop;
    var boxWidthPx = (entry && entry.element && entry.element.clientWidth) || 0;
    var boxHeightPx = (entry && entry.element && entry.element.clientHeight) || 0;

    if (!textarea) {
      return {
        textLeftPx: textLeftPx,
        textTopPx: textTopPx,
        boxWidthPx: boxWidthPx,
        boxHeightPx: boxHeightPx,
      };
    }

    var style = window.getComputedStyle(textarea);
    var padLeft = Number.parseFloat(style.paddingLeft) || 0;
    var padRight = Number.parseFloat(style.paddingRight) || 0;
    var padTop = Number.parseFloat(style.paddingTop) || 0;

    textLeftPx = editorLeft + textarea.offsetLeft + padLeft;
    textTopPx = editorTop + textarea.offsetTop + padTop;

    var textareaClientWidth = textarea.clientWidth || textarea.offsetWidth || boxWidthPx;
    var textareaClientHeight = textarea.clientHeight || textarea.offsetHeight || boxHeightPx;
    boxWidthPx = Math.max(1, textareaClientWidth - padLeft - padRight);
    boxHeightPx = Math.max(1, textareaClientHeight);

    return {
      textLeftPx: textLeftPx,
      textTopPx: textTopPx,
      boxWidthPx: boxWidthPx,
      boxHeightPx: boxHeightPx,
    };
  }

  function getTextEditorRenderedFontSize(entry) {
    if (!entry) return 12 * currentScale;
    if (entry.textarea) {
      var computed = window.getComputedStyle(entry.textarea);
      var fromStyle = Number.parseFloat(computed.fontSize);
      if (Number.isFinite(fromStyle) && fromStyle > 0) {
        return fromStyle;
      }
    }
    return (Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, Number(entry.font_size) || 12)) * currentScale);
  }

  function adjustTextEditorHeight(entry) {
    if (!entry || !entry.textarea || !entry.element) return;
    var input = entry.textarea;
    input.style.height = 'auto';
    var minInputHeight = Math.round(getTextEditorRenderedFontSize(entry) * 1.2);
    var maxInputHeight = 320;
    var nextInputHeight = Math.max(minInputHeight, Math.min(maxInputHeight, input.scrollHeight));
    input.style.height = nextInputHeight + 'px';
    entry.element.style.height = (nextInputHeight + 16) + 'px';
  }

  function changeTextEditorFontSize(editorId, delta) {
    var entry = activeTextEditors.find(function (item) {
      return item.id === editorId;
    });
    if (!entry || !entry.textarea) return;

    var next = Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, (Number(entry.font_size) || 12) + delta));
    if (next === entry.font_size) {
      if (next === MAX_TEXT_FONT_SIZE) {
        showSigStatus('Maximum text size reached (' + MAX_TEXT_FONT_SIZE + ').', '#6b7280');
      } else if (next === MIN_TEXT_FONT_SIZE) {
        showSigStatus('Minimum text size reached (' + MIN_TEXT_FONT_SIZE + ').', '#6b7280');
      }
      return;
    }

    entry.font_size = next;
    entry.textarea.style.fontSize = (next * currentScale) + 'px';
    adjustTextEditorHeight(entry);
  }

  function getAnnotationsPayload() {
    return documentAnnotations.map(function (annotation) {
      return {
        field_type: annotation.field_type || 'text',
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

  function renderStagedWritesList() {
    var saveToolbarBtn = document.getElementById('pdfSaveWritesBtn');
    if (saveToolbarBtn) {
      saveToolbarBtn.disabled = !(String(currentVersion || 'latest') === 'latest' && documentAnnotations.length > 0);
      saveToolbarBtn.innerHTML = '<i class="fas fa-save"></i> <span class="btn-label">Save text' + (documentAnnotations.length ? ' (' + documentAnnotations.length + ')' : '') + '</span>';
    }

    var queue = document.getElementById('pdfWriteQueue');
    if (!queue) return;
    if (!documentAnnotations.length) {
      queue.innerHTML = '<span style="color:#999;font-size:.82rem;">No staged text yet.</span>';
      return;
    }
    queue.innerHTML = '';
    documentAnnotations.forEach(function (item, idx) {
      var row = document.createElement('div');
      row.className = 'pdf-write-queue-item';
      row.innerHTML =
        '<div class="pdf-write-queue-main">' +
          '<b>' + (item.field_type || 'text').toUpperCase() + '</b> · Page ' + item.page_number + '<br>' +
          '<span>' + String(item.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
        '</div>' +
        '<button class="pdf-write-remove" data-idx="' + idx + '" title="Remove">&times;</button>';
      row.querySelector('.pdf-write-remove').addEventListener('click', function () {
        documentAnnotations.splice(idx, 1);
        renderStagedWritesList();
        renderDocumentAnnotations();
        setAnnotationsDirty(documentAnnotations.length > 0);
      });
      queue.appendChild(row);
    });
  }

  function startWritePlacement(fieldType, text, fontSize) {
    beginAnnotationDraft({
      field_type: fieldType || 'text',
      text: String(text || ''),
      font_size: Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, Number(fontSize) || 12)),
      color_hex: '#111111',
    });
  }

  function openCommentWriteModal() {
    if (String(currentVersion || 'latest') !== 'latest') {
      showSigStatus('Text can only be added on Latest version.', '#b06a00');
      return;
    }

    if (annotationDraftPayload) {
      clearAnnotationDraft();
      showSigStatus('Text mode disabled. You can place a signature now.', '#6b7280');
      return;
    }

    startWritePlacement('text', '', 12);
    showSigStatus('Text mode enabled. Click on the PDF to create a text box.', '#00586f');
  }

  async function saveAnnotations() {
    if (String(currentVersion || 'latest') !== 'latest') {
      showSigStatus('Text can only be added on Latest version.', '#b06a00');
      return;
    }
    if (!annotationsDirty || !documentAnnotations.length) {
      showSigStatus('No staged text to apply.', '#6b7280');
      return;
    }

    if (activeTextEditors.length > 0) {
      showSigStatus('Apply or close active text boxes before saving.', '#b06a00');
      return;
    }

    var saveBtn = document.getElementById('pdfSaveWritesBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="btn-label">Saving...</span>';
    }

    try {
      var res = await fetch('/pdf-sign/text/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          RowID: currentRowID,
          filename: currentFilename,
          version: currentVersion,
          writes: getAnnotationsPayload(),
        }),
      });
      var json = await res.json();
      if (!res.ok || json.result !== 1) {
        if (json.error === 'file_locked') {
          showModal(json.message || 'The file is currently open by another user. Please try again later.', null, null, { title: 'File Locked', okText: 'OK', type: 'warning' });
          showSigStatus('', '#6b7280');
          return;
        }
        throw new Error(json.error || 'Could not apply text to PDF');
      }

      documentAnnotations = [];
      setAnnotationsDirty(false);
      clearAnnotationDraft();
      renderStagedWritesList();
      renderDocumentAnnotations();

      currentVersion = 'latest';
      showSigStatus('Text saved to PDF. Version ' + json.version + ' created (' + json.signed_filename + ').', '#155724');

      if (isMobile()) {
        await fitWidthScale();
      } else {
        await loadPdf();
      }
      await loadPdfInfo();
      if (typeof window.ArchivosApproval === 'function') {
        window.ArchivosApproval(currentRowID, { highlightFilename: currentFilename });
      }
    } catch (e) {
      showSigStatus('Error saving text: ' + e.message, '#dc3545');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> <span class="btn-label">Save text' + (documentAnnotations.length ? ' (' + documentAnnotations.length + ')' : '') + '</span>';
      }
    }
  }

  function updateAnnotationControlsState() {
    var writeBtn = document.getElementById('pdfOpenCommentModalBtn');
    var saveBtn = document.getElementById('pdfSaveWritesBtn');
    var canEdit = String(currentVersion || 'latest') === 'latest';

    if (writeBtn) {
      writeBtn.disabled = !canEdit;
      writeBtn.classList.toggle('active', !!annotationDraftPayload);
    }
    if (saveBtn) {
      saveBtn.disabled = !canEdit || !annotationsDirty || !documentAnnotations.length || activeTextEditors.length > 0;
    }
  }

  function makeDraggableByHandle(el, container, handle) {
    if (!handle) return;
    var startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });

    function onDown(e) {
      if (
        e.target.closest('button') ||
        e.target.closest('.pdf-text-editor-input') ||
        e.target.closest('.pdf-text-editor-resize')
      ) return;
      e.preventDefault();
      var ev = e.touches ? e.touches[0] : e;
      startX = ev.clientX;
      startY = ev.clientY;
      origLeft = parseInt(el.style.left, 10) || 0;
      origTop = parseInt(el.style.top, 10) || 0;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      e.preventDefault();
      var ev = e.touches ? e.touches[0] : e;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      var newLeft = origLeft + dx;
      var newTop = origTop + dy;
      var cw = container.clientWidth;
      var ch = container.clientHeight;
      newLeft = Math.max(0, Math.min(cw - el.offsetWidth, newLeft));
      newTop = Math.max(0, Math.min(ch - el.offsetHeight, newTop));
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not read signature image')); };
      img.src = dataUrl;
    });
  }

  function getSignatureAlphaBounds(imageData, width, height, minAlpha) {
    var data = imageData.data;
    var left = width;
    var right = -1;
    var top = height;
    var bottom = -1;

    for (var y = 0; y < height; y++) {
      var rowOffset = y * width * 4;
      for (var x = 0; x < width; x++) {
        var alpha = data[rowOffset + (x * 4) + 3];
        if (alpha < minAlpha) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }

    if (right < left || bottom < top) {
      return null;
    }

    return {
      left: left,
      right: right,
      top: top,
      bottom: bottom,
      width: (right - left + 1),
      height: (bottom - top + 1),
    };
  }

  function getBorderColorStats(imageData, width, height) {
    var data = imageData.data;
    var samples = [];
    var stepX = Math.max(1, Math.floor(width / 28));
    var stepY = Math.max(1, Math.floor(height / 20));

    function pushPixel(x, y) {
      var i = ((y * width) + x) * 4;
      var a = data[i + 3];
      if (a < 180) return;
      samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }

    for (var x = 0; x < width; x += stepX) {
      pushPixel(x, 0);
      pushPixel(x, height - 1);
    }
    for (var y = 0; y < height; y += stepY) {
      pushPixel(0, y);
      pushPixel(width - 1, y);
    }

    if (!samples.length) return null;

    var sumR = 0;
    var sumG = 0;
    var sumB = 0;
    samples.forEach(function (p) {
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
    });

    var avgR = sumR / samples.length;
    var avgG = sumG / samples.length;
    var avgB = sumB / samples.length;
    var variance = 0;

    samples.forEach(function (p) {
      var dr = p.r - avgR;
      var dg = p.g - avgG;
      var db = p.b - avgB;
      variance += (dr * dr + dg * dg + db * db) / 3;
    });

    variance = variance / samples.length;

    return {
      r: avgR,
      g: avgG,
      b: avgB,
      brightness: (avgR + avgG + avgB) / 3,
      variance: variance,
    };
  }

  function stripLikelyBackground(imageData, width, height, distanceThreshold) {
    var stats = getBorderColorStats(imageData, width, height);
    if (!stats) return false;

    var looksLikeFlatLightBackground = stats.brightness >= 130 && stats.variance <= 1200;
    if (!looksLikeFlatLightBackground) {
      return false;
    }

    var data = imageData.data;
    var thresholdSq = distanceThreshold * distanceThreshold;
    var removed = 0;

    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a === 0) continue;

      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var dr = r - stats.r;
      var dg = g - stats.g;
      var db = b - stats.b;
      var distSq = dr * dr + dg * dg + db * db;

      if (distSq <= thresholdSq || (r > 246 && g > 246 && b > 246)) {
        data[i + 3] = 0;
        removed++;
      }
    }

    return removed > 0;
  }

  async function normalizeSignatureDataUrl(signatureData, options) {
    options = options || {};

    var removeBackground = !!options.removeBackground;
    var trimPadding = Number(options.trimPadding);
    if (!Number.isFinite(trimPadding)) trimPadding = SIGNATURE_TRIM_PADDING;

    var image = await loadImageFromDataUrl(signatureData);
    var srcCanvas = document.createElement('canvas');
    var srcW = Math.max(1, image.naturalWidth || image.width || 1);
    var srcH = Math.max(1, image.naturalHeight || image.height || 1);

    srcCanvas.width = srcW;
    srcCanvas.height = srcH;

    var srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    srcCtx.clearRect(0, 0, srcW, srcH);
    srcCtx.drawImage(image, 0, 0, srcW, srcH);

    var imageData = srcCtx.getImageData(0, 0, srcW, srcH);
    var originalPixels = new Uint8ClampedArray(imageData.data);
    var removedBackground = false;

    if (removeBackground) {
      removedBackground = stripLikelyBackground(imageData, srcW, srcH, SIGNATURE_BG_DISTANCE);
      if (removedBackground) {
        srcCtx.putImageData(imageData, 0, 0);
      }
    }

    var bounds = getSignatureAlphaBounds(imageData, srcW, srcH, SIGNATURE_MIN_ALPHA);

    if (!bounds) {
      // Fallback to original pixels if background removal over-cleaned the image.
      imageData.data.set(originalPixels);
      srcCtx.putImageData(imageData, 0, 0);
      bounds = getSignatureAlphaBounds(imageData, srcW, srcH, SIGNATURE_MIN_ALPHA);
    }

    if (!bounds) {
      throw new Error('No visible signature pixels found');
    }

    var cropLeft = Math.max(0, bounds.left - trimPadding);
    var cropTop = Math.max(0, bounds.top - trimPadding);
    var cropRight = Math.min(srcW - 1, bounds.right + trimPadding);
    var cropBottom = Math.min(srcH - 1, bounds.bottom + trimPadding);
    var cropW = Math.max(1, cropRight - cropLeft + 1);
    var cropH = Math.max(1, cropBottom - cropTop + 1);

    var cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    var croppedCtx = cropped.getContext('2d');
    croppedCtx.clearRect(0, 0, cropW, cropH);
    croppedCtx.drawImage(srcCanvas, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

    var scale = Math.min(1, SIGNATURE_MAX_EXPORT_WIDTH / cropW, SIGNATURE_MAX_EXPORT_HEIGHT / cropH);
    var outW = Math.max(1, Math.round(cropW * scale));
    var outH = Math.max(1, Math.round(cropH * scale));

    var output = document.createElement('canvas');
    output.width = outW;
    output.height = outH;
    var outCtx = output.getContext('2d');
    outCtx.clearRect(0, 0, outW, outH);
    outCtx.drawImage(cropped, 0, 0, cropW, cropH, 0, 0, outW, outH);

    return {
      dataUrl: output.toDataURL('image/png'),
      meta: {
        width: outW,
        height: outH,
        aspect: outW / outH,
        removedBackground: removedBackground,
      },
    };
  }

  function getSignaturePlacementSize(wrapper, signatureMeta) {
    var wrapperW = wrapper ? wrapper.clientWidth : 0;
    var wrapperH = wrapper ? wrapper.clientHeight : 0;
    var maxW = isMobile() ? 230 : 340;
    var maxH = isMobile() ? 110 : 130;

    if (wrapperW > 0) {
      maxW = Math.max(80, Math.min(maxW, Math.round(wrapperW * 0.55)));
    }
    if (wrapperH > 0) {
      maxH = Math.max(36, Math.min(maxH, Math.round(wrapperH * 0.32)));
    }

    var metaW = Number(signatureMeta && signatureMeta.width);
    var metaH = Number(signatureMeta && signatureMeta.height);
    if (Number.isFinite(metaW) && Number.isFinite(metaH) && metaW > 0 && metaH > 0) {
      var fitScale = Math.min(1, maxW / metaW, maxH / metaH);
      var naturalW = Math.max(60, Math.round(metaW * fitScale));
      var naturalH = Math.max(30, Math.round(metaH * fitScale));
      return {
        width: naturalW,
        height: naturalH,
      };
    }

    var aspect = Number(signatureMeta && signatureMeta.aspect);
    if (!Number.isFinite(aspect) || aspect <= 0) {
      aspect = 2.4;
    }
    aspect = clamp(aspect, 1.2, 8.5);

    var defaultH = isMobile() ? 54 : 72;
    var minW = isMobile() ? 80 : 96;

    var width = clamp(defaultH * aspect, minW, maxW);
    var height = width / aspect;

    var minH = isMobile() ? 30 : 34;

    height = clamp(height, minH, maxH);
    width = height * aspect;

    if (wrapperW > 0) {
      width = Math.min(width, Math.max(minW, wrapperW - 10));
      height = width / aspect;
    }
    if (wrapperH > 0) {
      height = Math.min(height, Math.max(minH, wrapperH - 10));
      width = height * aspect;
    }

    return {
      width: Math.max(60, Math.round(width)),
      height: Math.max(30, Math.round(height)),
    };
  }

  // ── Signature placement on page ─────────────────────────
  function placeSignatureOnPage(pageNum, x, y, wrapper) {
    clearPlacedSignature();

    var initialSize = getSignaturePlacementSize(wrapper, selectedSavedSigMeta);
    var sigW = initialSize.width;
    var sigH = initialSize.height;
    var maxX = Math.max(0, wrapper.clientWidth - sigW);
    var maxY = Math.max(0, wrapper.clientHeight - sigH);
    var posX = clamp(x - sigW / 2, 0, maxX);
    var posY = clamp(y - sigH / 2, 0, maxY);

    var overlay = document.createElement('div');
    overlay.className = 'sig-overlay';
    overlay.style.left = posX + 'px';
    overlay.style.top = posY + 'px';
    overlay.style.width = sigW + 'px';
    overlay.style.height = sigH + 'px';

    var img = document.createElement('img');
    img.src = selectedSavedSig;
    overlay.appendChild(img);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'sig-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      clearPlacedSignature();
    });
    overlay.appendChild(removeBtn);

    var signBtn = document.createElement('button');
    signBtn.type = 'button';
    signBtn.className = 'sig-confirm';
    signBtn.innerHTML = '<i class="fas fa-pen-nib"></i> Sign';
    signBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      requestSignConfirmation();
    });
    overlay.appendChild(signBtn);

    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'sig-resize';
    overlay.appendChild(resizeHandle);

    makeDraggable(overlay, wrapper);
    makeResizable(overlay, resizeHandle);

    wrapper.appendChild(overlay);
    placedSignature = {
      element: overlay, pageNum: pageNum,
      x: posX, y: posY, w: sigW, h: sigH,
      imgData: selectedSavedSig,
      imgMeta: selectedSavedSigMeta,
      aspectRatio: sigW / Math.max(1, sigH),
      maxW: Math.round(sigW * 1.08),
      maxH: Math.round(sigH * 1.08),
    };

    if (isMobile()) {
      showSigStatus('Signature placed. Tap "Sign" on the signature box.', '#00586f');
    }
  }

  function makeDraggable(el, container) {
    var startX, startY, origLeft, origTop;

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });

    function onDown(e) {
      if (
        e.target.classList.contains('sig-remove') ||
        e.target.classList.contains('sig-resize') ||
        e.target.classList.contains('sig-confirm') ||
        e.target.closest('.sig-confirm')
      ) return;
      e.preventDefault();
      var ev = e.touches ? e.touches[0] : e;
      startX = ev.clientX;
      startY = ev.clientY;
      origLeft = parseInt(el.style.left) || 0;
      origTop = parseInt(el.style.top) || 0;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      e.preventDefault();
      var ev = e.touches ? e.touches[0] : e;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      var newLeft = origLeft + dx;
      var newTop = origTop + dy;
      var cw = container.clientWidth;
      var ch = container.clientHeight;
      newLeft = Math.max(0, Math.min(cw - el.offsetWidth, newLeft));
      newTop = Math.max(0, Math.min(ch - el.offsetHeight, newTop));
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
      if (placedSignature) {
        placedSignature.x = newLeft;
        placedSignature.y = newTop;
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
  }

  function makeResizable(el, handle) {
    var startX, startY, origW, origH;

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });

    function onDown(e) {
      e.preventDefault();
      e.stopPropagation();
      var ev = e.touches ? e.touches[0] : e;
      startX = ev.clientX;
      startY = ev.clientY;
      origW = el.offsetWidth;
      origH = el.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      e.preventDefault();
      var ev = e.touches ? e.touches[0] : e;
      var newW = origW + (ev.clientX - startX);
      var newH = origH + (ev.clientY - startY);
      var isSignatureOverlay = el.classList.contains('sig-overlay');

      if (isSignatureOverlay) {
        var ratio = (placedSignature && placedSignature.element === el && placedSignature.aspectRatio)
          ? placedSignature.aspectRatio
          : (origW / Math.max(1, origH));
        var primaryDelta = Math.abs(ev.clientX - startX) >= Math.abs(ev.clientY - startY)
          ? (ev.clientX - startX)
          : (ev.clientY - startY);
        newW = origW + primaryDelta;
        newW = Math.max(60, newW);
        if (placedSignature && placedSignature.element === el) {
          if (placedSignature.maxW) newW = Math.min(newW, placedSignature.maxW);
        }
        newH = Math.max(30, newW / Math.max(0.1, ratio));
        if (placedSignature && placedSignature.element === el) {
          if (placedSignature.maxH && newH > placedSignature.maxH) {
            newH = placedSignature.maxH;
            newW = newH * Math.max(0.1, ratio);
          }
        }
      } else {
        newW = Math.max(60, newW);
        newH = Math.max(30, newH);
      }

      el.style.width = newW + 'px';
      el.style.height = newH + 'px';
      if (placedSignature) {
        placedSignature.w = newW;
        placedSignature.h = newH;
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
  }

  // ── Sign actions (floating + focused panel views) ──────
  function openSignPanel(mode) {
    signPanelMode = mode || signPanelMode || 'upload';
    hideFloatingSignatures();
    if (!signPanel) return;
    signPanel.classList.remove('hidden');
    renderSignPanel();
    setToolbarActionState();
  }

  function toggleHistoryPanel() {
    if (signPanel && !signPanel.classList.contains('hidden') && signPanelMode === 'history') {
      closeSignPanel();
      return;
    }
    openSignPanel('history');
  }

  function closeSignPanel() {
    if (!signPanel) return;
    signPanel.classList.add('hidden');
    setToolbarActionState();
  }

  function positionFloatingSignatures() {
    if (!floatingSignatures || !toolbar) return;
    var topOffset = toolbar.offsetHeight + (topStatusBar && topStatusBar.classList.contains('visible') ? topStatusBar.offsetHeight : 0) + 8;
    floatingSignatures.style.top = topOffset + 'px';
  }

  function toggleFloatingSignatures() {
    if (floatingSignaturesOpen) {
      hideFloatingSignatures();
      return;
    }
    closeSignPanel();
    renderFloatingSignaturesList();
    positionFloatingSignatures();
    floatingSignatures.classList.remove('hidden');
    floatingSignaturesOpen = true;
    setToolbarActionState();
  }

  function hideFloatingSignatures() {
    if (!floatingSignatures) return;
    floatingSignatures.classList.add('hidden');
    floatingSignaturesOpen = false;
    setToolbarActionState();
  }

  function renderFloatingSignaturesList() {
    if (!floatingSigList) return;

    if (!savedSignatures.length) {
      floatingSigList.innerHTML =
        '<div class="pdf-empty-signatures">' +
          '<span>No saved signatures yet.</span>' +
          '<span style="font-size:.76rem;">Use Upload, Draw, or Type above to create one.</span>' +
        '</div>';
      return;
    }

    floatingSigList.innerHTML = '';
    savedSignatures.forEach(function (sig) {
      var row = document.createElement('div');
      row.className = 'saved-sig-quick-row';

      var isSelected = selectedSavedSigId && String(selectedSavedSigId) === String(sig.id);
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'saved-sig-quick-item' + (isSelected ? ' selected' : '');
      item.setAttribute('data-sig-id', String(sig.id));
      item.innerHTML =
        '<img src="' + (sig.signature_data || '') + '" alt="signature" />' +
        '<span class="saved-sig-quick-label">' + (sig.label || ('Signature #' + sig.id)) + '</span>';

      item.addEventListener('click', function () {
        activateSavedSignature(sig, true);
        hideFloatingSignatures();
      });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'saved-sig-quick-delete';
      deleteBtn.title = 'Delete signature';
      deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
      deleteBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        deleteSavedSignature(sig);
      });

      row.appendChild(item);
      row.appendChild(deleteBtn);
      floatingSigList.appendChild(row);
    });
  }

  function renderSignPanel() {
    if (!signPanelBody) return;

    var title = document.getElementById('pdfSignPanelTitle');
    var mode = String(signPanelMode || 'upload').toLowerCase();

    if (mode === 'history') {
      if (title) title.innerHTML = '<i class="fas fa-history"></i> Signatures History';
      signPanelBody.innerHTML =
        '<div class="sign-section" id="sigExistingSection">' +
          '<div class="sign-section-title">Signatures on this Document</div>' +
          '<div id="existingSigList"><span style="color:#999;font-size:.85rem;">Loading...</span></div>' +
        '</div>' +
        '<div id="sigStatusMsg" style="margin-top:10px;font-size:.82rem;"></div>';
      renderExistingSignaturesList();
    } else if (mode === 'type') {
      if (title) title.innerHTML = '<i class="fas fa-keyboard"></i> Type Signature';
      signPanelBody.innerHTML =
        '<div class="sign-section">' +
          '<div class="sign-section-title">Typed Signature (Non-legal)</div>' +
          '<label class="pdf-write-label" for="typedSigInput">Signature Text</label>' +
          '<input class="pdf-write-input typed-sig-input" id="typedSigInput" maxlength="' + TYPED_SIGNATURE_MAX_CHARS + '" placeholder="Type your name">' +
          '<label class="pdf-write-label" for="typedSigStyle">Style</label>' +
          '<select class="pdf-version-select typed-sig-style" id="typedSigStyle">' +
            '<option value="adobe">Regular</option>' +
            '<option value="elegant">Elegant</option>' +
            '<option value="clean">Clean Script</option>' +
          '</select>' +
          '<label class="pdf-write-label" for="typedSigSize">Size</label>' +
          '<input class="typed-sig-size" id="typedSigSize" type="range" min="' + TYPED_SIGNATURE_MIN_SIZE + '" max="' + TYPED_SIGNATURE_MAX_SIZE + '" value="' + TYPED_SIGNATURE_DEFAULT_SIZE + '">' +
          '<div class="typed-sig-size-label" id="typedSigSizeLabel">' + TYPED_SIGNATURE_DEFAULT_SIZE + ' px</div>' +
          '<div class="typed-sig-preview-wrap">' +
            '<div class="typed-sig-preview" id="typedSigPreview">' +
              '<span id="typedSigPreviewText">Your typed signature</span>' +
            '</div>' +
          '</div>' +
          '<div class="signature-pad-actions">' +
            '<button class="pdf-btn" id="sigTypeUse" style="background:#00586f;color:#fff;"><i class="fas fa-check"></i> <span class="btn-label">Use</span></button>' +
            '<button class="pdf-btn" id="sigTypeSave"><i class="fas fa-save"></i> <span class="btn-label">Save</span></button>' +
          '</div>' +
          '<div class="typed-sig-note">Typed signatures are for display only.</div>' +
        '</div>' +
        '<div class="sign-section">' +
          '<div class="sign-section-title">Saved Signatures</div>' +
          '<div id="savedSigList"><span style="color:#999;font-size:.85rem;">Loading...</span></div>' +
        '</div>' +
        '<div id="sigStatusMsg" style="margin-top:10px;font-size:.82rem;"></div>';
      setTimeout(initTypedSignaturePanel, 20);
      renderSavedSignatures();
    } else if (mode === 'draw') {
      if (title) title.innerHTML = '<i class="fas fa-pen"></i> Draw Signature';
      signPanelBody.innerHTML =
        '<div class="sign-section">' +
          '<div class="sign-section-title">Draw Signature</div>' +
          '<div class="signature-pad-container"><canvas id="signaturePadCanvas"></canvas></div>' +
          '<div class="signature-pad-actions">' +
            '<button class="pdf-btn" id="sigPadClear"><i class="fas fa-eraser"></i> <span class="btn-label">Clear</span></button>' +
            '<button class="pdf-btn" id="sigPadUse" style="background:#00586f;color:#fff;"><i class="fas fa-check"></i> <span class="btn-label">Use</span></button>' +
            '<button class="pdf-btn" id="sigPadSave"><i class="fas fa-save"></i> <span class="btn-label">Save</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="sign-section">' +
          '<div class="sign-section-title">Saved Signatures</div>' +
          '<div id="savedSigList"><span style="color:#999;font-size:.85rem;">Loading...</span></div>' +
        '</div>' +
        '<div id="sigStatusMsg" style="margin-top:10px;font-size:.82rem;"></div>';
      setTimeout(initSignaturePad, 40);
      renderSavedSignatures();
    } else {
      if (title) title.innerHTML = '<i class="fas fa-upload"></i> Upload Signature';
      signPanelBody.innerHTML =
        '<div class="sign-section">' +
          '<div class="sign-section-title">Upload Signature Image</div>' +
          '<div class="sig-upload-area" id="sigUploadArea">' +
            '<i class="fas fa-cloud-upload-alt"></i><br>' +
            'Click or drag an image here' +
            '<input type="file" accept="image/png,image/jpeg" id="sigFileInput" style="display:none;">' +
          '</div>' +
        '</div>' +
        '<div class="sign-section">' +
          '<div class="sign-section-title">Saved Signatures</div>' +
          '<div id="savedSigList"><span style="color:#999;font-size:.85rem;">Loading...</span></div>' +
        '</div>' +
        '<div id="sigStatusMsg" style="margin-top:10px;font-size:.82rem;"></div>';
      setupUploadArea();
      renderSavedSignatures();
    }

    renderStagedWritesList();
    updateSignActionsState();
    updateAnnotationControlsState();
  }

  function setToolbarActionState() {
    var btnSign = document.getElementById('pdfToggleSign');
    var btnHistory = document.getElementById('pdfOpenHistory');
    var panelOpen = !!(signPanel && !signPanel.classList.contains('hidden'));

    if (btnSign) btnSign.classList.toggle('active', !!floatingSignaturesOpen);
    if (btnHistory) btnHistory.classList.toggle('active', panelOpen && signPanelMode === 'history');
  }

  function updateSignActionsState() {
    setToolbarActionState();
  }

  function getTypedSignatureStyleConfig(styleKey) {
    var key = String(styleKey || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(TYPED_SIGNATURE_STYLES, key)) {
      return TYPED_SIGNATURE_STYLES[key];
    }
    return TYPED_SIGNATURE_STYLES.adobe;
  }

  function renderTypedSignaturePreview() {
    var input = document.getElementById('typedSigInput');
    var styleSelect = document.getElementById('typedSigStyle');
    var sizeInput = document.getElementById('typedSigSize');
    var sizeLabel = document.getElementById('typedSigSizeLabel');
    var previewText = document.getElementById('typedSigPreviewText');
    if (!input || !styleSelect || !sizeInput || !previewText) return;

    var text = String(input.value || '').trim();
    var style = getTypedSignatureStyleConfig(styleSelect.value);
    var size = Math.max(TYPED_SIGNATURE_MIN_SIZE, Math.min(TYPED_SIGNATURE_MAX_SIZE, Number(sizeInput.value) || TYPED_SIGNATURE_DEFAULT_SIZE));

    previewText.textContent = text || 'Your typed signature';
    previewText.style.fontFamily = style.fontFamily;
    previewText.style.fontWeight = style.fontWeight;
    previewText.style.fontStyle = style.fontStyle;
    previewText.style.fontSize = size + 'px';
    previewText.style.letterSpacing = (Number(style.letterSpacingEm) || 0) + 'em';

    if (sizeLabel) {
      sizeLabel.textContent = size + ' px';
    }
  }

  function initTypedSignaturePanel() {
    var input = document.getElementById('typedSigInput');
    var styleSelect = document.getElementById('typedSigStyle');
    var sizeInput = document.getElementById('typedSigSize');
    var useBtn = document.getElementById('sigTypeUse');
    var saveBtn = document.getElementById('sigTypeSave');
    if (!input || !styleSelect || !sizeInput || !useBtn || !saveBtn) return;

    input.addEventListener('input', renderTypedSignaturePreview);
    styleSelect.addEventListener('change', renderTypedSignaturePreview);
    sizeInput.addEventListener('input', renderTypedSignaturePreview);
    useBtn.addEventListener('click', useTypedSignature);
    saveBtn.addEventListener('click', saveTypedSignature);

    renderTypedSignaturePreview();
    input.focus();
  }

  async function buildTypedSignatureData() {
    var input = document.getElementById('typedSigInput');
    var styleSelect = document.getElementById('typedSigStyle');
    var sizeInput = document.getElementById('typedSigSize');
    if (!input || !styleSelect || !sizeInput) {
      throw new Error('Typed signature editor is not ready');
    }

    var text = String(input.value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      throw new Error('Please type your signature text first');
    }

    var style = getTypedSignatureStyleConfig(styleSelect.value);
    var fontSize = Math.max(TYPED_SIGNATURE_MIN_SIZE, Math.min(TYPED_SIGNATURE_MAX_SIZE, Number(sizeInput.value) || TYPED_SIGNATURE_DEFAULT_SIZE));
    var fontSpec = style.fontStyle + ' ' + style.fontWeight + ' ' + fontSize + 'px ' + style.fontFamily;

    var measureCanvas = document.createElement('canvas');
    var measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = fontSpec;
    var metrics = measureCtx.measureText(text);
    var ascent = Number(metrics.actualBoundingBoxAscent) || Math.round(fontSize * 0.84);
    var descent = Number(metrics.actualBoundingBoxDescent) || Math.round(fontSize * 0.24);
    var textWidth = Math.max(1, Math.ceil(metrics.width));
    var padX = 26;
    var padY = 20;

    var canvas = document.createElement('canvas');
    canvas.width = Math.max(220, Math.min(1100, textWidth + (padX * 2)));
    canvas.height = Math.max(90, Math.min(420, ascent + descent + (padY * 2)));

    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontSpec;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.translate(0, 0);
    ctx.fillText(text, padX, padY + ascent);

    var optimized = await normalizeSignatureDataUrl(canvas.toDataURL('image/png'), {
      removeBackground: false,
      trimPadding: 4,
    });

    return {
      dataUrl: optimized.dataUrl,
      meta: optimized.meta,
      text: text,
    };
  }

  async function useTypedSignature() {
    try {
      var prepared = await buildTypedSignatureData();
      selectedSavedSig = prepared.dataUrl;
      selectedSavedSigId = null;
      selectedSavedSigMeta = prepared.meta;
      clearPlacedSignature();
      updateSignActionsState();
      enterPlacingMode();
      showSigStatus('Typed signature ready. Click on the document to place it, then tap "Sign".', '#00586f');
    } catch (e) {
      showSigStatus(e.message || 'Could not create typed signature.', '#dc3545');
    }
  }

  function buildTypedSignatureLabel(signatureText) {
    var text = String(signatureText || '').replace(/\s+/g, ' ').trim();
    if (!text) text = 'Typed signature';
    if (text.length > 46) text = text.substring(0, 46);
    return ('Typed ' + text + ' ' + new Date().toLocaleDateString()).substring(0, 100);
  }

  async function saveTypedSignature() {
    try {
      var prepared = await buildTypedSignatureData();
      var saved = await saveSignatureData(prepared.dataUrl, buildTypedSignatureLabel(prepared.text));
      await loadUserSignatures(saved.id, true);
      showSigStatus('Typed signature saved and activated.', '#155724');
    } catch (e) {
      showSigStatus(e.message || 'Could not save typed signature.', '#dc3545');
    }
  }

  // ── Signature Pad (drawing) ─────────────────────────────
  function initSignaturePad() {
    signaturePadCanvas = document.getElementById('signaturePadCanvas');
    if (!signaturePadCanvas || !signaturePadCanvas.parentElement) return;
    var rect = signaturePadCanvas.parentElement.getBoundingClientRect();
    signaturePadCanvas.width = Math.max(100, rect.width - 8);
    signaturePadCanvas.height = isMobile() ? (window.innerWidth <= 480 ? 100 : 120) : 150;
    signaturePadCtx = signaturePadCanvas.getContext('2d');
    signaturePadCtx.strokeStyle = '#000';
    signaturePadCtx.lineWidth = 2;
    signaturePadCtx.lineCap = 'round';
    signaturePadCtx.lineJoin = 'round';

    signaturePadCanvas.addEventListener('mousedown', padDown);
    signaturePadCanvas.addEventListener('mousemove', padMove);
    signaturePadCanvas.addEventListener('mouseup', padUp);
    signaturePadCanvas.addEventListener('mouseleave', padUp);
    signaturePadCanvas.addEventListener('touchstart', padDown, { passive: false });
    signaturePadCanvas.addEventListener('touchmove', padMove, { passive: false });
    signaturePadCanvas.addEventListener('touchend', padUp);

    document.getElementById('sigPadClear').addEventListener('click', clearPad);
    document.getElementById('sigPadUse').addEventListener('click', useDrawnSignature);
    document.getElementById('sigPadSave').addEventListener('click', saveDrawnSignature);
  }

  function getCanvasPoint(e) {
    var ev = e.touches ? e.touches[0] : e;
    var rect = signaturePadCanvas.getBoundingClientRect();
    var scaleX = signaturePadCanvas.width / rect.width;
    var scaleY = signaturePadCanvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY
    };
  }

  function padDown(e) {
    e.preventDefault();
    isDrawing = true;
    lastPoint = getCanvasPoint(e);
    signaturePadCtx.beginPath();
    signaturePadCtx.moveTo(lastPoint.x, lastPoint.y);
  }

  function padMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    var pt = getCanvasPoint(e);
    signaturePadCtx.lineTo(pt.x, pt.y);
    signaturePadCtx.stroke();
    lastPoint = pt;
  }

  function padUp() { isDrawing = false; }

  function clearPad() {
    signaturePadCtx.clearRect(0, 0, signaturePadCanvas.width, signaturePadCanvas.height);
  }

  function isPadEmpty() {
    var data = signaturePadCtx.getImageData(0, 0, signaturePadCanvas.width, signaturePadCanvas.height).data;
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  }

  async function useDrawnSignature() {
    if (isPadEmpty()) return showModalAlert('Signature', 'Please draw a signature first.');
    try {
      var optimized = await normalizeSignatureDataUrl(signaturePadCanvas.toDataURL('image/png'), {
        removeBackground: false,
      });
      selectedSavedSig = optimized.dataUrl;
      selectedSavedSigId = null;
      selectedSavedSigMeta = optimized.meta;
      clearPlacedSignature();
      updateSignActionsState();
      enterPlacingMode();
      showSigStatus('Signature ready. Click on the document to place it, then tap "Sign".', '#00586f');
    } catch (e) {
      showSigStatus('Could not prepare drawn signature: ' + e.message, '#dc3545');
    }
  }

  async function saveDrawnSignature() {
    if (isPadEmpty()) return showModalAlert('Signature', 'Please draw a signature first.');
    try {
      var optimized = await normalizeSignatureDataUrl(signaturePadCanvas.toDataURL('image/png'), {
        removeBackground: false,
      });
      var data = optimized.dataUrl;
      var saved = await saveSignatureData(data, 'Drawn ' + new Date().toLocaleDateString());
      await loadUserSignatures(saved.id);
      showSigStatus('Signature saved!', '#155724');
    } catch (e) {
      showSigStatus('Error: ' + e.message, '#dc3545');
    }
  }

  // ── Upload signature image ──────────────────────────────
  function setupUploadArea() {
    var area = document.getElementById('sigUploadArea');
    var input = document.getElementById('sigFileInput');

    area.addEventListener('click', function () { input.click(); });
    area.addEventListener('dragover', function (e) { e.preventDefault(); area.style.borderColor = '#00586f'; });
    area.addEventListener('dragleave', function () { area.style.borderColor = '#dee2e6'; });
    area.addEventListener('drop', function (e) {
      e.preventDefault();
      area.style.borderColor = '#dee2e6';
      if (e.dataTransfer.files.length > 0) handleUploadedFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () {
      if (input.files.length > 0) handleUploadedFile(input.files[0]);
      input.value = '';
    });
  }

  function handleUploadedFile(file) {
    if (!file.type.startsWith('image/')) return showModalAlert('Upload', 'Please upload an image file.');
    var reader = new FileReader();
    reader.onload = async function (e) {
      var originalData = e.target.result;
      var prepared = null;

      try {
        showSigStatus('Cleaning background and optimizing signature size...', '#00586f');
        prepared = await normalizeSignatureDataUrl(originalData, {
          removeBackground: true,
        });
      } catch (prepErr) {
        prepared = {
          dataUrl: originalData,
          meta: null,
        };
      }

      try {
        showSigStatus('Saving uploaded signature...', '#00586f');
        var saved = await saveSignatureData(prepared.dataUrl, buildUploadSignatureLabel(file.name));
        await loadUserSignatures(saved.id, true);
        if (prepared.meta && prepared.meta.removedBackground) {
          showSigStatus('Signature uploaded with cleaned background and corrected size. Click on the document to place it.', '#155724');
        } else {
          showSigStatus('Signature uploaded and size corrected. Click on the document to place it.', '#155724');
        }
      } catch (err) {
        selectedSavedSig = prepared.dataUrl;
        selectedSavedSigId = null;
        selectedSavedSigMeta = prepared.meta;
        clearPlacedSignature();
        updateSignActionsState();
        enterPlacingMode();
        showSigStatus('Signature loaded (not saved): ' + err.message, '#b06a00');
      }
    };
    reader.readAsDataURL(file);
  }

  function buildUploadSignatureLabel(fileName) {
    var base = String(fileName || 'Uploaded')
      .replace(/\.[^.]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) base = 'Uploaded';
    return ('Upload ' + base + ' ' + new Date().toLocaleDateString()).substring(0, 100);
  }

  async function saveSignatureData(signatureData, label) {
    var res = await fetch('/pdf-sign/save-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureData: signatureData, label: String(label || 'Signature').substring(0, 100) }),
    });
    var json = await res.json();
    if (!res.ok || json.result !== 1) {
      throw new Error(json.error || 'Could not save signature');
    }
    return json;
  }

  async function deleteSavedSignature(sig) {
    if (!sig || !sig.id) return;

    var shouldDelete = await showConfirmModal('Delete this saved signature?', {
      title: 'Delete signature?',
      okText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (!shouldDelete) return;

    try {
      var res = await fetch('/pdf-sign/delete-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sig.id }),
      });

      var json = {};
      try {
        json = await res.json();
      } catch (_) {
        json = {};
      }

      if (!res.ok || json.result !== 1) {
        throw new Error(json.error || 'Could not delete signature');
      }

      if (selectedSavedSigId && String(selectedSavedSigId) === String(sig.id)) {
        selectedSavedSigId = null;
        selectedSavedSig = null;
        selectedSavedSigMeta = null;
        clearPlacedSignature();
      }

      await loadUserSignatures();
      renderSavedSignatures();
      renderFloatingSignaturesList();
      showSigStatus('Signature deleted.', '#155724');
    } catch (e) {
      showSigStatus('Delete failed: ' + (e.message || 'Unknown error'), '#dc3545');
    }
  }

  function clearPlacedSignature() {
    if (placedSignature && placedSignature.element) {
      placedSignature.element.remove();
    }
    placedSignature = null;
    exitPlacingMode();
  }

  function markSelectedSavedSignature(sigId) {
    document.querySelectorAll('.saved-sig-item, .saved-sig-quick-item').forEach(function (el) {
      el.classList.remove('selected');
      if (sigId && String(el.getAttribute('data-sig-id')) === String(sigId)) {
        el.classList.add('selected');
      }
    });
  }

  function activateSavedSignature(sig, startPlacement) {
    if (!sig || !sig.signature_data) {
      return showSigStatus('This signature is not available. Try reloading.', '#dc3545');
    }

    if (!sig._normalizedData) {
      normalizeSignatureDataUrl(sig.signature_data, {
        removeBackground: false,
      }).then(function (optimized) {
        sig._normalizedData = optimized.dataUrl;
        sig._normalizedMeta = optimized.meta;

        // Keep selection in sync if this signature is still selected.
        if (selectedSavedSigId && String(selectedSavedSigId) === String(sig.id)) {
          selectedSavedSig = sig._normalizedData;
          selectedSavedSigMeta = sig._normalizedMeta;
        }
      }).catch(function () {
        sig._normalizedData = sig.signature_data;
        sig._normalizedMeta = null;
      });
    }

    selectedSavedSig = sig._normalizedData || sig.signature_data;
    selectedSavedSigId = sig.id;
    selectedSavedSigMeta = sig._normalizedMeta || null;
    clearAnnotationDraft();
    clearPlacedSignature();
    updateSignActionsState();
    markSelectedSavedSignature(sig.id);

    if (startPlacement && String(currentVersion || 'latest') === 'latest') {
      enterPlacingMode();
      showSigStatus('Signature activated. Click on the document to place it.', '#00586f');
    } else if (String(currentVersion || 'latest') !== 'latest') {
      showSigStatus('Signature selected. Switch to Latest to place and sign.', '#b06a00');
    } else {
      showSigStatus('Signature selected.', '#00586f');
    }
  }

  // ── Saved signatures ───────────────────────────────────
  async function loadUserSignatures(preferredSigId, autoActivate) {
    try {
      var res = await fetch('/pdf-sign/user-signatures');
      var json = await res.json();
      if (json.result === 1) {
        savedSignatures = json.signatures || [];

        var preferred = null;
        if (preferredSigId) {
          preferred = savedSignatures.find(function (s) {
            return String(s.id) === String(preferredSigId);
          }) || null;
        }
        if (!preferred && selectedSavedSigId) {
          preferred = savedSignatures.find(function (s) {
            return String(s.id) === String(selectedSavedSigId);
          }) || null;
        }
        if (!preferred) {
          preferred = savedSignatures.find(function (s) { return !!s.is_default; }) || savedSignatures[0] || null;
        }

        if (preferred && preferred.signature_data) {
          selectedSavedSig = preferred.signature_data;
          selectedSavedSigId = preferred.id;
          selectedSavedSigMeta = null;
        } else if (!selectedSavedSig && json.default_signature_data) {
          selectedSavedSig = json.default_signature_data;
          selectedSavedSigId = null;
          selectedSavedSigMeta = null;
        }

        if (signPanelBody && !signPanel.classList.contains('hidden')) {
          if (signPanelMode !== 'history') {
            renderSavedSignatures();
          }
        }
        renderFloatingSignaturesList();
        if (autoActivate && preferred) {
          activateSavedSignature(preferred, true);
        }
      }
    } catch (e) { /* silent */ }
  }

  function renderSavedSignatures() {
    var container = document.getElementById('savedSigList');
    if (!container) return;
    if (savedSignatures.length === 0) {
      container.innerHTML = '<span style="color:#999;font-size:.85rem;">No saved signatures</span>';
      return;
    }
    container.innerHTML = '';
    savedSignatures.forEach(function (sig) {
      var item = document.createElement('div');
      var isSelected = selectedSavedSigId
        ? String(selectedSavedSigId) === String(sig.id)
        : !!sig.is_default;
      item.className = 'saved-sig-item' + (isSelected ? ' selected' : '');
      item.setAttribute('data-sig-id', String(sig.id));
      item.innerHTML =
        '<img src="' + (sig.signature_data || '') + '" alt="sig" />' +
        '<span class="saved-sig-label">' + (sig.label || ('Signature #' + sig.id)) + '</span>' +
        '<span class="saved-sig-actions">' +
          '<button class="saved-sig-delete" title="Delete"><i class="fas fa-trash-alt"></i></button>' +
        '</span>';

      item.addEventListener('click', function () {
        activateSavedSignature(sig, true);
      });

      item.querySelector('.saved-sig-delete').addEventListener('click', async function (e) {
        e.stopPropagation();
        await deleteSavedSignature(sig);
      });
      container.appendChild(item);
    });
  }

  function renderExistingSignaturesList() {
    var container = document.getElementById('existingSigList');
    if (!container || !pdfInfo) return;
    var sigs = pdfInfo.signatures || [];
    if (sigs.length === 0) {
      container.innerHTML = '<span style="color:#999;font-size:.85rem;">No signatures yet</span>';
      return;
    }
    container.innerHTML = '';
    sigs.forEach(function (sig) {
      var item = document.createElement('div');
      item.className = 'existing-sig-item';
      item.innerHTML =
        '<i class="fas fa-check-circle sig-icon"></i>' +
        '<div class="sig-info">' +
          '<div class="sig-name">' + sig.signer_name + '</div>' +
          '<div class="sig-date">Page ' + sig.page_number + ' - ' + new Date(sig.signed_at).toLocaleString() + '</div>' +
        '</div>' +
        '<button class="pdf-btn" title="Certificate" data-sig-id="' + sig.id + '">' +
          '<i class="fas fa-certificate"></i>' +
        '</button>';
      item.querySelector('.pdf-btn').addEventListener('click', function () {
        PdfViewerSign._showCert(sig.id);
      });
      container.appendChild(item);
    });
  }

  async function requestSignConfirmation() {
    if (String(currentVersion || 'latest') !== 'latest') {
      return showSigStatus('To sign, switch to Latest version first.', '#dc3545');
    }
    if (activeTextEditors.length > 0) {
      return showSigStatus('Apply or close active text boxes before signing.', '#b06a00');
    }
    if (!placedSignature) {
      if (isMobile()) {
        return showSigStatus('Please activate a signature and tap on a page to place it first.', '#dc3545');
      }
      return showSigStatus('Please place the signature on the document by clicking on a page.', '#dc3545');
    }

    var stagedWritesCount = documentAnnotations.length;
    var confirmText = stagedWritesCount > 0
      ? 'Do you want to sign this document and apply ' + stagedWritesCount + ' staged text item(s) in the same version?'
      : 'Do you want to sign this document?';
    var shouldSign = await showConfirmModal(confirmText, {
      title: 'Confirm signature',
      okText: 'Sign',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (shouldSign) {
      confirmSign();
    }
  }

  function setPlacedSignatureSigningState(isLoading) {
    if (!placedSignature || !placedSignature.element) return;
    var signBtn = placedSignature.element.querySelector('.sig-confirm');
    if (!signBtn) return;
    signBtn.disabled = !!isLoading;
    signBtn.innerHTML = isLoading
      ? '<i class="fas fa-spinner fa-spin"></i> Signing...'
      : '<i class="fas fa-pen-nib"></i> Sign';
  }

  // ── Confirm & sign ──────────────────────────────────────
  async function confirmSign() {
    if (isSigning) return;
    if (String(currentVersion || 'latest') !== 'latest') {
      return showSigStatus('To sign, switch to Latest version first.', '#dc3545');
    }
    if (activeTextEditors.length > 0) {
      return showSigStatus('Apply or close active text boxes before signing.', '#b06a00');
    }
    if (!placedSignature) {
      if (isMobile()) {
        return showSigStatus('Please activate a signature and tap on a page to place it first.', '#dc3545');
      }
      return showSigStatus('Please place the signature on the document by clicking on a page.', '#dc3545');
    }

    isSigning = true;
    setPlacedSignatureSigningState(true);

    var pageWrapper = canvasArea.querySelector('[data-page="' + placedSignature.pageNum + '"]');
    var canvasEl = pageWrapper.querySelector('canvas');
    var canvasH = canvasEl.height;

    var pdfX = placedSignature.x / currentScale;
    var pdfY = ((canvasH - placedSignature.y - placedSignature.h) / currentScale);
    var pdfW = placedSignature.w / currentScale;
    var pdfH = placedSignature.h / currentScale;
    var writesPayload = getAnnotationsPayload();

    try {
      var res = await fetch('/pdf-sign/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          RowID: currentRowID,
          filename: currentFilename,
          signatureData: placedSignature.imgData,
          positionX: pdfX,
          positionY: pdfY,
          pageNumber: placedSignature.pageNum,
          sigWidth: pdfW,
          sigHeight: pdfH,
          writes: writesPayload,
        }),
      });
      var json = await res.json();
      if (json.result === 1) {
        var writesApplied = Number(json.writes_applied) || 0;
        showSigStatus(
          writesApplied > 0
            ? 'Document signed and text applied! Version ' + json.version + ' created (' + json.signed_filename + ').'
            : 'Document signed! Version ' + json.version + ' created (' + json.signed_filename + ').',
          '#155724'
        );
        clearPlacedSignature();
        documentAnnotations = [];
        activeTextEditors = [];
        setAnnotationsDirty(false);
        clearAnnotationDraft();
        renderStagedWritesList();
        renderDocumentAnnotations();
        currentVersion = 'latest';
        if (isMobile()) {
          await fitWidthScale();
        } else {
          await loadPdf();
        }
        await loadPdfInfo();
        updateSignActionsState();
        renderStagedWritesList();
        if (typeof window.ArchivosApproval === 'function') {
          window.ArchivosApproval(currentRowID, { highlightFilename: currentFilename });
        }
      } else if (json.error === 'file_locked') {
        showModal(json.message || 'The file is currently open by another user. Please try again later.', null, null, { title: 'File Locked', okText: 'OK', type: 'warning' });
        showSigStatus('', '#6b7280');
      } else {
        showSigStatus('Error: ' + (json.error || 'Unknown'), '#dc3545');
      }
    } catch (e) {
      showSigStatus('Error: ' + e.message, '#dc3545');
    } finally {
      isSigning = false;
      setPlacedSignatureSigningState(false);
    }
  }

  // ── PDF info (metadata + existing sigs) ─────────────────
  async function loadPdfInfo() {
    try {
      var res = await fetch('/pdf-sign/info?RowID=' + currentRowID +
        '&filename=' + encodeURIComponent(currentFilename) +
        '&version=' + encodeURIComponent(currentVersion || 'latest'));
      if (res.status === 409) {
        var errJson = await res.json();
        showModalAlert('File Locked', errJson.message || 'The file is currently open by another user. Please try again later.');
        close();
        return;
      }
      if (!res.ok) {
        close();
        return;
      }
      var json = await res.json();
      if (json.result === 1) {
        pdfInfo = json;
        documentAnnotations = [];
        activeTextEditors = [];
        setAnnotationsDirty(false);
        clearAnnotationDraft();
        selectedResolvedFilename = json.selectedFilename || currentFilename;
        document.getElementById('pdfFilename').textContent = selectedResolvedFilename;
        renderVersionSelector();
        updateSignActionsState();
        renderDocumentAnnotations();
        updateDevTeamButtons();
        if (!signPanel.classList.contains('hidden')) {
          if (signPanelMode === 'history') {
            renderExistingSignaturesList();
          } else {
            renderSavedSignatures();
          }
          updateAnnotationControlsState();
        }
        renderFloatingSignaturesList();
        renderStagedWritesList();
      } else {
        showModalAlert('Error', json.error || 'Could not load document information');
        close();
      }
    } catch (e) {
      showModalAlert('Error', 'Could not load the document. Please try again.');
      close();
    }
  }

  // ── Download ────────────────────────────────────────────
  function downloadPdf() {
    var url = getPdfStreamUrl(true);
    window.open(url, '_blank');
  }

  // ── Verify integrity ────────────────────────────────────
  async function verifyIntegrity() {
    try {
      var res = await fetch('/pdf-sign/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ RowID: currentRowID, filename: currentFilename, version: currentVersion }),
      });
      var json = await res.json();
      if (json.result === 1) {
        var badge = json.integrity_ok
          ? '<span class="integrity-badge ok"><i class="fas fa-check-circle"></i> Integrity OK</span>'
          : '<span class="integrity-badge fail"><i class="fas fa-exclamation-triangle"></i> Modified</span>';
        var details =
          '<div style="margin-top:10px;font-size:.82rem;">' +
            '<b>Hash:</b> ' + json.current_hash.substring(0, 24) + '...<br>' +
            '<b>Versions:</b> ' + json.total_versions + '<br>' +
            '<b>Signatures:</b> ' + json.total_signatures +
          '</div>';
        showModalAlert('Document Integrity Verification', badge + details);
      }
    } catch (e) {
      showModalAlert('Error', e.message);
    }
  }

  // ── Audit trail ─────────────────────────────────────────
  async function showAuditTrail() {
    try {
      var res = await fetch('/pdf-sign/audit?RowID=' + currentRowID + '&filename=' + encodeURIComponent(currentFilename));
      var json = await res.json();
      if (json.result === 1) {
        var html = '';
        if (json.logs.length === 0) {
          html = '<p style="color:#999;">No audit records yet.</p>';
        } else {
          json.logs.forEach(function (log) {
            html += '<div class="audit-trail-item">' +
              '<span class="audit-trail-action">' + formatAction(log.action) + '</span>' +
              '<span class="audit-trail-user"> by ' + log.user_name + '</span><br>' +
              '<span class="audit-trail-date">' + new Date(log.created_at).toLocaleString() + '</span>' +
            '</div>';
          });
        }
        showModalAlert('Audit Trail', html);
      }
    } catch (e) {
      showModalAlert('Error', e.message);
    }
  }

  function formatAction(action) {
    var map = {
      document_viewed: 'Viewed',
      document_downloaded: 'Downloaded',
      signature_placed: 'Signature Placed',
      signature_saved: 'Signature Saved',
      document_signed: 'Document Signed',
      signature_revoked: 'Signature Revoked',
      integrity_verified: 'Integrity Verified',
    };
    return map[action] || action;
  }

  // ── Certificate view ────────────────────────────────────
  window.PdfViewerSign._showCert = async function (sigId) {
    try {
      var res = await fetch('/pdf-sign/certificate?id=' + sigId);
      var json = await res.json();
      if (json.result === 1) {
        var c = json.certificate;
        var html =
          '<table style="width:100%;font-size:.85rem;border-collapse:collapse;">' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Signature ID</th><td style="padding:4px 8px;">' + c.signature_id + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Approval</th><td style="padding:4px 8px;">#' + c.approval_id + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">File</th><td style="padding:4px 8px;">' + c.filename + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Signer</th><td style="padding:4px 8px;">' + c.signer.name + ' (' + c.signer.user_id + ')</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Page</th><td style="padding:4px 8px;">' + c.position.page + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Signed At</th><td style="padding:4px 8px;">' + new Date(c.signed_at).toLocaleString() + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">IP</th><td style="padding:4px 8px;">' + c.security.ip_address + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Hash (before)</th><td style="padding:4px 8px;font-family:monospace;font-size:.75rem;word-break:break-all;">' + c.security.document_hash_before + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Hash (after)</th><td style="padding:4px 8px;font-family:monospace;font-size:.75rem;word-break:break-all;">' + c.security.document_hash_after + '</td></tr>' +
            '<tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Status</th><td style="padding:4px 8px;">' + c.status + '</td></tr>' +
          '</table>';
        showModalAlert('Signature Certificate', html);
      }
    } catch (e) {
      showModalAlert('Error', e.message);
    }
  };

  // ── Inline alert modal ──────────────────────────────────
  function showModalAlert(title, body) {
    var alertModal = document.getElementById('pdfAlertModal');
    if (!alertModal) {
      alertModal = document.createElement('div');
      alertModal.id = 'pdfAlertModal';
      alertModal.className = 'app-modal';
      alertModal.style.zIndex = '2200';
      alertModal.innerHTML =
        '<div class="app-modal-dialog" style="max-width:600px;">' +
          '<div class="app-modal-header">' +
            '<h6 class="app-modal-title" id="pdfAlertTitle"></h6>' +
            '<button class="app-modal-close" id="pdfAlertClose">&times;</button>' +
          '</div>' +
          '<div class="app-modal-body" id="pdfAlertBody"></div>' +
          '<div class="app-modal-footer">' +
            '<button class="btn btn-secondary" id="pdfAlertCloseBtn">Close</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(alertModal);
      document.getElementById('pdfAlertClose').addEventListener('click', function () {
        alertModal.classList.remove('open');
      });
      document.getElementById('pdfAlertCloseBtn').addEventListener('click', function () {
        alertModal.classList.remove('open');
      });
    }
    document.getElementById('pdfAlertTitle').textContent = title;
    document.getElementById('pdfAlertBody').innerHTML = body;
    alertModal.classList.add('open');
  }

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showSigStatus(msg, color) {
    var safeMsg = String(msg || '').trim();
    var tone = color || '#6b7280';
    var el = document.getElementById('sigStatusMsg');
    if (el) {
      el.innerHTML = safeMsg ? ('<span style="color:' + tone + ';">' + escapeHtml(safeMsg) + '</span>') : '';
    }

    if (topStatusBar) {
      if (!safeMsg) {
        topStatusBar.classList.remove('visible');
        topStatusBar.innerHTML = '';
      } else {
        topStatusBar.classList.add('visible');
        topStatusBar.style.borderColor = tone;
        topStatusBar.style.color = tone;
        topStatusBar.innerHTML = '<i class="fas fa-info-circle"></i><span>' + escapeHtml(safeMsg) + '</span>';
      }

      if (floatingSignaturesOpen) {
        positionFloatingSignatures();
      }
    }
  }
})();
