
// 
// Declaraciones

// 
const fac_modules = ['Claims Reserve', 'Claim Payment', 'Cover Note', 'Offers']
const treat_modules = ['Claims', 'Remittances', 'Treaty']
// Array for dynamic department fields
// CRM Main: Filter Persistence
const CRM_MAIN_FILTERS_KEY = 'crm_main_filters';

// Message type filter state ('user' | 'system' | 'all')
window._crmActiveMsgType = 'user';

// Combined text + type filter for the messages table
function filterCrmMessages() {
    const textFilter = (document.getElementById('SearchBox')?.value || '').toUpperCase();
    const typeFilter = window._crmActiveMsgType || 'all';
    const table = document.getElementById('MainTable');
    if (!table) return;
    const rows = table.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].id === 'header') continue;
        const msgType = rows[i].dataset?.msgType || 'user';
        const passesType = typeFilter === 'all' || msgType === typeFilter;
        let passesText = true;
        if (textFilter) {
            passesText = false;
            const tds = rows[i].getElementsByTagName('td');
            for (let j = 0; j < tds.length; j++) {
                if ((tds[j].textContent || '').toUpperCase().includes(textFilter)) {
                    passesText = true;
                    break;
                }
            }
        }
        rows[i].style.display = (passesType && passesText) ? '' : 'none';
    }
}

function setCrmMsgTypeFilter(type) {
    window._crmActiveMsgType = type;
    // Update button active state
    ['user', 'system', 'all'].forEach(t => {
        const btn = document.getElementById('msgFilter_' + t);
        if (btn) btn.classList.toggle('active', t === type);
    });
    filterCrmMessages();
}

function refreshFavoritesPanel() {
    try {
        const favContainer = document.getElementById('favoritos-crm-files');
        if (!favContainer) return;
        favContainer.innerHTML = '';
        for (let i = 0; i < crm_msg.length; i++) {
            if (!crm_msg[i].favorites_files) continue;
            const favArr = crm_msg[i].favorites_files.split(';');
            for (let f = 0; f < favArr.length; f++) {
                const filename = favArr[f].trim();
                if (!filename) continue;
                const capturedMsg = crm_msg[i];
                const div = document.createElement('div');
                div.className = 'crm_celda';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                const unfavBtn = document.createElement('button');
                unfavBtn.className = 'btn-favorite';
                unfavBtn.innerHTML = '★';
                unfavBtn.title = 'Remove from favorites';
                unfavBtn.style.color = '#ffc107';
                unfavBtn.style.border = 'none';
                unfavBtn.style.marginRight = '.5rem';
                unfavBtn.onclick = function (e) {
                    e.stopPropagation();
                    fetch('/crm_archivo_favorite', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id_main: capturedMsg.id_main, id_msg: capturedMsg.id_msg, xname: filename, favorites: 0 })
                    }).then(r => r.json()).then(data => {
                        if (!data || data.result === 0) return;
                        capturedMsg.favorites_files = (capturedMsg.favorites_files || '').split(';').filter(f => f && f !== filename).join(';');
                        const starBtn = document.querySelector(`[data-fav-main="${capturedMsg.id_main}"][data-fav-msg="${capturedMsg.id_msg}"][data-fav-file="${filename}"]`);
                        if (starBtn) {
                            starBtn.dataset.isFav = '0';
                            starBtn.style.color = '';
                            starBtn.title = 'Mark as a favorite file';
                        }
                        refreshFavoritesPanel();
                    });
                };
                const iconSrc = getCrmFileIcon(filename);
                const fileImg = document.createElement('img');
                fileImg.src = iconSrc;
                fileImg.style.cssText = 'width:25px;height:25px;margin-right:8px;vertical-align:middle;';
                const fileSpan = document.createElement('span');
                fileSpan.style.cssText = 'cursor:pointer;text-decoration:underline;';
                fileSpan.textContent = filename;
                div.appendChild(unfavBtn);
                div.appendChild(fileImg);
                div.appendChild(fileSpan);
                div.onclick = function (e) {
                    if (e.target === unfavBtn) return;
                    crm_files(capturedMsg.id_main, capturedMsg.id_msg, filename);
                };
                favContainer.appendChild(div);
            }
        }
        const favCard = document.getElementById('card-favoritos-crm');
        if (favCard) favCard.style.display = favContainer.children.length > 0 ? '' : 'none';
    } catch (e) { console.log(e); }
}

// Functions

function toggleMessageBody(uniqueId) {
    const contentEl = document.getElementById(uniqueId + '-content')
    const toggleEl = document.getElementById(uniqueId + '-toggle')
    
    if (contentEl) {
        const isExpanded = contentEl.classList.contains('crm-message-body--expanded')
        if (isExpanded) {
            contentEl.classList.remove('crm-message-body--expanded')
            if (toggleEl) toggleEl.textContent = 'Show more'
        } else {
            contentEl.classList.add('crm-message-body--expanded')
            if (toggleEl) toggleEl.textContent = 'Show less'
        }
    }
}

function escapeCrmHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function crmLooksLikeMarkdown(value) {
    var text = String(value || '');
    if (!text.trim()) return false;
    return /\|.+\|/.test(text) ||
        /(^|\n)#{1,6}\s+/.test(text) ||
        /(^|\n)(-|\*|\+)\s+/.test(text) ||
        /(^|\n)\d+\.\s+/.test(text) ||
        /```/.test(text);
}

function renderCrmMessageBody(body) {
    var raw = String(body || '');
    // Keep legacy HTML bodies untouched (historical CRM/email messages)
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    if (typeof window.crmRenderAiMarkdown === 'function' && crmLooksLikeMarkdown(raw)) {
        return window.crmRenderAiMarkdown(raw);
    }
    return escapeCrmHtml(raw).replace(/\r?\n/g, '<br>');
}

function getCrmServerHost() {
    var fromWindow = (window.CRM_SERVER_1 || '').trim();
    if (fromWindow) return fromWindow.replace(/^[/\\]+|[/\\]+$/g, '');
    var input = document.getElementById('crmServer1');
    var fromInput = input && input.value ? String(input.value).trim() : '';
    return fromInput.replace(/^[/\\]+|[/\\]+$/g, '');
}

function getCrmFileExtension(filename) {
    var value = String(filename || '').toLowerCase();
    var dot = value.lastIndexOf('.');
    return dot >= 0 ? value.slice(dot) : '';
}

function getCrmFileIcon(filename) {
    var ext = getCrmFileExtension(filename);
    if (ext === '.pdf') return '/icons/pdf.png';
    if (ext === '.xls' || ext === '.xlsx' || ext === '.xlsm') return '/icons/excel.png';
    if (ext === '.doc' || ext === '.docx') return '/icons/word.png';
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return '/icons/png.png';
    if (ext === '.msg') return '/img/envelope-regular.svg';
    return '/icons/default.png';
}

function buildCrmUncPath(crm_id, msg_id, filename) {
    var host = getCrmServerHost();
    if (!host) return '';
    return '\\\\' + host + '\\CRM\\' + crm_id + '\\' + msg_id + '\\' + filename;
}

function getCrmFileEndpoints(crm_id, msg_id, filename) {
    var params = 'crm_id=' + encodeURIComponent(crm_id) +
        '&msg_id=' + encodeURIComponent(msg_id) +
        '&filename=' + encodeURIComponent(filename || '');
    return {
        fileUrl: '/crm-file?' + params,
        downloadUrl: '/crm-file?' + params + '&dl=1',
        openCmdUrl: '/crm-open-cmd?' + params,
        openLocalUrl: '/crm-open-local?' + params,
        uncPath: buildCrmUncPath(crm_id, msg_id, filename)
    };
}

function getCrmPdfParams(crm_id, msg_id, filename) {
    return 'crm_id=' + encodeURIComponent(crm_id) +
        '&msg_id=' + encodeURIComponent(msg_id) +
        '&filename=' + encodeURIComponent(filename || '');
}

/* Los endpoints /crm-pdf/* devuelven JSON tanto en exito como en error;
   se normaliza el error para que el visor pueda distinguir 409 (archivo bloqueado). */
async function crmPdfRequest(url, options) {
    const res = await fetch(url, options);
    let json = null;
    try { json = await res.json(); } catch (_) { /* respuesta sin cuerpo JSON */ }
    if (!res.ok) {
        const error = new Error((json && (json.message || json.error)) || ('Request failed (' + res.status + ')'));
        error.status = res.status;
        throw error;
    }
    return json;
}

/* ── Carga bajo demanda del visor ─────────────────────────────
   El visor solo se necesita al abrir un PDF, asi que sus assets se
   inyectan en el primer click en vez de depender de que la vista los
   incluya. Evita que un cambio de titulo en la plantilla deje de cargar
   el visor y que el navegador caiga al fallback de "abrir en pestana". */
const CRM_PDF_ASSETS = {
    css: '/css/pdf-viewer.css',
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: '/js/pdf.worker.min.js',
    viewer: '/js/pdf-viewer-doc.js',
};

const crmPdfAssetLoads = {};

function loadCrmScriptOnce(src) {
    if (crmPdfAssetLoads[src]) return crmPdfAssetLoads[src];
    crmPdfAssetLoads[src] = new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = function () { resolve(); };
        script.onerror = function () {
            // Se descarta el intento fallido para poder reintentar en el proximo click.
            delete crmPdfAssetLoads[src];
            reject(new Error('Could not load ' + src));
        };
        document.head.appendChild(script);
    });
    return crmPdfAssetLoads[src];
}

function ensureCrmStylesheet(href) {
    const already = Array.prototype.some.call(
        document.querySelectorAll('link[rel="stylesheet"]'),
        function (link) { return (link.getAttribute('href') || '').indexOf(href) === 0; }
    );
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

async function ensureCrmPdfViewerLoaded() {
    ensureCrmStylesheet(CRM_PDF_ASSETS.css);

    if (!window.pdfjsLib) {
        await loadCrmScriptOnce(CRM_PDF_ASSETS.pdfjs);
    }
    // La vista tambien puede haber cargado pdf.js sin configurar el worker.
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = CRM_PDF_ASSETS.pdfWorker;
    }
    if (!window.PdfDocViewer) {
        await loadCrmScriptOnce(CRM_PDF_ASSETS.viewer);
    }

    return !!(window.pdfjsLib && window.PdfDocViewer);
}

/* Visor de PDF de CRM: ver, versionar y escribir comentarios (sin firma). */
function openCrmPdfViewer(crm_id, msg_id, filename) {
    const params = getCrmPdfParams(crm_id, msg_id, filename);

    function openInNewTab(reason) {
        console.error('CRM PDF viewer unavailable, opening in browser instead:', reason);
        window.open(getCrmFileEndpoints(crm_id, msg_id, filename).fileUrl, '_blank', 'noopener');
    }

    ensureCrmPdfViewerLoaded()
        .then(function (ready) {
            if (!ready) return openInNewTab('assets loaded but viewer did not register');
            openCrmPdfViewerWith(params, crm_id, msg_id, filename);
        })
        .catch(openInNewTab);

    return false;
}

function openCrmPdfViewerWith(params, crm_id, msg_id, filename) {
    window.PdfDocViewer.open({
        filename: filename,
        canWrite: true,
        fileUrl: function (version, forceDownload) {
            return '/crm-pdf/file?' + params +
                '&version=' + encodeURIComponent(version || 'latest') +
                (forceDownload ? '&dl=1' : '');
        },
        fetchInfo: function (version) {
            return crmPdfRequest('/crm-pdf/info?' + params +
                '&version=' + encodeURIComponent(version || 'latest'));
        },
        applyWrites: function (version, writes) {
            return crmPdfRequest('/crm-pdf/text/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    crm_id: crm_id,
                    msg_id: msg_id,
                    filename: filename,
                    version: version || 'latest',
                    writes: writes
                })
            });
        }
    });
}

function createCrmActionLink(href, title, iconHtml, target, downloadName) {
    var link = document.createElement('a');
    link.href = href;
    link.title = title;
    link.className = 'file_action_btn';
    if (target) link.target = target;
    if (downloadName) link.download = downloadName;
    link.innerHTML = iconHtml;
    link.onclick = function (e) { e.stopPropagation(); };
    return link;
}

function createCrmActionButton(title, iconHtml, onClick) {
    var btn = document.createElement('a');
    btn.href = '#';
    btn.title = title;
    btn.className = 'file_action_btn';
    btn.innerHTML = iconHtml;
    btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        onClick();
        return false;
    };
    return btn;
}

function getOrCreateCrmLocalLaunchFrame() {
    var frame = document.getElementById('crm-local-launch-frame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'crm-local-launch-frame';
        frame.name = 'crm-local-launch-frame';
        frame.style.display = 'none';
        document.body.appendChild(frame);
    }
    return frame;
}

function getOrCreateCrmLocalLaunchAnchor() {
    var anchor = document.getElementById('crm-local-launch-anchor');
    if (!anchor) {
        anchor = document.createElement('a');
        anchor.id = 'crm-local-launch-anchor';
        anchor.style.display = 'none';
        anchor.target = 'crm-local-launch-frame';
        document.body.appendChild(anchor);
    }
    return anchor;
}

function launchCrmOpenSilently(openLocalUrl) {
    if (!openLocalUrl) return false;
    var frame = getOrCreateCrmLocalLaunchFrame();
    var anchor = getOrCreateCrmLocalLaunchAnchor();
    anchor.target = frame.name;
    var sep = openLocalUrl.indexOf('?') >= 0 ? '&' : '?';
    var launchUrl = openLocalUrl + sep + 'silent=1&_ts=' + Date.now();
    anchor.href = launchUrl;

    try { frame.src = 'about:blank'; } catch (_) {}
    try { frame.src = launchUrl; } catch (_) {}
    try { anchor.click(); } catch (_) {}

    setTimeout(function () {
        try {
            var retrySep = launchUrl.indexOf('?') >= 0 ? '&' : '?';
            frame.src = launchUrl + retrySep + '_retry=1';
        } catch (_) {}
    }, 320);

    return true;
}

function triggerCrmFileDownload(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 200);
}


function openCrmFileFromBackend(crm_id, msg_id, filename, openLabel) {
    var ext = getCrmFileExtension(filename);
    if (ext === '.msg') {
        return openCrmMsgViewer(crm_id, msg_id, filename);
    }
    var endpoints = getCrmFileEndpoints(crm_id, msg_id, filename);
    triggerCrmFileDownload(endpoints.downloadUrl, filename);
    return false;
}

function ensureCrmMsgViewerOverlay() {
    var existing = document.getElementById('crm_msg_viewer_overlay');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.id = 'crm_msg_viewer_overlay';
    overlay.className = 'msg-viewer-overlay';

    var modal = document.createElement('div');
    modal.className = 'msg-viewer-modal';

    var header = document.createElement('div');
    header.className = 'msg-viewer-header';
    header.innerHTML = '<div class="msg-viewer-title">' +
        '<i class="fas fa-envelope-open"></i><span id="crm_msg_viewer_title">Email Message</span></div>';
    var closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'msg-viewer-close';
    closeBtn.onclick = function () { overlay.style.display = 'none'; };
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.id = 'crm_msg_viewer_body';
    body.className = 'msg-viewer-body';
    body.innerHTML = '<div class="msg-viewer-loading"><i class="fas fa-spinner fa-spin" style="font-size:32px;"></i><p style="margin-top:12px;">Loading message...</p></div>';

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.style.display = 'none';
    });
    document.body.appendChild(overlay);
    return overlay;
}

function formatCrmRecipientList(list) {
    if (!list || !list.length) return '<span class="msg-viewer-recipients-empty">—</span>';
    return list.map(function (r) {
        var name = escapeCrmHtml(r.name || '');
        var email = escapeCrmHtml(r.email || '');
        if (name && email) return '<span class="msg-viewer-recipient-chip">' + name + ' &lt;' + email + '&gt;</span>';
        return '<span class="msg-viewer-recipient-chip">' + (name || email) + '</span>';
    }).join('');
}

function formatCrmMsgDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString(); } catch (_) { return String(d); }
}

function renderCrmMsgViewerBody(data, crm_id, msg_id, filename) {
    var rows = '';
    rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">Subject</div><div class="msg-viewer-subject">' + escapeCrmHtml(data.subject || '') + '</div></div>';
    rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">From</div><div>' + formatCrmRecipientList([data.from]) + '</div></div>';
    rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">To</div><div>' + formatCrmRecipientList(data.to) + '</div></div>';
    if (data.cc && data.cc.length) {
        rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">Cc</div><div>' + formatCrmRecipientList(data.cc) + '</div></div>';
    }
    if (data.date) {
        rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">Date</div><div class="msg-viewer-date">' + escapeCrmHtml(formatCrmMsgDate(data.date)) + '</div></div>';
    }

    if (data.attachments && data.attachments.length) {
        var attHtml = data.attachments.map(function (a) {
            var icon = getCrmFileIcon(a.filename);
            var url = '/crm-msg-attachment?crm_id=' + encodeURIComponent(crm_id) +
                '&msg_id=' + encodeURIComponent(msg_id) +
                '&filename=' + encodeURIComponent(filename) +
                '&att_index=' + encodeURIComponent(a.index);
            return '<a href="' + url + '" download="' + escapeCrmHtml(a.filename) + '" class="msg-viewer-attachment-link">' +
                '<img src="' + icon + '" style="width:18px;height:18px;">' + escapeCrmHtml(a.filename) + '</a>';
        }).join('');
        rows += '<div class="msg-viewer-attachments"><div class="msg-viewer-section-label"><i class="fas fa-paperclip"></i> Attachments (' + data.attachments.length + ')</div>' + attHtml + '</div>';
    }

    rows += '<hr class="msg-viewer-divider">';

    var bodyContent;
    if (data.bodyHtml && data.bodyHtml.trim()) {
        bodyContent = '<iframe id="crm_msg_body_iframe" class="msg-viewer-iframe" sandbox="allow-same-origin"></iframe>';
    } else {
        var text = escapeCrmHtml(data.bodyText || '').replace(/\r?\n/g, '<br>');
        bodyContent = '<div class="msg-viewer-plain">' + text + '</div>';
    }
    rows += '<div>' + bodyContent + '</div>';

    return rows;
}

function openCrmMsgViewer(crm_id, msg_id, filename) {
    var overlay = ensureCrmMsgViewerOverlay();
    overlay.style.display = 'flex';
    var body = document.getElementById('crm_msg_viewer_body');
    var title = document.getElementById('crm_msg_viewer_title');
    if (title) title.textContent = filename || 'Email Message';
    body.innerHTML = '<div class="msg-viewer-loading"><i class="fas fa-spinner fa-spin" style="font-size:32px;"></i><p style="margin-top:12px;">Loading message...</p></div>';

    var params = 'crm_id=' + encodeURIComponent(crm_id) +
        '&msg_id=' + encodeURIComponent(msg_id) +
        '&filename=' + encodeURIComponent(filename);

    fetch('/crm-msg-content?' + params)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.result !== 1) {
                body.innerHTML = '<div class="msg-viewer-error"><i class="fas fa-exclamation-triangle" style="font-size:28px;"></i><p style="margin-top:10px;">' + escapeCrmHtml(data.error || 'Could not load message') + '</p></div>';
                return;
            }
            body.innerHTML = renderCrmMsgViewerBody(data, crm_id, msg_id, filename);
            if (data.bodyHtml && data.bodyHtml.trim()) {
                var iframe = document.getElementById('crm_msg_body_iframe');
                if (iframe) {
                    var doc = iframe.contentDocument || iframe.contentWindow.document;
                    var isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                    var iframeStyle = isDarkTheme
                        ? 'body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#d8dee9;background:#11161c;margin:12px;}a{color:#8cc5d3;}img{max-width:100%;height:auto;}'
                        : 'body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;background:#fff;margin:12px;}img{max-width:100%;height:auto;}';
                    doc.open();
                    doc.write('<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>' + iframeStyle + '</style></head><body>' + data.bodyHtml + '</body></html>');
                    doc.close();
                    setTimeout(function () {
                        try {
                            var h = doc.body.scrollHeight;
                            if (h > 380) iframe.style.minHeight = Math.min(h + 20, 600) + 'px';
                        } catch (_) {}
                    }, 80);
                }
            }
        })
        .catch(function (err) {
            console.error('CRM msg content error:', err);
            body.innerHTML = '<div class="msg-viewer-error"><i class="fas fa-exclamation-triangle" style="font-size:28px;"></i><p style="margin-top:10px;">Error loading message</p></div>';
        });

    return false;
}

function buildCrmFileActions(crm_id, msg_id, filename) {
    var endpoints = getCrmFileEndpoints(crm_id, msg_id, filename);
    var ext = getCrmFileExtension(filename);

    var actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '8px';
    actions.style.marginLeft = 'auto';

    if (ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
         if (ext === '.pdf'){
             actions.appendChild(createCrmActionButton(
                 'Open viewer (write comments)',
                 '<i class="fas fa-edit secondIcon"></i>',
                 function () { openCrmPdfViewer(crm_id, msg_id, filename); }
                ));
        }
        actions.appendChild(createCrmActionLink(
            endpoints.fileUrl,
            'Open in browser',
            '<i class="fas fa-globe secondIcon"></i>',
            '_blank'
        ));
        actions.appendChild(createCrmActionLink(
            endpoints.downloadUrl,
            'Download',
            '<i class="fas fa-download secondIcon"></i>'
        ));
        return actions;
    }

    if (ext === '.msg') {
        actions.appendChild(createCrmActionButton(
            'Open in Outlook',
            '<i class="fas fa-envelope-open secondIcon"></i>',
            function () { openCrmFileFromBackend(crm_id, msg_id, filename, 'MSG'); }
        ));
        actions.appendChild(createCrmActionLink(
            endpoints.downloadUrl,
            'Download',
            '<i class="fas fa-download secondIcon"></i>'
        ));
        return actions;
    }

    actions.appendChild(createCrmActionLink(
        endpoints.downloadUrl,
        'Download',
        '<i class="fas fa-download secondIcon"></i>'
    ));
    return actions;
}

function CRM_url(id, error_id = -1, mensaje = '') {
    // Obtener userid del contexto actual
    const userid = (document.getElementById('UserID') && document.getElementById('UserID').value)
        || (document.getElementById('UsuarioID') && document.getElementById('UsuarioID').value)
        || new URL(window.location.href).searchParams.get('p')
        || '';
    
    // Validar acceso antes de navegar
    if (typeof validateAndNavigateToCrm === 'function') {
        validateAndNavigateToCrm(id, userid);
    } else {
        // Fallback if the feature is unavailable
        var url_string = window.location.href;
        url_string = url_string.replace('RowID', 'OldID')
        url_string = url_string.replace('crm_id', 'OldID')
        var url = new URL(url_string);
        window.location.href = "/crm_msg?" + url.searchParams + "&crm_id=" + id;
    }
};

function sir_data_validation(modulo, input) {
    run = false
    tooltip = document.getElementById("tooltip_" + input)
    modulo = document.getElementById(modulo)
    input = document.getElementById(input)
    switch (modulo.value) {
        case "fac_Cover Note":
            var re = new RegExp(/^\d{6}-\d{1,2}$/);
            run = re.test(input.value)
            break;
        case "fac_Offers":
            var re = new RegExp(/^\d{6}$/);
            run = re.test(input.value)
            break;
        case "fac_Claims Reserve":
            var re = new RegExp(/^\d{1,5}-\d{1,2}$/);
            run = re.test(input.value)
            break;
        case "fac_Claim Payment":
            var re = new RegExp(/^\d{1,5}-\d{1,2}$/);
            run = re.test(input.value)
            break;
        case "treaty_Claims":
            var re = new RegExp(/^\d{1,5}-\d{1,2}$/);
            run = re.test(input.value)
            break;
        case "treaty_Remittances":
            var re = new RegExp(/^\d{1,6}$/);
            run = re.test(input.value)
            break;
        case "treaty_Treaty":
            var re = new RegExp(/^\d{4}.\d{1,4}.\d{1,4}.\d{1,4}.\d{1,6}$/);
            run = re.test(input.value)
            break;
    }
    if (input.value != '') {
        if (!run) {
            input.classList.add("input-error")
            // En caso de que no se pongan tooltips
            try {
                tooltip.setAttribute("tooltip-message", "Invalid syntax")
            } catch (error) { }
        }
        else {
            input.classList.remove("input-error")
            // En caso de que no se pongan tooltips
            try {
                tooltip.removeAttribute("tooltip-message")
            } catch (error) { }
        }
    }
    return run
};
function load_main(filtro = 1, valor = 1, sort = null) {
    departamentos = document.getElementById("departamentos").value
    const statusFilter = document.getElementById("SelectBoxStatus")?.value || '';
    asigned = Number(document.getElementById("crm_filtro_asgined").value)
    userid = document.getElementById("UsuarioID").value
    const limit = document.getElementById("SelectBoxPages")?.value || 15;
    const searchQuery = document.getElementById("SearchBox")?.value?.trim() || '';
    const priority = document.getElementById("SelectBoxPriority")?.value || '';
    const assignedUsers = document.getElementById("filter_asignados_value")?.value?.trim() || '';
    const globalStatus = document.getElementById("SelectBoxGlobalStatus")?.value || '';

    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key') || '';

    if (key === 'Pending' && statusFilter !== (window._crmStatusAtLoad || '')) {
        asigned = 0;
        document.getElementById("crm_filtro_asgined").value = "0";
        var url = new URL(window.location.href);
        url.searchParams.delete('key');
        window.history.replaceState({}, '', url.toString());
    }

    $.ajax({
        url: '/crm_get_main',
        data: JSON.stringify({
            departamentos,
            status: statusFilter,
            asigned,
            userid,
            page: currentPage,
            limit: limit,
            search: searchQuery,
            priority: priority,
            key: key,
            assigned_users: assignedUsers,
            global_status: globalStatus
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                crm_main = response.crm
                totalCount = response.totalCount || 0
                table_main = document.getElementById("MainTable")
                tbody = table_main.getElementsByTagName('tbody')[0]
                if (!tbody) {
                    tbody = document.createElement("tbody")
                    table_main.appendChild(tbody)
                }
                tbody.innerHTML = ''

                // Update pagination display
                renderPagination(totalCount);

                if (crm_main.length === 0) {
                    const tr = document.createElement('tr');
                    const td = document.createElement('td');
                    td.setAttribute('colspan', '10');
                    td.style.textAlign = 'center';
                    td.innerHTML = 'No data found';
                    tr.appendChild(td);
                    tbody.appendChild(tr);
                }

                for (let index = 0; index < crm_main.length; index++) {
                    show_row = false
                    if (sort == 1) {
                        crm_main.sort((a, b) => a.cprioridad - b.cprioridad);
                    }
                    if (sort == 2) {
                        crm_main.sort((a, b) => b.cprioridad - a.cprioridad);
                    }
                    tr = document.createElement("tr")
                    tr.setAttribute("onclick", "CRM_url(" + crm_main[index].id + ")")
                    tr.style.cursor = "pointer";

                    // ID
                    td = document.createElement("td")
                    td.innerHTML = crm_main[index].id
                    td.style.textAlign = "center"
                    td.className = "text-decoration-underline"
                    tr.appendChild(td)

                    // Prioridad
                    td = document.createElement("td")
                    td.style.textAlign = "center"
                    svg = document.createElement("img")
                    svg.src = "img/prioridad_" + crm_main[index].xprioridad + ".svg"
                    svg.id = "prioridad_" + crm_main[index].xprioridad
                    svg.title = crm_main[index].xprioridad
                    svg.style.width = "12px"
                    svg.style.height = "12px"
                    td.appendChild(svg)
                    p = document.createElement("p")
                    p.innerHTML = crm_main[index].xprioridad
                    p.className = "Not"
                    td.appendChild(p)
                    tr.appendChild(td)
                    // Asunto interno
                    td = document.createElement("td")
                    if (crm_main[index].asunto_interno == null)
                        td.innerHTML = '---'
                    else
                        td.innerHTML = crm_main[index].asunto_interno
                    tr.appendChild(td)

                    // Asunto
                    td = document.createElement("td")
                    td.innerHTML = crm_main[index].conversacion_titulo ? crm_main[index].conversacion_titulo.slice(0, 125) : ''
                    tr.appendChild(td)

                    //Fecha Fin
                    td = document.createElement("td")
                    td.style.textAlign = "center"
                    date = new Date()
                    date_fin = new Date(crm_main[index].fecha_fin)
                    td.innerHTML = crm_main[index].fecha_fin
                    if (date > date_fin && crm_main[index].xestado != 'Closed') {
                        td.className = "text-danger fw-bold"
                    }
                    tr.appendChild(td)

                    //Fecha actualizacion
                    td = document.createElement("td")
                    td.style.textAlign = "center"
                    date_modi = crm_main[index].fecha_modificado == null ? crm_main[index].fecha_ingreso : crm_main[index].fecha_modificado
                    td.innerHTML = date_modi
                    tr.appendChild(td)
                    //Select asignar
                    td = document.createElement("td")
                    div = document.createElement("div")
                    div.id = crm_main[index].id + "_asignado"
                    div.style.display = "flex"
                    div.style.alignItems = "center"
                    div.style.flexWrap = "wrap"
                    p = document.createElement("p")
                    if (crm_main[index].user_asig != null) {
                        p.className = "Not"
                        p.innerHTML = crm_main[index].user_asig
                        div_img = document.createElement("div")
                        div_img.style.display = "flex"
                        div_img.style.alignItems = "center"
                        asignados = crm_main[index].user_asig.split(';')
                        for (e = 0; e < asignados.length; e++) {
                            img = document.createElement("img")
                            img.src = "pic/" + asignados[e] + ".png"
                            img.className = "profile_pic"
                            img.title = asignados[e]
                            img.onerror = function () { this.src = 'pic/default.png'; }
                            div_img.appendChild(img)
                        }
                        div.appendChild(div_img)
                    }
                    else {
                        p.innerHTML = '---'
                        p.style.margin = "0"
                    }
                    div.appendChild(p)
                    td.appendChild(div)
                    tr.appendChild(td)
                    //Status
                    td = document.createElement("td")
                    td.style.textAlign = "center"
                    const statusSpan = document.createElement("span")
                    statusSpan.style.borderRadius = "10px"
                    statusSpan.style.padding = "4px 8px"
                    statusSpan.style.color = "white"
                    statusSpan.style.fontSize = "10px"
                    statusSpan.style.display = "inline-block"
                    statusSpan.innerHTML = crm_main[index].xestado

                    if (crm_main[index].xestado === 'Closed'|| crm_main[index].xestado ==='Duplicate' ) {
                        statusSpan.style.backgroundColor = "#00586f"
                    } else if (crm_main[index].xestado === 'Not started') {
                        statusSpan.style.backgroundColor = "#35addcff"
                    } else {
                        statusSpan.style.backgroundColor = "#ffc107"
                    }
                    td.appendChild(statusSpan)
                    tr.appendChild(td)


                    //owner
                    td = document.createElement("td")
                    div = document.createElement("div")

                    if (!crm_main[index].de_nombre) {
                        td.innerHTML = '---'
                    } else {
                        crm_main[index].de_nombre.split('; ').forEach(function(name) {
                        name = name.trim();

                        let displayName =
                        typeof name === "string" && name.includes("@")
                            ? name.split("@")[0]
                            : name.includes(" ")
                            ? (() => {
                                const parts = name.split(/\s+/);
                                return parts[0][0].toLowerCase() + parts[1].toLowerCase();
                                })()
                            : name;
                            let div_img = document.createElement("div")
                                    div_img.style.display = "flex"
                                    div_img.style.alignItems = "center"
                                        let img = document.createElement("img")
                                        img.src = "pic/" + displayName + ".png"
                                        img.className = "profile_pic"
                                        img.title = name
                                        img.onerror = function () { this.src = 'pic/default.png'; }
                                        div_img.appendChild(img)
                                    div.appendChild(div_img)
                        })
                        td.appendChild(div)
                    }
                    tr.appendChild(td)

                    //Info (Created Date & Last Update)
                    td = document.createElement("td")
                    td.style.textAlign = "center"
                    td.className = "info-tooltip"
                    const infoIcon = document.createElement("i")
                    infoIcon.className = "fas fa-info-circle"
                    infoIcon.style.color = "#00586f"
                    infoIcon.style.fontSize = "16px"
                    infoIcon.style.cursor = "pointer"
                    const tooltipContent = document.createElement("div")
                    tooltipContent.className = "tooltip-content"
                    const createdLabel = document.createElement("div")
                    createdLabel.innerHTML = '<span class="tooltip-label">Created:</span> ' + crm_main[index].fecha_ingreso
                    createdLabel.style.marginBottom = "5px"
                    const updatedLabel = document.createElement("div")
                    const lastUpdate = crm_main[index].fecha_modificado || 'N/A'
                    updatedLabel.innerHTML = '<span class="tooltip-label">Last Update:</span> ' + lastUpdate
                    updatedLabel.style.marginBottom = "5px"
                    const ownerLabel = document.createElement("div")
                    ownerLabel.innerHTML = '<span class="tooltip-label">Owner:</span> ' + crm_main[index].de_nombre
                    ownerLabel.style.marginBottom = "5px"
                    tooltipContent.appendChild(createdLabel)
                    tooltipContent.appendChild(updatedLabel)
                    tooltipContent.appendChild(ownerLabel)

                    td.appendChild(infoIcon)
                    td.appendChild(tooltipContent)
                    tr.appendChild(td)

                    tbody.appendChild(tr)
                }
                table_main.appendChild(tbody)
            } else {
                launch_toast("Error loading CRM", 2)
            }
        }
    })

}
function crm_get_user(cdepartamento, cestado, crm_id) {
    $.ajax({
        url: '/crm_get_asigned',
        data: JSON.stringify({
            cdepartamento,
            crm_id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                asignados = response.asignados
                if (asignados.length > 0) {
                    var deptName = asignados[0].nombre
                    var deptId = asignados[0].id

                    // Mark these users as already-assigned so they're hidden from the add-user dropdown
                    var _fuDisp = document.querySelector('.floating-users-display[data-name="crm_asignados_fu"]')
                    if (_fuDisp) {
                        var _excl = (_fuDisp.getAttribute('data-excluded') || '').split(',').filter(Boolean)
                        asignados.forEach(function(u) {
                            if (u.uasignado && !_excl.includes(u.uasignado)) _excl.push(u.uasignado)
                        })
                        _fuDisp.setAttribute('data-excluded', _excl.join(','))
                        if (typeof updateFloatingMultiselectDisplay === 'function') updateFloatingMultiselectDisplay('crm_asignados_fu')
                    }

                    // Create dept progress select in #crm_dept_estados (one table per dept)
                    var deptEstados = document.getElementById('crm_dept_estados')
                    if (deptEstados && !document.getElementById('tabla_' + deptName)) {
                        var table = document.createElement('table')
                        table.id = 'tabla_' + deptName
                        table.className = 'tabla_asignados'
                        // Dept header row
                        var tr = document.createElement('tr')
                        var th = document.createElement('th')
                        th.setAttribute('colspan', '4')
                        th.innerHTML = deptName
                        th.className = 'text-truncate'
                        tr.appendChild(th)
                        table.appendChild(tr)
                        // Progress row
                        tr = document.createElement('tr')
                        var td = document.createElement('td')
                        td.setAttribute('colspan', '2')
                        td.innerHTML = 'Progress'
                        tr.appendChild(td)
                        td = document.createElement('td')
                        td.setAttribute('colspan', '2')
                        td.id = 'estado_' + deptName
                        var select = document.createElement('select')
                        select.id = 'select_' + deptName
                        select.className = 'form-control crm_select'
                        var userDept = document.getElementById('userCdepartamento')?.value || '0'
                        var deptArr = userDept.split(';')
                        if (!deptArr.includes(String(deptId))) {
                            select.disabled = true
                            select.style.opacity = '0.6'
                            select.title = 'You can only edit the progress of your own department'
                        }
                        td.appendChild(select)
                        tr.appendChild(td)
                        table.appendChild(tr)
                        deptEstados.appendChild(table)
                        crm_fill_asignados(asignados, deptName, cestado)
                        crm_fill_estados(crm_id, cdepartamento, deptName, cestado)
                        // Sort dept tables alphabetically
                        ;[...deptEstados.children]
                            .sort((a, b) => a.innerText > b.innerText ? 1 : -1)
                            .forEach(node => deptEstados.appendChild(node))
                    }
                }
            } else {
                launch_toast("Error loading crm_get_user", 2)
            }
        }
    })
}

function crm_get_case(crm_id) {
    // exclude 'ffin' because we now manage via input#due_date_input
    // exclude 'ffinicio' because we now manage via input#start_date_input
    // exclude 'xbusiness_relationship' — it's now a select that we sync separately
    campos = ["conversacion_titulo", "ffingreso", "ffmodificado", "de", "asunto_interno", "xcontacto", "xprioridad"]
    $.ajax({
        url: '/crm_get_case',
        data: JSON.stringify({
            crm_id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                crm_main = response.crm_main.recordset[0]
                estados_dep = response.estados_dep.recordset
                crm_container = document.getElementById("crm_container")
                for (index = 0; index < campos.length; index++) {
                    //Borrar contenido para cuando se actualizan los integrantes
                    document.getElementById(campos[index]).innerHTML = ''
                    if (campos[index] == "xprioridad") {
                        svg = document.createElement("img")
                        svg.style.width = "16px"
                        svg.style.height = "16px"
                        svg.style.marginRight = "8px"
                        svg.src = "img/prioridad_" + crm_main[campos[index]] + ".svg"
                        svg.id = "prioridad_" + crm_main[campos[index]]
                        svg.title = crm_main[campos[index]]
                        document.getElementById(campos[index]).appendChild(svg)
                    }
                    p = document.createElement("p")
                    if (campos[index] == "xcontacto") {
                        // Multi-contact: render each contact as a clickable link badge
                        const raw    = crm_main[campos[index]]
                        const rawIds = crm_main['xcontacto_ids']
                        const userId = new URLSearchParams(window.location.search).get('p') || ''
                        if (raw) {
                            const names = raw.split('; ')
                            const ids   = rawIds ? rawIds.split('; ') : []
                            names.forEach(function(name, i) {
                                const id = ids[i] ? ids[i].trim() : null
                                const el = id ? document.createElement('a') : document.createElement('span')
                                el.textContent = name.trim()
                                if (id) {
                                    el.href = '/badaco-contacts/edit/' + id 
                                    el.target = '_blank'
                                }
                                el.style.cssText = 'display:inline-block;background:#e8f4fb;color:#1a5276;border-radius:10px;padding:2px 10px;font-size:.78rem;font-weight:600;margin:2px 2px;text-decoration:none;'
                                document.getElementById(campos[index]).appendChild(el)
                            })
                        } else {
                            p.innerHTML = '—'
                            document.getElementById(campos[index]).appendChild(p)
                        }
                        continue
                    }
                    p.innerHTML = crm_main[campos[index]]
                    document.getElementById(campos[index]).appendChild(p)
                }
                // Set start date input value from display format (dd/MM/yyyy hh:mm tt)
                try {
                    const startInput = document.getElementById('start_date_input')
                    if (startInput) {
                        const display = crm_main['ffinicio'] // e.g. dd/MM/yyyy hh:mm tt
                        const v = parseDisplayDateToLocalInput(display)
                        if (v) startInput.value = v
                        if (typeof window['validateInput_start_date_input'] === 'function') window['validateInput_start_date_input']()
                    }
                } catch (e) { console.log(e) }
                // Set due date input value from display format (dd/MM/yyyy hh:mm tt)
                try {
                    const dueInput = document.getElementById('due_date_input')
                    if (dueInput) {
                        const display = crm_main['ffin'] // e.g. dd/MM/yyyy hh:mm tt
                        const v = parseDisplayDateToLocalInput(display)
                        if (v) dueInput.value = v
                        if (typeof window['validateInput_due_date_input'] === 'function') window['validateInput_due_date_input']()
                    }
                } catch (e) { console.log(e) }
                document.getElementById("departamentoOrigen").value = crm_main.departamento_id
                // Sync business relationship select
                try {
                    const brSel = document.getElementById('business_relationship_select')
                    if (brSel) brSel.value = crm_main.b_relation_id != null ? String(crm_main.b_relation_id) : ''
                } catch (e) { console.log(e) }
                var deptEstados = document.getElementById('crm_dept_estados')
                if (deptEstados) {
                    while (deptEstados.firstChild) deptEstados.removeChild(deptEstados.firstChild)
                }
                // Reset the excluded-users list before repopulating from the fresh assignment data
                var _fuDispReset = document.querySelector('.floating-users-display[data-name="crm_asignados_fu"]')
                if (_fuDispReset) _fuDispReset.setAttribute('data-excluded', '')
                for (let index = 0; index < estados_dep.length; index++) {
                    crm_get_user(estados_dep[index].cdepartamento, estados_dep[index].cestado, crm_id);
                }
                // document.getElementById("conversacion_titulo").innerHTML = crm_main.conversacion_titulo
                // document.getElementById("conversacion_ingreso").innerHTML = crm_main.ffingreso
            } else {
                launch_toast("Error loading CRM", 2)
            }
        }
    })
}
// Convert "dd/MM/yyyy hh:mm tt" to "yyyy-MM-ddTHH:mm" for datetime-local inputs
function parseDisplayDateToLocalInput(display) {
    if (!display || typeof display !== 'string') return ''
    // Expected: 01/12/2025 03:45 PM
    const m = display.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s*(AM|PM)/i)
    if (!m) return ''
    let [_, dd, MM, yyyy, hh, mm, ap] = m
    let H = parseInt(hh, 10)
    if (ap.toUpperCase() === 'PM' && H < 12) H += 12
    if (ap.toUpperCase() === 'AM' && H === 12) H = 0
    const HH = String(H).padStart(2, '0')
    return `${yyyy}-${MM}-${dd}T${HH}:${mm}`
}

// Post updated start date
function update_start_date() {
    const crm_id = document.getElementById('crm_id')?.value
    const finicio = document.getElementById('start_date_input')?.value
    const UserName = document.getElementById('UserName')?.value
    if (!crm_id || !finicio || !UserName) { launch_toast('Missing data to update start date', 2); return }
    $.ajax({
        url: '/update_start_date',
        data: JSON.stringify({ crm_id, finicio, UserName }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result === 1) {
                launch_toast('Start date updated', 1)
                crm_get_case(crm_id)
                crm_case_details(crm_id)
            } else {
                launch_toast('Error updating start date', 2)
            }
        },
        error: function () { launch_toast('Error updating start date', 2) }
    })
}

// Post updated due date
function update_due_date() {
    const crm_id = document.getElementById('crm_id')?.value
    const ffin = document.getElementById('due_date_input')?.value
    const UserName = document.getElementById('UserName')?.value
    if (!crm_id || !ffin || !UserName) { launch_toast('Missing data to update due date', 2); return }
    $.ajax({
        url: '/update_due_date',
        data: JSON.stringify({ crm_id, ffin, UserName }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result === 1) {
                launch_toast('Due date updated', 1)
                // Refresh details and messages
                crm_get_case(crm_id)
                crm_case_details(crm_id)
            } else {
                launch_toast('Error updating due date', 2)
            }
        },
        error: function () { launch_toast('Error updating due date', 2) }
    })
}

function update_business_relationship() {
    const crm_id = document.getElementById('crm_id')?.value
    const sel = document.getElementById('business_relationship_select')
    const b_relation_id = sel ? sel.value : ''
    const UserName = document.getElementById('UserName')?.value
    if (!crm_id || !UserName) { launch_toast('Missing data to update business relationship', 2); return }
    $.ajax({
        url: '/crm_update_business_relationship',
        data: JSON.stringify({ crm_id, b_relation_id: b_relation_id || null, UserName }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result === 1) {
                launch_toast('Business relationship updated', 1)
                crm_get_case(crm_id)
                crm_case_details(crm_id)
            } else {
                launch_toast('Error updating business relationship', 2)
            }
        },
        error: function () { launch_toast('Error updating business relationship', 2) }
    })
}
function crm_case_details(crm_id) {
    $.ajax({
        url: '/crm_get_detail',
        data: JSON.stringify({
            crm_id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                crm_msg = response.crm_msg.recordset
                crm_container = document.getElementById("tbody")
                while (crm_container.firstChild) {
                    crm_container.removeChild(crm_container.firstChild);
                }
                for (index = 0; index < crm_msg.length; index++) {
                    //main button
                    tr = document.createElement("tr")
                    // Tag row with message type for filtering
                    tr.dataset.msgType = crm_msg[index].ctipo === 3 ? 'system' : 'user';
                    //Date
                    td = document.createElement("td")
                    td.innerHTML = crm_msg[index].ffrecibido
                    tr.appendChild(td)
                    //Message Preview
                    td = document.createElement("td")
                    mensaje_preview = document.createElement("p")
                    
                    const bodyMensaje = crm_msg[index].body_mensaje || ''
                    const senderName = String(crm_msg[index].de || '')
                    const senderHtml = escapeCrmHtml(senderName)
                    const messageTitle = String(crm_msg[index].nombre_mensaje || '')
                    const isAiMessage = senderName.toLowerCase().includes('ai') || messageTitle.toLowerCase().includes('ai')
                    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(bodyMensaje)
                    const shouldRenderRich = isAiMessage || hasHtmlTags || crmLooksLikeMarkdown(bodyMensaje)
                    
                    const plainPreview = bodyMensaje.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
                    const uniqueId = "msg-body-" + crm_msg[index].id_msg;

                    if (shouldRenderRich && bodyMensaje.trim() !== '') {
                        const richBody = hasHtmlTags ? bodyMensaje : renderCrmMessageBody(bodyMensaje)
                        const needsToggle = plainPreview.length > 200
                        mensaje_preview.innerHTML = "From: " +
                        "<b>" + senderHtml + "</b><br>" +
                        "<div id='" + uniqueId + "-content' class='crm-message-body crm-message-body--rich" + (needsToggle ? " crm-message-body--collapsible" : "") + "'>" + richBody + "</div>" +
                        (needsToggle
                            ? "<a href='#' onclick='toggleMessageBody(\"" + uniqueId + "\"); return false;' id='" + uniqueId + "-toggle' class='crm-show-more-link'>Show more</a>"
                            : "")
                    } else if (plainPreview.length > 200) {
                        const fullText = escapeCrmHtml(plainPreview).replace(/\r?\n/g, '<br>')
                        
                        mensaje_preview.innerHTML = "From: " +
                        "<b>" +
                            senderHtml +
                        "</b><br>" +
                            "<div id='" + uniqueId + "-content' class='crm-message-body crm-message-body--collapsible'>" + fullText + "</div>" +
                            "<a href='#' onclick='toggleMessageBody(\"" + uniqueId + "\"); return false;' id='" + uniqueId + "-toggle' class='crm-show-more-link'>Show more</a>"
                    } else {
                        const plainBody = escapeCrmHtml(plainPreview).replace(/\r?\n/g, '<br>')
                        mensaje_preview.innerHTML = "From: " +
                        "<b>" +
                            senderHtml +
                        "</b><br>" +
                            plainBody
                    }
                    
                    td.appendChild(mensaje_preview)
                    //div hijo
                    div_img_icons = document.createElement("div")
                    div_img_icons.className = "collapse"
                    div_img_icons.id = "collapse-" + crm_msg[index].id_msg
                    div_img_icons.setAttribute("aria-labelledby", "headingOne")
                    div_body = document.createElement("div")
                    div_body.innerHTML = ""
                    div_img_icons.appendChild(div_body)
                    td.appendChild(div_img_icons)
                    tr.appendChild(td)
                    //End Message Preview
                    //Icons
                    td = document.createElement("td")
                    icon_mensaje = document.createElement("img")
                    if (crm_msg[index].ms_filename) {
                        const messageMainId = crm_msg[index].id_main
                        const messageId = crm_msg[index].id_msg
                        const messageFilename = crm_msg[index].ms_filename
                        icon_mensaje.className = "clic"
                        icon_mensaje.src = "/img/envelope-regular.svg"
                        icon_mensaje.id = "crm_" + messageMainId + "_" + messageId
                        icon_mensaje.onclick = function () {
                            crm_files(messageMainId, messageId, messageFilename)
                        }
                        td.appendChild(icon_mensaje)
                    }
                    if (crm_msg[index].files) {
                        a = document.createElement("a")
                        a.setAttribute("data-bs-toggle", "collapse")
                        a.setAttribute("data-bs-target", "#collapse-" + crm_msg[index].id_msg)
                        a.setAttribute("aria-expanded", "false")
                        a.setAttribute("href", "#")
                        a.className = "a_accordion"
                        a.setAttribute("style", "collapse")
                        icon_adjunto = document.createElement("div")
                        icon_adjunto.innerHTML="🔗"
                        a.appendChild(icon_adjunto)
                        div_files_contenedor = document.createElement("div")
                        div_files_contenedor.className = "collapse"
                        div_files_contenedor.id = "collapse-" + crm_msg[index].id_msg
                        file = crm_msg[index].files.split(';')
                        for (let f = 0; f < file.length; f++) {
                            const currentFile = file[f]
                            // fallback: get id_main/id_msg from parent scope if undefined
                            let id_main = crm_msg[index]?.id_main || crm_msg[index]?.id || null;
                            let id_msg = crm_msg[index]?.id_msg || null;
                            if (!id_main || !id_msg) continue;
                            div_file = document.createElement("div")
                            div_file.className = "crm_celda clic"
                            div_file.style.margin = "6px 0px"
                            div_file.style.display = 'flex'
                            div_file.style.alignItems = 'center'
                            div_file.style.gap = '8px'
                            div_file.onclick = function () {
                                crm_files(id_main, id_msg, currentFile)
                            }
                            const iconSrc = getCrmFileIcon(currentFile)
                            icon_adjunto = document.createElement("img")
                            icon_adjunto.src = iconSrc
                            icon_adjunto.alt = "file"
                            icon_adjunto.className = "crm-file-icon"
                            icon_adjunto.style.width = "25px"
                            icon_adjunto.style.height = "25px"
                            icon_adjunto.style.marginRight = "8px"
                            p = document.createElement('p')
                            p.innerHTML = currentFile
                            p.style.margin = '0'
                            p.style.flex = '1'
                            // Favorite button (toggle)
                            const isFavInit = !!(crm_msg[index].favorites_files && crm_msg[index].favorites_files.split(';').includes(currentFile));
                            let favBtn = document.createElement('button');
                            favBtn.className = 'btn-favorite';
                            favBtn.innerHTML = '★';
                            favBtn.dataset.isFav = isFavInit ? '1' : '0';
                            favBtn.dataset.favMain = id_main;
                            favBtn.dataset.favMsg = id_msg;
                            favBtn.dataset.favFile = currentFile;
                            favBtn.title = isFavInit ? 'Remove from favorites' : 'Mark as a favorite file';
                            favBtn.style.color = isFavInit ? '#ffc107' : '';
                            favBtn.style.border = 'none';
                            favBtn.style.marginRight = '.5rem';
                            favBtn.onclick = function (e) {
                                e.stopPropagation();
                                const currentIsFav = favBtn.dataset.isFav === '1';
                                const newFav = currentIsFav ? 0 : 1;
                                fetch('/crm_archivo_favorite', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id_main, id_msg, xname: currentFile, favorites: newFav })
                                }).then(r => r.json()).then(data => {
                                    if (!data || data.result === 0) return;
                                    const msgIdx = crm_msg.findIndex(m => m.id_main === id_main && m.id_msg === id_msg);
                                    if (msgIdx >= 0) {
                                        let favFiles = (crm_msg[msgIdx].favorites_files || '').split(';').filter(Boolean);
                                        if (newFav === 1) { if (!favFiles.includes(currentFile)) favFiles.push(currentFile); }
                                        else { favFiles = favFiles.filter(f => f !== currentFile); }
                                        crm_msg[msgIdx].favorites_files = favFiles.join(';');
                                    }
                                    favBtn.dataset.isFav = newFav ? '1' : '0';
                                    favBtn.style.color = newFav ? '#ffc107' : '';
                                    favBtn.title = newFav ? 'Remove from favorites' : 'Mark as a favorite file';
                                    refreshFavoritesPanel();
                                });
                            };
                            div_file.appendChild(favBtn)
                            div_file.appendChild(icon_adjunto)
                            div_file.appendChild(p)
                            div_file.appendChild(buildCrmFileActions(id_main, id_msg, currentFile))
                            div_files_contenedor.appendChild(div_file)
                        }
                        mensaje_preview.appendChild(div_files_contenedor)
                        td.appendChild(icon_mensaje)
                        td.appendChild(a)
                    }
                    tr.appendChild(td)
                    //End Icons
                    crm_container.appendChild(tr)
                }
                // Apply default message type filter (user messages only)
                filterCrmMessages();
                refreshFavoritesPanel();
            } else {
                launch_toast("Error loading CRM", 2)
            }
        }
    })

}
function crm_files(crm_id, msg_id, filename) {
    if (!crm_id || !msg_id || !filename) {
        launch_toast('Invalid file data', 2)
        return
    }

    const ext = getCrmFileExtension(filename)
    const endpoints = getCrmFileEndpoints(crm_id, msg_id, filename)

    if (ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        window.open(endpoints.fileUrl, '_blank', 'noopener')
        return
    }

    if (ext === '.msg') {
        openCrmFileFromBackend(crm_id, msg_id, filename, 'MSG')
        return
    }

    window.location = endpoints.downloadUrl
}
function crm_fill_asignados(asignados, departamento, cestado) {
    tabla = document.getElementById("tabla_" + departamento)
    for (index = 0; index < asignados.length; index++) {
        if (asignados[index].nombre == departamento) {
            tr = document.createElement("tr")
            // tr.setAttribute("onmouseover", "crm_show_remove('" + asignados[index].uasignado + "')")
            tr.className = "crm_tr_remove_user"
            tr.setAttribute('data-cdepartamento', String(asignados[index].id || ''))
            //Columna imagen de usuario
            td = document.createElement("td")
            td.className = "col_profile_pic"
            img = document.createElement("img")
            img.src = "pic/" + asignados[index].uasignado + ".png"
            img.className = "profile_pic"
            td.appendChild(img)
            tr.appendChild(td)
            //Columna Nombre de usuario
            td = document.createElement("td")
            td.setAttribute("colspan", "3")
            td.innerHTML = asignados[index].Name
            tr.appendChild(td)
            //Boton elminar usuario
            img = document.createElement("img")
            img.src = "img/xmark-solid.svg"
            img.setAttribute("onclick", "crm_remove_user('" + asignados[index].uasignado + "'," + cestado + "," + (asignados[index].id || 0) + ")")
            img.className = "crm_remove_user"
            td.appendChild(img)
            tr.appendChild(td)
            //Fin tabla
            tabla.appendChild(tr)
        }
    }
}
function crm_get_estados(dep) {
    $.ajax({
        url: '/crm_get_estados',
        data: JSON.stringify({
            dep
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                estados = response.estados
                select = document.getElementById("crm_" + dep)
                for (let index = 0; index < estados.length; index++) {
                    option = document.createElement("option")
                    option.value = estados[index].cestado
                    option.innerHTML = estados[index].xnombre
                    select.appendChild(option)
                }
                // campos_new_case.push("crm_" + dep) // Deprecated
            } else {
                launch_toast("Error loading CRM", 2)
            }
        }
    })
}
function crm_fill_estados(crm_id, cdepartamento, xdepartamento, cestado) {
    $.ajax({
        url: '/crm_get_estados_x_departamento',
        data: JSON.stringify({
            xdepartamento
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                select = document.getElementById("select_" + xdepartamento)
                estados_dep = response.estados_dep
                for (i = 0; i < estados_dep.length; i++) {
                    option = document.createElement("option")
                    option.value = estados_dep[i].cestado
                    option.innerHTML = estados_dep[i].xnombre
                    if (cestado == estados_dep[i].cestado) {
                        option.selected = 'selected'
                    }
                    select.appendChild(option)
                    //Busqueda de departamento ID para ignorar el 0 de todos
                    if (cdepartamento < estados_dep[i].cdepartamento) {
                        cdepartamento = estados_dep[i].cdepartamento
                    }
                }
                select.setAttribute("onchange", "crm_cambio_estado('" + select.id + "', " +
                    cdepartamento + ", '" +
                    xdepartamento + "' )");
                // celda.appendChild(SelectDiv)
            } else {
                launch_toast("Error loading Status List", 2)
            }
        }
    })

    // celda.className = "crm_celda"
    // var x = celda.getBoundingClientRect().bottom
    // var y = celda.getBoundingClientRect().left
    // p = document.createElement("p")
    // p.innerHTML = estados[0].xestado
    // p.className = "font_normal"
    // p.id = 'estado_selector_' + estados[index].xdepartamento
    // p.setAttribute("onclick",`crm_selector('${estados[index].xdepartamento}',
    //     ${x}, 
    //     ${y},
    //     ${dep})`);
    // crm_selector(estados[index].xdepartamento, dep, estados[index].cestado)
    // img = document.createElement("img")
    // img.id = 'estado_img_' + estados[index].xdepartamento
    // img.src = "img/caret-down-solid.svg"
    // img.className = "crm_icons"
    // // p.appendChild(img)
    // celda.appendChild(p)
    // celda.appendChild(img)
    // input = document.createElement("input")
    // input.className = "Not"
    // input.id = 'estado_selector_id_' + estados[index].xdepartamento
    // input.value = estados[0].cestado
    // celda.appendChild(input)
}

function crm_selector(departamento, cdepartamento, cestado) {
    // Funcion para crear el selctor de estados o usuarios segun el departamento
    // X y Y son para coloar el selector
    $.ajax({
        url: '/crm_get_estados_x_departamento',
        data: JSON.stringify({
            departamento
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                estados = response.estados
                // fondo = document.createElement('div');
                // fondo.setAttribute("onclick", "crm_selector('" + departamento + "', 0 ,0)")
                // fondo.className = "fondo"
                // fondo.id = "fondo"
                // SelectDiv = document.createElement('div');
                // x -= 60
                // SelectDiv.style.top = `${x}px`;
                // SelectDiv.style.left = `${y}px`;
                // SelectDiv.className = "popup_select"
                // SelectDiv.id = "SelectDiv_" + departamento
                // SelectDiv.className = "crm_celda"
                // cestado = document.getElementById('estado_selector_id_' + departamento).value
                // select = document.createElement("select")
                select = document.getElementById("select_" + departamento)
                // select.className = "form-control crm_select"
                // cdepartamento = 0
                for (index = 0; index < estados.length; index++) {
                    option = document.createElement("option")
                    option.value = estados[index].cestado
                    option.innerHTML = estados[index].xnombre
                    if (cestado == estados[index].cestado) {
                        option.selected = 'selected'
                    }
                    select.appendChild(option)
                    //Busqueda de departamento ID para ignorar el 0 de todos
                    if (cdepartamento < estados[index].cdepartamento) {
                        cdepartamento = estados[index].cdepartamento
                    }
                }
                select.setAttribute("onchange", "crm_cambio_estado('" + select.id + "', " +
                    cdepartamento + ", '" +
                    departamento + "' )");
                // SelectDiv.appendChild(select)
                // button = document.createElement("button")
                // button.innerHTML = "Update"
                // button.className = "form-control submitButton"
                // button.setAttribute("onclick","crm_cambio_estado('" + select.id + "', " + 
                //     cdepartamento +", '" + 
                //     departamento +"' )");
                // SelectDiv.appendChild(button)
                // document.getElementById('estado_selector_' + departamento).classList.toggle("Not")
                // document.getElementById('estado_img_' + departamento).classList.toggle("Not")
                // celda = document.getElementById("estado_" + departamento)
                // // body = document.getElementsByTagName('body')[0];
                // close = document.createElement("img")
                // close.src = "/img/xmark-solid.svg"
                // close.setAttribute("onclick","crm_selector('" + departamento + "' )");
                // close.className = 'crm_icons'
                // SelectDiv.appendChild(close)
                celda.appendChild(SelectDiv)
            } else {
                launch_toast("Error loading Status List", 2)
            }
        }
    })
    // if(document.getElementById("SelectDiv_" + departamento)){
    //     try{
    //         document.getElementById('estado_selector_' + departamento).classList.toggle("Not")
    //         document.getElementById("SelectDiv_" + departamento).remove()}
    //     catch(e){console.log(e)}
    // }else{

    // }
}
function crm_cambio_estado(select_name, cdepartamento, departamento) {
    crm_id = document.getElementById("crm_id").value
    select = document.getElementById(select_name)
    userName = document.getElementById("UserName").value
    estado_valor = select.value
    estado_texto = select.options[select.selectedIndex].text
    // estado_old = document.getElementById('estado_selector_' + departamento).innerHTML
    $.ajax({
        url: '/crm_cambio_estado',
        data: JSON.stringify({
            estado_valor,
            cdepartamento,
            crm_id,
            userName
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                // document.getElementById('estado_selector_' + departamento).innerHTML = estado_texto
                // document.getElementById('estado_selector_id_' + departamento).value = estado_valor
                launch_toast("Status changed successfully", 1)
                // crm_selector(departamento, '', '', cdepartamento)
                crm_msg_insert(crm_id,
                    cdepartamento,
                    departamento,
                    "Change estatus",
                    departamento +' update the status to"' + estado_texto + '".'
                )
            } else {
                launch_toast("Error changing status", 2)
            }
        }
    })
}

function crm_msg_insert(crm_id, cdepartamento, departamento, nombre_mensaje, mensaje, ctipo) {
    userid = document.getElementById("UsuarioID").value
    UserEmail = document.getElementById("UserEmail").value
    const systemMessages = ['Add user', 'Remove user'];
    const resolvedCtipo = ctipo !== undefined ? ctipo : (systemMessages.includes(nombre_mensaje) ? 3 : 1);
    $.ajax({
        url: '/crm_msg_insert',
        data: JSON.stringify({
            userid,
            UserEmail,
            crm_id,
            cdepartamento,
            departamento,
            nombre_mensaje,
            mensaje,
            ctipo: resolvedCtipo
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                crm_case_details(crm_id)
            } else {
                launch_toast("Error in new log", 2)
            }
        }
    })
}

function crm_show_asignar() {
    crm_id = document.getElementById("crm_id").value
    cdepartamento = document.getElementById("cdepartamento").value
    if (document.getElementById("crm_user_grid_container")) {
        try {
            document.getElementById("crm_user_grid_container").remove()
        }
        catch (e) { console.log(e) }
    } else {
        $.ajax({
            url: '/crm_show_asignar',
            data: JSON.stringify({
                crm_id,
                cdepartamento
            }),
            type: 'POST',
            contentType: 'application/json',
            success: function (response) {
                if (response.result == 1) {
                    usuarios = response.usuarios
                    div = document.getElementById("divasignar")

                    // Create container for user grid
                    const container = document.createElement("div")
                    container.id = "crm_user_grid_container"
                    container.style.cssText = "max-height: 400px; overflow-y: auto; padding: 10px;"

                    // Group users by department
                    const usersByDept = {}
                    usuarios.forEach(user => {
                        if (!usersByDept[user.xdepartamento]) {
                            usersByDept[user.xdepartamento] = []
                        }
                        usersByDept[user.xdepartamento].push(user)
                    })

                    // Create sections for each department
                    Object.keys(usersByDept).forEach(deptName => {
                        // Department header
                        const deptHeader = document.createElement("h6")
                        deptHeader.innerHTML = deptName
                        deptHeader.style.cssText = "margin-top: 15px; margin-bottom: 10px; font-weight: bold;"
                        container.appendChild(deptHeader)

                        // User grid for this department
                        const userGrid = document.createElement("div")
                        userGrid.style.cssText = "display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;"

                        usersByDept[deptName].forEach(user => {
                            const userWrapper = document.createElement("div")
                            userWrapper.style.cssText = "text-align: center; cursor: pointer;"
                            userWrapper.title = user.Name
                            userWrapper.setAttribute("onclick", `crm_add_asignado('${user.userid}', '${user.Name}', '${user.xdepartamento}', ${user.department_id})`)

                            const img = document.createElement("img")
                            img.src = "pic/" + user.userid + ".png"
                            img.className = "profile_pic icon"
                            img.style.cssText = "width: 40px; height: 40px; border-radius: 50%; border: 2px solid #ddd; transition: border-color 0.2s;"
                            img.setAttribute("onmouseover", "this.style.borderColor='#00586f'")
                            img.setAttribute("onmouseout", "this.style.borderColor='#ddd'")

                            userWrapper.appendChild(img)
                            userGrid.appendChild(userWrapper)
                        })

                        container.appendChild(userGrid)
                    })

                    div.appendChild(container)
                } else {
                    launch_toast("Error getting user list", 2)
                }
            }
        })
    }
}

function form_crm_new_msg() {
    // Validate description — support both regular textarea and rich contenteditable
    var desc = document.getElementById('description');
    var isRichEditor = desc && desc.getAttribute('contenteditable') === 'true';
    var descValue = '';
    if (desc) {
        descValue = isRichEditor ? desc.textContent.trim() : desc.value.trim();
    }
    if (!desc || !descValue) {
        if (desc) {
            var wrapper = desc.closest('.floating-rich-editor') || desc.closest('.floating-input-container');
            if (wrapper) {
                wrapper.classList.remove('valid');
                wrapper.classList.add('error');
            }
            var descError = document.querySelector('[data-error-for="description"]');
            if (descError) {
                descError.textContent = 'Message details is required';
                descError.classList.add('show');
            }
        }
        launch_toast('Error: Please complete all required fields correctly.', 2);
        return;
    }

    var submitBtn = document.getElementById('submitCRMNewMSGCase');
    var originalText = submitBtn ? submitBtn.innerHTML : '';
    // Disable the button to prevent duplicate submissions
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.innerHTML = '<span class="fa fa-spinner fa-spin"></span> Sending...';
    }

    var data = new FormData(document.getElementById("form_crm_new_msg"));
    $.ajax({
        type: "POST",
        url: '/form_crm_new_msg',
        data: data,
        enctype: 'multipart/form-data',
        processData: false,
        contentType: false,
        dataType: "json",
        success: function (response) {
            if (response.result == 0) {
                launch_toast("Error", 2);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                    submitBtn.style.cursor = 'pointer';
                    submitBtn.innerHTML = originalText;
                }
            } else {
                opennewcase.click();
                crm_case_details(crm_id);
                crm_get_case(crm_id);
            }
        },
        error: function () {
            launch_toast("Error sending message", 2);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
                submitBtn.innerHTML = originalText;
            }
        }
    })
}
function crm_add_asignado(userid, username, deptName, deptId) {
    crm_id = document.getElementById("crm_id").value
    if (userid) {
        $.ajax({
            url: '/crm_add_asignado',
            data: JSON.stringify({
                user: userid,
                crm_id
            }),
            type: 'POST',
            contentType: 'application/json',
            success: function (response) {
                if (response.result == 1) {
                    document.getElementById("departamentoOrigen").value = response.dep_nuevo
                    users = response.users[0]
                    crm_msg_insert(crm_id,
                        users.cdepartamento,
                        users.xdepartamento,
                        'Add user',
                        ' added user "' + users.Name + '".')
                    try {
                        cestado = document.getElementById("select_" + users.xdepartamento).value
                    } catch (error) {
                        cestado = 0
                    }
                    crm_id = document.getElementById("crm_id").value

                    // Reload case data to get updated assigned users
                    crm_get_case(crm_id)

                    // Reset the add-user selector to empty
                    var _fuDisp = document.querySelector('.floating-users-display[data-name="crm_asignados_fu"]')
                    if (_fuDisp) {
                        _fuDisp.querySelectorAll('input[type="hidden"]').forEach(function(i) { i.remove() })
                        if (typeof updateFloatingMultiselectDisplay === 'function') updateFloatingMultiselectDisplay('crm_asignados_fu')
                    }
                    var _fuDropdown = document.getElementById('dropdown_crm_asignados_fu')
                    if (_fuDropdown) _fuDropdown.classList.remove('show')
                    launch_toast(`User "${username}" added successfully`, 1)
                } else {
                    launch_toast("Error adding user", 2)
                }
            }
        })
    }
}
function showCrmDepartmentRequiredModal() {
    if (typeof showModal === 'function') {
        showModal(
            'At least one assigned user must remain in each department. You cannot remove this user because they are the only one assigned in their department.',
            function onOk() { },
            function onCancel() { },
            {
                title: 'Cannot remove user',
                okText: 'Understood',
                cancelText: 'Close',
                type: 'warning'
            }
        )
        return
    }
    launch_toast('There must be at least one user per department', 2)
}

function crm_remove_user(u_asignado, cestado, cdepartamento) {
    var deptId = String(cdepartamento || '')
    if (deptId) {
        var assignedInDepartment = document.querySelectorAll('.crm_tr_remove_user[data-cdepartamento="' + deptId + '"]').length
        if (assignedInDepartment <= 1) {
            showCrmDepartmentRequiredModal()
            return
        }
    }

    crm_id = document.getElementById("crm_id").value
    $.ajax({
        url: '/crm_remove_user',
        data: JSON.stringify({
            u_asignado,
            crm_id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                document.getElementById("departamentoOrigen").value = response.dep_nuevo
                users = response.users[0]
                crm_msg_insert(crm_id,
                    users.cdepartamento,
                    users.nombre,
                    'Remove user',
                     'removed user "' + users.Name + '".')
                // alert(users.cdepartamento)
                // crm_get_user(users.cdepartamento, cestado, crm_id)
                crm_get_case(crm_id)
            } else {
                if (response.result == 2) {
                    showCrmDepartmentRequiredModal()
                }
                else {
                    launch_toast("Error removing user", 2)
                }
            }
        }
    })
}

function crm_show_sirdata(targetDivId = 'divsirdata') {
    const targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) return;
    
    if (document.getElementById("crm_select_sirdata")) {
        try {
            document.getElementById("crm_select_sirdata").remove()
            document.getElementById("tooltip_inputsirdata").remove()
            document.getElementById("boton_add_sirdata").remove()
        }
        catch (e) { console.log(e) }
    } else {
        select = document.createElement("select")
        select.className = "form-control crm_select"
        select.id = "crm_select_sirdata"
        select.setAttribute("onchange", "sir_data_validation('crm_select_sirdata', 'inputsirdata')")
        option = document.createElement("option")
        option.value = '---'
        option.innerHTML = '---'
        select.appendChild(option)
        //Modulos en SIR
        //incluir en post crm_add_sirdata()
        for (let index = 0; index < fac_modules.length; index++) {
            option = document.createElement("option")
            option.value = "fac_" + fac_modules[index]
            option.innerHTML = fac_modules[index]
            if (index == 0) {
                optgroup = document.createElement("optgroup")
                optgroup.label = "Facultatives"
            }
            optgroup.appendChild(option)
            select.appendChild(optgroup)
        }
        for (let index = 0; index < treat_modules.length; index++) {
            option = document.createElement("option")
            option.value = "treaty_" + treat_modules[index]
            option.innerHTML = treat_modules[index]
            if (index == 0) {
                optgroup = document.createElement("optgroup")
                optgroup.label = "Treaties"
            }
            optgroup.appendChild(option)
            select.appendChild(optgroup)
        }
        targetDiv.appendChild(select)
        p = document.createElement("p")
        p.id = "tooltip_" + "inputsirdata"
        input = document.createElement("input")
        input.className = "form-control crm_select"
        input.id = "inputsirdata"
        input.setAttribute("oninput", "sir_data_validation('crm_select_sirdata', this.id)")
        p.appendChild(input)
        targetDiv.appendChild(p)
        boton = document.createElement("button")
        boton.className = "crm_s-btn"
        boton.innerHTML = "Add"
        boton.id = "boton_add_sirdata"
        boton.setAttribute("onclick", "crm_add_sirdata()")
        targetDiv.appendChild(boton)
    }
}
async function crm_add_sirdata() {
    modulo = crm_select_sirdata.value
    value = inputsirdata.value
    userid = (document.getElementById('UsuarioID') || document.getElementById('username') || {}).value || ''
    run = sir_data_validation(crm_select_sirdata.id, inputsirdata.id)

    if (run) {
        let crm_main = document.getElementById("crm_id")?.value
        $.ajax({
            url: '/crm_add_sirdata',
            data: JSON.stringify({
                modulo,
                value,
                crm_main,
                userid
            }),
            type: 'POST',
            contentType: 'application/json',
            success: function (response) {
                if (response.result == 1) {
                    if (typeof crm_get_sirdata === 'function') crm_get_sirdata(crm_main);
                    document.getElementById('inputsirdata').value = '';
                    launch_toast("Successfully added", 1);
                } else if (response.result == 0) {
                    launch_toast("Error loading SIR data", 2)
                } else if (response.result == 2) {
                    launch_toast("Error value does not exist", 2)
                } else if (response.result == 3) {
                    launch_toast("Error value is already associated with this case", 2)
                }
            }
        })
    }
    else {
        launch_toast("Error invalid input syntax", 2)
    }
}
function crm_get_sirdata(crm_id) {
    const casdataContainer = document.getElementById("sirdata")
    if (!casdataContainer) return
    while (casdataContainer.firstChild) {
        casdataContainer.removeChild(casdataContainer.firstChild);
    }
    // Ocultar card mientras carga
    const sirdataCard = document.getElementById('card-sirdata');
    if (sirdataCard) sirdataCard.style.display = 'none';
    $.ajax({
        url: '/crm_get_sirdata',
        data: JSON.stringify({ crm_id }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                rows = response.rows
                // Group rows by tabla
                const grouped = {}
                for (let i = 0; i < rows.length; i++) {
                    const t = rows[i].tabla
                    if (!grouped[t]) grouped[t] = []
                    grouped[t].push(rows[i])
                }
                const table = document.createElement("table")
                table.style.width = "100%"
                Object.keys(grouped).forEach(function (tabla) {
                    // Header
                    const trHead = document.createElement("tr")
                    const th = document.createElement("th")
                    th.innerHTML = tabla
                    th.colSpan = 2
                    trHead.appendChild(th)
                    table.appendChild(trHead)
                    // Rows
                    grouped[tabla].forEach(function (row) {
                        const tr = document.createElement("tr")
                        const tdInfo = document.createElement("td")
                        tdInfo.innerHTML = '<span class="sir-ref-id">' + row.sir_id + '</span>'
                            + (row.ffingreso ? '<span class="sir-meta"> · Created: ' + row.ffingreso + '</span>' : '')
                        const tdAct = document.createElement("td")
                        tdAct.style.textAlign = "right"
                        const btnDel = document.createElement('button');
                        btnDel.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-item-icon icon-tabler icons-tabler-outline icon-tabler-trash">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M4 7l16 0" />
                        <path d="M10 11l0 6" />
                        <path d="M14 11l0 6" />
                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                `; 
                        btnDel.className = 'btn btn-link btn-sm text-danger p-0 border-0 bg-transparent'
                        btnDel.title = "Remove reference"
                        btnDel.onclick = (function (r) {
                            return function () { crm_sirdata_delete(r.tabla, r.sir_id, crm_id) }
                        })(row)
                        tdAct.appendChild(btnDel)
                        tr.appendChild(tdInfo)
                        tr.appendChild(tdAct)
                        table.appendChild(tr)
                    })
                })
                casdataContainer.appendChild(table)
                if (sirdataCard && rows.length > 0) sirdataCard.style.display = '';
            } else {
                launch_toast("Error loading SIR data", 2)
            }
        }
    })
}
function crm_sirdata_delete(tabla, sir_id, crm_main) {
    showModal('Remove this reference?',
        function onOk() {
            const userid = document.getElementById('UsuarioID') ? document.getElementById('UsuarioID').value : '';
            $.ajax({
                url: '/crm_sirdata_delete',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ tabla: tabla, sir_id: sir_id, crm_main: crm_main, userid: userid }),
                dataType: 'json',
                success: function (response) {
                    if (response.result == 1) {
                        crm_get_sirdata(crm_main);
                    } else { launch_toast('Error removing reference', 2); }
                },
                error: function () { launch_toast('Error removing reference', 2); }
            });
        },
        function onCancel() { /* Cancelled, do nothing */ }
    );
}
function cas_data_validation(modulo, input) {
    run = false
    tooltip = document.getElementById("tooltip_" + input)
    modulo = document.getElementById(modulo)
    input = document.getElementById(input)
    var re = new RegExp(/^\d{1,4}-\d{1,}$/);
    run = re.test(input.value)
    if (input.value != '') {
        if (!run) {
            input.classList.add("input-error")
            try { tooltip.setAttribute("tooltip-message", "Invalid syntax") } catch (error) { }
        } else {
            input.classList.remove("input-error")
            try { tooltip.removeAttribute("tooltip-message") } catch (error) { }
        }
    }
    return run
};
function crm_show_casdata(targetDivId = 'divcasdata') {
    const targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) return;
    if (document.getElementById("crm_select_casdata")) {
        try {
            document.getElementById("crm_select_casdata").remove()
            document.getElementById("tooltip_inputcasdata").remove()
            document.getElementById("boton_add_casdata").remove()
        }
        catch (e) { console.log(e) }
    } else {
        select = document.createElement("select")
        select.className = "form-control crm_select"
        select.id = "crm_select_casdata"
        option = document.createElement("option")
        option.value = "regulated"
        option.innerHTML = "Regulated"
        select.appendChild(option)
        targetDiv.appendChild(select)
        p = document.createElement("p")
        p.id = "tooltip_" + "inputcasdata"
        input = document.createElement("input")
        input.className = "form-control crm_select"
        input.id = "inputcasdata"
        input.setAttribute("oninput", "cas_data_validation('crm_select_casdata', this.id)")
        p.appendChild(input)
        targetDiv.appendChild(p)
        boton = document.createElement("button")
        boton.className = "crm_s-btn"
        boton.innerHTML = "Add"
        boton.id = "boton_add_casdata"
        boton.setAttribute("onclick", "crm_add_casdata()")
        targetDiv.appendChild(boton)
    }
}
async function crm_add_casdata() {
    modulo = crm_select_casdata.value
    value = inputcasdata.value
    userid = (document.getElementById('UsuarioID') || document.getElementById('username') || {}).value || ''
    run = cas_data_validation(crm_select_casdata.id, inputcasdata.id)
    if (run) {
        let module_code, module_id
        let crmEl = document.getElementById("crm_id")
        if (crmEl && crmEl.value) {
            module_code = 'CRM'
            module_id = crmEl.value
        } else {
            module_code = 'APPROVAL'
            module_id = document.getElementById("ID")?.value
        }
        $.ajax({
            url: '/crm_add_casdata',
            data: JSON.stringify({ modulo, value, module_code, module_id, userid }),
            type: 'POST',
            contentType: 'application/json',
            success: function (response) {
                if (response.result == 1) {
                    if (typeof crm_get_casdata === 'function') crm_get_casdata(module_code, module_id);
                    document.getElementById('inputcasdata').value = '';
                    launch_toast("Successfully added", 1);
                } else if (response.result == 0) {
                    launch_toast("Error loading CAS data", 2)
                } else if (response.result == 2) {
                    launch_toast("Error value does not exist", 2)
                } else if (response.result == 3) {
                    launch_toast("Error value is already associated with this case", 2)
                }
            }
        })
    } else {
        launch_toast("Error invalid input syntax", 2)
    }
}
function crm_get_casdata(module_code, module_id) {
    const casdataContainer = document.getElementById("casdata")
    if (!casdataContainer) return
    while (casdataContainer.firstChild) {
        casdataContainer.removeChild(casdataContainer.firstChild);
    }
    const casdataCard = document.getElementById('card-casdata');
    if (casdataCard) casdataCard.style.display = 'none';
    $.ajax({
        url: '/crm_get_casdata',
        data: JSON.stringify({ module_code, module_id }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                rows = response.rows
                if (rows.length > 0) {
                    const table = document.createElement("table")
                    table.style.width = "100%"
                    const trHead = document.createElement("tr")
                    const th = document.createElement("th")
                    th.innerHTML = "CAS References"
                    th.colSpan = 2
                    trHead.appendChild(th)
                    table.appendChild(trHead)
                    for (let i = 0; i < rows.length; i++) {
                        const tr = document.createElement("tr")
                        const tdInfo = document.createElement("td")
                        tdInfo.innerHTML = '<span class="sir-ref-id">' + rows[i].reference + '-' + rows[i].reference_id + '</span>'
                            + (rows[i].ffingreso ? '<span class="sir-meta"> · Created: ' + rows[i].ffingreso + '</span>' : '')
                            + '<span class="sir-meta"> · ' + '</span>'
                        const tdAct = document.createElement("td")
                        tdAct.style.textAlign = "right"
                        const btnDel = document.createElement('button');
                        btnDel.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-item-icon icon-tabler icons-tabler-outline icon-tabler-trash">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M4 7l16 0" />
                        <path d="M10 11l0 6" />
                        <path d="M14 11l0 6" />
                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                `;
                        btnDel.className = 'btn btn-link btn-sm text-danger p-0 border-0 bg-transparent'
                        btnDel.title = "Remove reference"
                        btnDel.onclick = (function (r) {
                            return function () { crm_casdata_delete(r.id, module_code, module_id) }
                        })(rows[i])
                        tdAct.appendChild(btnDel)
                        tr.appendChild(tdInfo)
                        tr.appendChild(tdAct)
                        table.appendChild(tr)
                    }
                    casdataContainer.appendChild(table)
                    if (casdataCard) casdataCard.style.display = '';
                }
            } else {
                launch_toast("Error loading CAS data", 2)
            }
        }
    })
}
function crm_casdata_delete(cas_id, module_code, module_id) {
    showModal('Remove this reference?',
        function onOk() {
            const userid = document.getElementById('UsuarioID') ? document.getElementById('UsuarioID').value : '';
            $.ajax({
                url: '/crm_casdata_delete',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ cas_id: cas_id, module_code: module_code, module_id: module_id, userid: userid }),
                dataType: 'json',
                success: function (response) {
                    if (response.result == 1) {
                        crm_get_casdata(module_code, module_id);
                    } else { launch_toast('Error removing reference', 2); }
                },
                error: function () { launch_toast('Error removing reference', 2); }
            });
        },
        function onCancel() { /* Cancelled, do nothing */ }
    )
}
function crm_getusuarios(searchName = '') {
    let cdepartamento = document.getElementById("departamentos").value
    $.ajax({
        url: '/crm_getusuarios',
        data: JSON.stringify({
            cdepartamento: cdepartamento,
            searchName: searchName
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            usuarios = response.usuarios
            assign_user = document.getElementById("assign_user")

            // Clear previous content
            while (assign_user.firstChild) {
                assign_user.removeChild(assign_user.firstChild);
            }

            dep = ''
            if (titulo == "CRM | Active Re" || titulo == "CRM Assigned | Active Re") {
                for (let index = 0; index < usuarios.length; index++) {
                    // Add department header if new department
                    if (dep != usuarios[index].xdepartamento) {
                        dep = usuarios[index].xdepartamento
                        h = document.createElement("h6")
                        h.innerHTML = dep
                        h.setAttribute("style", "padding-top: 0.25rem; margin-top: 10px;")
                        assign_user.appendChild(h)
                    }

                    // Create user item
                    div = document.createElement("div")
                    div.classList = "d-flex mb-2"

                    img = document.createElement("img")
                    img.src = "pic/" + usuarios[index].userid + ".png"
                    img.className = "profile_pic"
                    img.id = usuarios[index].userid
                    img.setAttribute("onclick", "crm_check('" + usuarios[index].userid + "', '" + dep + "')")
                    img.setAttribute("style", "cursor: pointer;")

                    p = document.createElement("p")
                    p.innerHTML = usuarios[index].Name
                    p.setAttribute("onclick", "crm_check('" + usuarios[index].userid + "', '" + dep + "')")
                    p.setAttribute("style", "padding-left: 0.5rem; cursor: pointer; margin: 0;")

                    checkbox = document.createElement("input")
                    checkbox.setAttribute("type", "checkbox")
                    checkbox.value = 1
                    checkbox.classList = "crm_checkbox"
                    checkbox.id = "crm_checkbox_" + usuarios[index].userid
                    checkbox.setAttribute("onclick", "newcase_user('" + usuarios[index].userid + "', newcase_asignados)")
                    checkbox.style.marginLeft = "auto"

                    div.appendChild(img)
                    div.appendChild(p)
                    div.appendChild(checkbox)
                    assign_user.appendChild(div)
                }
            }
            if (titulo == "CRM - Detail | Active Re") {
                select = document.createElement("select")
                select.className = "form-control"
                select.id = "crm_select_asignar"
                option = document.createElement("option")
                option.value = '---'
                option.innerHTML = '---'
                select.appendChild(option)
                for (let index = 0; index < usuarios.length; index++) {
                    option = document.createElement("option")
                    option.value = usuarios[index].userid
                    option.innerHTML = usuarios[index].Name
                    if (dep != usuarios[index].xdepartamento) {
                        dep = usuarios[index].xdepartamento
                        optgroup = document.createElement("optgroup")
                        optgroup.label = dep
                    }
                    optgroup.appendChild(option)
                    select.appendChild(optgroup)
                }
                assign_user.appendChild(select)
            }
        }
    })
}

// Debounce function to avoid too many requests
let searchTimeout = null;

function searchCrmUsers() {
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // Set new timeout
    searchTimeout = setTimeout(function () {
        const searchInput = document.getElementById("crm_user_search");
        if (!searchInput) {
            return;
        }

        const searchValue = searchInput.value.trim();

        // Call crm_getusuarios with search parameter
        crm_getusuarios(searchValue);
    }, 300); // Wait 300ms after user stops typing
}
function crm_check(id, dep) {
    checkbox = document.getElementById("crm_checkbox_" + id)
    if (checkbox.checked) {
        checkbox.checked = false
    } else {
        checkbox.checked = true
    }
    if (titulo == "CRM | Active Re" || titulo == "CRM Assigned | Active Re") {
        newcase_user(id, newcase_asignados, dep)
    }
}
function newcase_user(userid, campo, dep = '') {
    if (campo.value == '') {
        temp = ";"
    } else {
        temp = campo.value
    }
    if (temp.includes(userid)) {
        campo.value = temp.replace(userid + ';', '')
        // document.getElementById("crm_" + dep + "_div").remove()
        // campos_new_case = campos_new_case.filter(function (e) { return e !== "crm_" + dep }) // Deprecated
        try {
            document.getElementById("newcase_profilepics_" + userid).remove()
        } catch (error) {
            console.log(error)
        }
    }
    else {
        campo.value = temp + userid + ";"
        img = document.createElement("img")
        img.src = "pic/" + userid + ".png"
        img.className = "profile_pic icon"
        img.id = "newcase_profilepics_" + userid
        img.title = userid
        img.setAttribute("onclick", "crm_check('" + userid + "', '" + dep + "')")
        img.setAttribute("style", "margin-right: 5px;")
        img.setAttribute("title", "Remove")
        newcase_profilepics.appendChild(img)
        if (dep != '') {
            // update_newcase(dep)
        }
    }
}
function update_newcase(dep) {
    //Add state fields based on the user's selection
    deps = []
    for (let index = 0; index < crm_estados.children.length; index++) {
        deps.push(crm_estados.children[index].tag_dep)
    }
    if (!deps.includes(dep)) {
        div = document.createElement("div")
        div.classList.add("col-md-6")
        div.setAttribute("tag_dep", "dep")
        div.id = "crm_" + dep + "_div"
        h = document.createElement("h5")
        h.innerHTML = dep + " Status"
        select = document.createElement("select")
        select.id = "crm_" + dep
        select.classList.add("form-control")
        div.appendChild(h)
        div.appendChild(select)
        crm_estados.appendChild(div)
        crm_get_estados(dep)
    }
}
function crm_addnewcase() {
    // Sync asignados from display chips into the hidden input before validating
    if (typeof syncAssignedFromDom === 'function') syncAssignedFromDom();

    const missingFields = [];
    let isValid = true;

    // Subject
    const subjectEl = document.getElementById('subject');
    if (!subjectEl || !subjectEl.value.trim()) {
        isValid = false;
        if (subjectEl) subjectEl.classList.add('error');
        missingFields.push('Subject');
    } else {
        subjectEl.classList.remove('error');
    }

    // Case Type — floating-ct-select exposes its own validation API
    if (typeof window.validateCtSelect_intern_subject === 'function') {
        if (!window.validateCtSelect_intern_subject()) {
            isValid = false;
            missingFields.push('Case Type');
        }
    } else {
        const ctEl = document.getElementById('intern_subject');
        if (!ctEl || !ctEl.value.trim()) {
            isValid = false;
            missingFields.push('Case Type');
        }
    }

    // Description
    const descEl = document.getElementById('description');
    const descText = descEl ? (descEl.textContent || '').trim() : '';
    if (!descEl || !descText) {
        isValid = false;
        if (descEl) descEl.classList.add('error');
        missingFields.push('Description');
    } else {
        descEl.classList.remove('error');
    }

    // Importance
    const importanciaEl = document.getElementById('importancia');
    if (!importanciaEl || importanciaEl.value === '') {
        isValid = false;
        if (importanciaEl) importanciaEl.classList.add('error');
        missingFields.push('Importance');
    } else {
        if (importanciaEl) importanciaEl.classList.remove('error');
    }

    // Asignados
    const newcase_asignados = document.getElementById('newcase_asignados');
    if (!newcase_asignados || !newcase_asignados.value || newcase_asignados.value === ';') {
        isValid = false;
        missingFields.push('Assign - Active Re Collaborator');
    }

    if (!isValid) {
        var fieldList = '<ul style="margin:8px 0 0 0;padding-left:20px;text-align:left">' +
            missingFields.map(function(f) { return '<li>' + f + '</li>'; }).join('') +
            '</ul>';
        showModal(
            'Please complete the following required fields:' + fieldList,
            null,
            null,
            { title: 'Required Fields', okText: 'OK', cancelText: 'Close', type: 'warning' }
        );
        return;
    }

    var submitBtn = document.getElementById("submitCRMNewCase");
    var originalText = submitBtn.innerHTML;
    // Disable the button
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.6";
    submitBtn.style.cursor = "not-allowed";
    var originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="fa fa-spinner fa-spin"></span> Sending...';

    var data = new FormData();
    data.append('conversacion_titulo', document.getElementById("subject").value.trim());
    data.append('asunto_interno', document.getElementById("intern_subject").value.trim());
    data.append('asignados', document.getElementById("newcase_asignados").value);
    data.append('description', (document.getElementById("description_html") || document.getElementById("description")).value.trim());
    data.append('cprioridad', document.getElementById("importancia").value);
    data.append('departamento_id', document.getElementById("cdepartamento").value);
    data.append('UserID', document.getElementById("code").value);
    var startDateEl = document.getElementById("start_date");
    if (startDateEl && startDateEl.value) data.append('finicio', startDateEl.value);
    var brEl = document.getElementById("business_relationship");
    if (brEl && brEl.value) data.append('business_relationship', brEl.value);

    // Agregar archivos
    var files = document.getElementById("files").files;
    for (let i = 0; i < files.length; i++) {
        data.append('Supportfiles', files[i]);
    }

    $.ajax({
        url: '/crm_create_new_case',
        data: data,
        type: 'POST',
        enctype: 'multipart/form-data',
        dataType: "json",
        processData: false, // tell jQuery not to process the data
        contentType: false, // tell jQuery not to set contentType
        success: function (response) {
            if (response && (response.result === 1 || response.success === true)) {
                launch_toast("Case created successfully", 1)

                if (response.caseData) {
                    var table_main = document.getElementById("MainTable");
                    var tbody = table_main ? table_main.querySelector('tbody') : null;
                    if (!tbody) {
                        tbody = document.createElement('tbody');
                        table_main.appendChild(tbody);
                    }
                    var noDataRow = tbody.querySelector('td[colspan]');
                    if (noDataRow && noDataRow.textContent.trim() === 'No data found') {
                        noDataRow.closest('tr').remove();
                    }

                    var c = response.caseData;
                    var tr = document.createElement('tr');
                    tr.setAttribute('onclick', 'CRM_url(' + c.id + ')');
                    tr.style.cursor = 'pointer';

                    var td = document.createElement('td');
                    td.innerHTML = c.id;
                    td.style.textAlign = 'center';
                    td.className = 'text-decoration-underline';
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.style.textAlign = 'center';
                    var svg = document.createElement('img');
                    svg.src = 'img/prioridad_' + c.xprioridad + '.svg';
                    svg.id = 'prioridad_' + c.xprioridad;
                    svg.title = c.xprioridad;
                    svg.style.width = '12px';
                    svg.style.height = '12px';
                    td.appendChild(svg);
                    var pp = document.createElement('p');
                    pp.innerHTML = c.xprioridad;
                    pp.className = 'Not';
                    td.appendChild(pp);
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.innerHTML = c.asunto_interno || '---';
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.innerHTML = c.conversacion_titulo ? c.conversacion_titulo.slice(0, 125) : '';
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.style.textAlign = 'center';
                    var fechaFinDate = c.fecha_fin ? new Date(c.fecha_fin) : null;
                    td.innerHTML = c.fecha_fin || '---';
                    if (fechaFinDate && new Date() > fechaFinDate && c.xestado !== 'Closed') {
                        td.className = 'text-danger fw-bold';
                    }
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.style.textAlign = 'center';
                    td.innerHTML = c.fecha_modificado || c.fecha_ingreso || '---';
                    tr.appendChild(td);

                    td = document.createElement('td');
                    var div = document.createElement('div');
                    div.id = c.id + '_asignado';
                    div.style.display = 'flex';
                    div.style.alignItems = 'center';
                    div.style.flexWrap = 'wrap';
                    var pa = document.createElement('p');
                    if (c.user_asig) {
                        pa.className = 'Not';
                        pa.innerHTML = c.user_asig;
                        var div_img = document.createElement('div');
                        div_img.style.display = 'flex';
                        div_img.style.alignItems = 'center';
                        var asignadosList = c.user_asig.split(';');
                        for (var e = 0; e < asignadosList.length; e++) {
                            var img = document.createElement('img');
                            img.src = 'pic/' + asignadosList[e].trim() + '.png';
                            img.className = 'profile_pic';
                            img.title = asignadosList[e].trim();
                            img.onerror = function () { this.src = 'pic/default.png'; };
                            div_img.appendChild(img);
                        }
                        div.appendChild(div_img);
                    } else {
                        pa.innerHTML = '---';
                        pa.style.margin = '0';
                    }
                    div.appendChild(pa);
                    td.appendChild(div);
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.style.textAlign = 'center';
                    var statusSpan = document.createElement('span');
                    statusSpan.style.borderRadius = '10px';
                    statusSpan.style.padding = '4px 8px';
                    statusSpan.style.color = 'white';
                    statusSpan.style.fontSize = '10px';
                    statusSpan.style.display = 'inline-block';
                    statusSpan.innerHTML = c.xestado;
                    if (c.xestado === 'Closed' || c.xestado === 'Duplicate') {
                        statusSpan.style.backgroundColor = '#00586f';
                    } else if (c.xestado === 'Not started') {
                        statusSpan.style.backgroundColor = '#35addcff';
                    } else {
                        statusSpan.style.backgroundColor = '#ffc107';
                    }
                    td.appendChild(statusSpan);
                    tr.appendChild(td);

                    td = document.createElement('td');
                    var ownerDiv = document.createElement('div');
                    if (!c.de_nombre) {
                        td.innerHTML = '---';
                    } else {
                        var ownerName = c.de_nombre;
                        var displayName;
                        if (typeof ownerName === 'string' && ownerName.includes('@')) {
                            displayName = ownerName.split('@')[0];
                        } else if (ownerName.includes(' ')) {
                            var parts = ownerName.split(/\s+/);
                            displayName = parts[0][0].toLowerCase() + parts[1].toLowerCase();
                        } else {
                            displayName = ownerName;
                        }
                        var divImg = document.createElement('div');
                        divImg.style.display = 'flex';
                        divImg.style.alignItems = 'center';
                        var ownerImg = document.createElement('img');
                        ownerImg.src = 'pic/' + displayName + '.png';
                        ownerImg.className = 'profile_pic';
                        ownerImg.title = ownerName;
                        ownerImg.onerror = function () { this.src = 'pic/default.png'; };
                        divImg.appendChild(ownerImg);
                        ownerDiv.appendChild(divImg);
                        td.appendChild(ownerDiv);
                    }
                    tr.appendChild(td);

                    td = document.createElement('td');
                    td.style.textAlign = 'center';
                    td.className = 'info-tooltip';
                    var infoIcon = document.createElement('i');
                    infoIcon.className = 'fas fa-info-circle';
                    infoIcon.style.color = '#00586f';
                    infoIcon.style.fontSize = '16px';
                    infoIcon.style.cursor = 'pointer';
                    var tooltipContent = document.createElement('div');
                    tooltipContent.className = 'tooltip-content';
                    var createdLabel = document.createElement('div');
                    createdLabel.innerHTML = '<span class="tooltip-label">Created:</span> ' + (c.fecha_ingreso || '---');
                    createdLabel.style.marginBottom = '5px';
                    var updatedLabel = document.createElement('div');
                    updatedLabel.innerHTML = '<span class="tooltip-label">Last Update:</span> ' + (c.fecha_modificado || 'N/A');
                    updatedLabel.style.marginBottom = '5px';
                    var ownerTooltipLabel = document.createElement('div');
                    ownerTooltipLabel.innerHTML = '<span class="tooltip-label">Owner:</span> ' + (c.de_nombre || '---');
                    ownerTooltipLabel.style.marginBottom = '5px';
                    tooltipContent.appendChild(createdLabel);
                    tooltipContent.appendChild(updatedLabel);
                    tooltipContent.appendChild(ownerTooltipLabel);
                    td.appendChild(infoIcon);
                    td.appendChild(tooltipContent);
                    tr.appendChild(td);

                    tbody.insertBefore(tr, tbody.firstChild);
                    totalCount = (totalCount || 0) + 1;
                    renderPagination(totalCount);
                }

                crm_reset_newcase_form();
                document.getElementById('crm_newcase').classList.remove('mostrar');
                document.getElementById('hidenewcase').classList.add('Not');
            } else {
                var msg = (response && (response.message || response.error)) ? (response.message || response.error) : "Error creating case";
                launch_toast(msg, 2)
                // Re-enable the button in case of an error
                submitBtn.disabled = false;
                submitBtn.style.opacity = "1";
                submitBtn.style.cursor = "pointer";
                submitBtn.innerHTML = originalText;

            }
        },
        error: function (xhr, status, err) {
            var message = "Error creating case";
            try {
                var res = xhr && xhr.responseJSON ? xhr.responseJSON : null;
                if (res && (res.message || res.error)) { message = res.message || res.error; }
            } catch (e) { }
            launch_toast(message, 2)
            // Re-enable the button in case of an error
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
            submitBtn.style.cursor = "pointer";
            submitBtn.innerHTML = originalText;
        }
    })
}

function crm_reset_newcase_form() {
    // Limpiar campos de texto
    const subject = document.getElementById("subject");
    const internSubject = document.getElementById("intern_subject");
    const description = document.getElementById("description");
    const importancia = document.getElementById("importancia");
    const newcaseAsignados = document.getElementById("newcase_asignados");

    if (subject) {
        subject.value = '';
        subject.classList.remove('valid', 'error', 'has-value');
        if (window.clearInputError_subject) window.clearInputError_subject();
    }

    if (internSubject) {
        internSubject.value = '';
        internSubject.classList.remove('valid', 'error', 'has-value');
        // Reset floating-ct-select visual state (hidden input is #intern_subject;
        // the display div must be cleared separately)
        var ctDisplay = document.getElementById('intern_subject_display');
        if (ctDisplay) ctDisplay.classList.remove('has-value', 'valid', 'error');
        var ctSelected = document.getElementById('intern_subject_selected');
        if (ctSelected) { ctSelected.textContent = ''; ctSelected.style.display = 'none'; }
        var ctPlaceholder = document.getElementById('intern_subject_placeholder');
        if (ctPlaceholder) ctPlaceholder.style.display = '';
        var ctClear = document.getElementById('intern_subject_clear');
        if (ctClear) ctClear.style.display = 'none';
        var internSubjectLabel = document.getElementById('intern_subject_label');
        if (internSubjectLabel) internSubjectLabel.value = '';
        if (window.clearCtSelectError_intern_subject) window.clearCtSelectError_intern_subject();
    }

    if (description) {
        description.innerHTML = '';
        description.classList.remove('valid', 'error', 'has-value');
        var descHidden = document.getElementById('description_html');
        if (descHidden) descHidden.value = '';
        if (window.clearInputError_description) window.clearInputError_description();
    }

    if (importancia) {
        importancia.selectedIndex = 0;
        importancia.classList.remove('valid', 'error', 'has-value');
        if (window.clearSelectError_importancia) window.clearSelectError_importancia();
    }

    if (newcaseAsignados) {
        newcaseAsignados.value = '';
        // Also clear the floating-users chips so the display matches the reset state
        var fuDisplay = document.querySelector('.floating-users-display[data-name="crm_asignados"]');
        if (fuDisplay) {
            fuDisplay.querySelectorAll('input[type="hidden"]').forEach(function(i) { i.remove(); });
            if (typeof updateFloatingMultiselectDisplay === 'function') {
                updateFloatingMultiselectDisplay('crm_asignados');
            }
        }
    }

    // Limpiar start date
    const startDate = document.getElementById("start_date");
    if (startDate) { startDate.value = ''; startDate.classList.remove('valid', 'error', 'has-value'); }

    // Limpiar lista de usuarios asignados
    const profilePics = document.getElementById("newcase_profilepics");
    if (profilePics) {
        const images = profilePics.querySelectorAll('img:not(.icon)');
        images.forEach(img => img.remove());
    }

    // Re-habilitar botones
    const submitBtn = document.getElementById("submitCRMNewCase");
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
    }
    const submitMsgBtn = document.getElementById("submitCRMNewMSGCase");
    if (submitMsgBtn) {
        submitMsgBtn.disabled = false;
        submitMsgBtn.style.opacity = "1";
        submitMsgBtn.style.cursor = "pointer";
        submitMsgBtn.innerHTML = "Submit";
    }
}

function SearchUserNewCase() {
    // var input, filter, table, tr, td, i, txtValue;
    filter = crm_user_search.value.toUpperCase();
    filas = assign_user.getElementsByTagName("div");
    e = 0;
    for (i = 0; i < filas.length; i++) {
        var find = false;
        td = filas[i].children
        for (a = 0; a < td.length; a++) {
            txtValue = td[a].textContent || td[a].innerText || td[a].id;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                find = true
            }
        }
        if (find) {
            filas[i].style.display = "";
            e++;
        } else {
            filas[i].style.display = "none";
        }
    }
}

function crm_add_estado() {
    cdepartamento = departamentos.value
    xnombre = nombre.value
    ctype = proceso.value
    ndias = dias.value
    $.ajax({
        url: '/crm_add_estado',
        data: JSON.stringify({
            cdepartamento,
            xnombre,
            ctype,
            ndias
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                launch_toast("Status added successfully", 1)
            } else if (response.result == 2) {
                launch_toast("Status already exists ", 2)
            } else {
                launch_toast("Error adding new status", 2)
            }
        }
    })
}
function crm_get_msg(crm_id) {
    cdepartamento = departamentos.value
    xnombre = nombre.value
    ctype = proceso.value
    ndias = dias.value
    $.ajax({
        url: '/crm_add_estado',
        data: JSON.stringify({
            cdepartamento,
            xnombre,
            ctype,
            ndias
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                launch_toast("Status added successfully", 1)
            } else if (response.result == 2) {
                launch_toast("Status already exists ", 2)
            } else {
                launch_toast("Error adding new status", 2)
            }
        }
    })
}

// Pagination functions
function renderPagination(totalRows) {
    const rowsPerPage = parseInt(document.getElementById("SelectBoxPages")?.value || 15);
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const currentPageText = document.querySelector('#totalCount');
    const formattedTotalRows = totalRows.toLocaleString('en-US');
    if (currentPageText) {
        currentPageText.textContent = `Current Page ${currentPage} of ${totalPages} for ${formattedTotalRows} records`;
    }

    const paginationContainer = document.querySelector('.fb-pagination');
    if (paginationContainer) {
        const prevButton = paginationContainer.querySelector('.fb-page-btn:first-child');
        if (prevButton) {
            if (currentPage === 1) {
                prevButton.classList.add('disabled');
            } else {
                prevButton.classList.remove('disabled');
            }
        }

        const nextButton = paginationContainer.querySelector('.fb-page-btn:last-child');
        if (nextButton) {
            if (currentPage === totalPages || totalPages === 0) {
                nextButton.classList.add('disabled');
            } else {
                nextButton.classList.remove('disabled');
            }
        }
    }
}

function changePage(pageNumber) {
  const rowsPerPage = parseInt(document.getElementById("SelectBoxPages")?.value || 15);
  const totalPages = Math.ceil(totalCount / rowsPerPage);
  if (pageNumber < 1 || pageNumber > totalPages) { return; }

  currentPage = pageNumber;
  saveCrmMainFilters();
  load_main();
}


function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedLoadMain = debounce(load_main, 800);

function SearchTable() {
    currentPage = 1;
    saveCrmMainFilters();
    debouncedLoadMain();
}

function downloadExcel(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }

    const departamentos = document.getElementById('departamentos')?.value || '';
    const status = document.getElementById('SelectBoxStatus')?.value || '';
    const asigned = Number(document.getElementById('crm_filtro_asgined')?.value || 0);
    const userid = document.getElementById('UsuarioID')?.value || '';
    const search = document.getElementById('SearchBox')?.value?.trim() || '';
    const priority = document.getElementById('SelectBoxPriority')?.value || '';
    const assigned_users = document.getElementById('filter_asignados_value')?.value?.trim() || '';

    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key') || '';

    const datatoSend = {
        departamentos,
        status,
        asigned,
        userid,
        search,
        priority,
        key,
        assigned_users,
        type: 'excel'
    };

    const date = new Date().toISOString();
    $.ajax({
        url: '/crm_download_excel',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            data: datatoSend,
            type: 'excel'
        }),
        xhrFields: { responseType: 'blob' },
        success: function (response) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(response);
            link.download = 'crm-' + date + '.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        },
        error: function () {
            launch_toast('Error generating the Excel file.', 2);
        }
    });
}

function getCrmMainFilterEls() {
    return {
    priorityEl: document.getElementById("SelectBoxPriority"),
    statusEl: document.getElementById("SelectBoxStatus"),
    searchEl: document.getElementById("SearchBox"),
    limitEl: document.getElementById("SelectBoxPages"),
    assignedUsersEl: document.getElementById("filter_asignados_value"),
    globalStatusEl: document.getElementById("SelectBoxGlobalStatus")
    };
}

function saveCrmMainFilters() {
    const { priorityEl, statusEl, searchEl, limitEl, assignedUsersEl, globalStatusEl } = getCrmMainFilterEls();
    const payload = {
    priority:       priorityEl ? priorityEl.value : "",
    status:         statusEl ? statusEl.value : "",
    search:         searchEl ? (searchEl.value ?? "") : "",
    limit:          limitEl ? limitEl.value : "15",
    page:           (typeof currentPage !== 'undefined' ? currentPage : 1),
    assigned_users: assignedUsersEl ? assignedUsersEl.value : "",
    global_status:  globalStatusEl ? globalStatusEl.value : "",
    };
    localStorage.setItem(CRM_MAIN_FILTERS_KEY, JSON.stringify(payload));
}

function loadCrmMainFilters() {
    const raw = localStorage.getItem(CRM_MAIN_FILTERS_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const { priorityEl, statusEl, searchEl, limitEl, assignedUsersEl, globalStatusEl } = getCrmMainFilterEls();

    if (priorityEl)      priorityEl.value      = data.priority ?? "";
    if (statusEl)        statusEl.value        = data.status ?? "";
    if (searchEl)        searchEl.value        = data.search ?? "";
    if (limitEl)         limitEl.value         = data.limit ?? "15";
    if (globalStatusEl)  globalStatusEl.value  = data.global_status ?? "";

    if (typeof currentPage !== 'undefined' && Number.isFinite(data.page)) {
    currentPage = parseInt(data.page, 10) || 1;
    }

    // Restore assigned users filter
    if (data.assigned_users && typeof selectFloatingFilterOption === 'function') {
        const users = data.assigned_users.split(';').filter(Boolean);
        users.forEach(function(u) {
            selectFloatingFilterOption('filter_asignados', u);
        });
    }

    return data;
}

// Limpia la persistencia (para Reset Filters)
function removeKeyParam() {
    var url = new URL(window.location.href);
    if (url.searchParams.has('key')) {
        url.searchParams.delete('key');
        window.history.replaceState({}, '', url.toString());
    }
}
function clearCrmMainFilters() {
    localStorage.removeItem(CRM_MAIN_FILTERS_KEY);
}
function resetFilters() {
    document.getElementById("SelectBoxPriority").value = "";
    document.getElementById("SelectBoxStatus").value = "";
    document.getElementById("SelectBoxGlobalStatus").value = "";
    document.getElementById("SearchBox").value = "";
    document.getElementById("SelectBoxPages").value = "15";
    document.getElementById("crm_filtro_asgined").value = "0";
    currentPage = 1;
    // Clear assignee filter chips
    var filterHidden = document.getElementById("filter_asignados_value");
    if (filterHidden) filterHidden.value = "";
    var filterDisplay = document.querySelector('.floating-users-filter-display[data-name="filter_asignados"]');
    if (filterDisplay) {
        filterDisplay.querySelectorAll('input[type="hidden"]').forEach(function(i) { i.remove(); });
        if (typeof updateFloatingFilterDisplay === 'function') {
            updateFloatingFilterDisplay('filter_asignados');
        }
    }
    clearCrmMainFilters();
    removeKeyParam();
    load_main();
}


$(document).ready(function () {
    // 
    //Load Pages
    titulo = document.title
    prioridad = 1

    if (titulo == "Dashboard | Active Re") {
    }
    if (titulo == "CRM | Active Re") {
        (function attachCrmMainFilterAutoSave() {
            const filterEls = [
                document.getElementById("SelectBoxPriority"),
                document.getElementById("SelectBoxStatus"),
                document.getElementById("SelectBoxGlobalStatus"),
                document.getElementById("SelectBoxPages"),
            ].filter(Boolean);

            // Guardar cuando cambian
            filterEls.forEach(el => {
                el.addEventListener("change", () => {
                    currentPage = 1;
                    saveCrmMainFilters();
                });
            });

            // SearchBox — save on every keystroke
            const searchEl = document.getElementById("SearchBox");
            if (searchEl) {
                searchEl.addEventListener("keyup", () => {
                    currentPage = 1;
                    saveCrmMainFilters();
                });
            }

            // Assigned users filter — save on change via MutationObserver
            const assignedDisplay = document.querySelector('.floating-users-filter-display[data-name="filter_asignados"]');
            if (assignedDisplay) {
                const obs = new MutationObserver(function() {
                    currentPage = 1;
                    saveCrmMainFilters();
                });
                obs.observe(assignedDisplay, { childList: true, subtree: true });
            }
        })();

        // --- Finalmente cargar datos ---
        try { loadCrmMainFilters(); } catch(e) { console.warn('loadCrmMainFilters failed:', e); }
        window._crmStatusAtLoad = document.getElementById("SelectBoxStatus")?.value || '';
        load_main();
        $("#crm_sort").click(function (e) {
            if (prioridad == 1)
                prioridad = 2
            else
                prioridad = 1
            load_main(1, '', prioridad)
        })
        crm_getusuarios()
    }
    if (titulo == "CRM Assigned | Active Re") {
        
        loadCrmMainFilters();
        document.getElementById("crm_filtro_asgined").value = 1
        load_main('user_asig', UsuarioID.value)
        crm_getusuarios()
        $("#crm_sort").click(function (e) {
            if (prioridad == 1)
                prioridad = 2
            else
                prioridad = 1
            load_main('user_asig', UsuarioID.value, prioridad)
        })
    }
    if (titulo == "CRM - Detail | Active Re") {
        crm_id = document.getElementById("crm_id").value
        crm_get_case(crm_id)
        crm_case_details(crm_id)
        crm_get_sirdata(crm_id)
        // crm_get_msg(crm_id)
        try {
            $('#start_date_input').off('change').on('change', update_start_date)
            $('#due_date_input').off('change').on('change', update_due_date)
            $('#save_business_relationship_btn').off('click').on('click', update_business_relationship)
        } catch (e) { console.log(e) }

        // Wire floating-users (crm_asignados_fu) to AJAX add/remove endpoints
        ;(function() {
            var _origSelect = window.selectFloatingMultiselectOption
            var _origRemove = window.removeFloatingMultiselectChip

            window.selectFloatingMultiselectOption = function(name, value) {
                if (name === 'crm_asignados_fu') {
                    var crm_id = document.getElementById('crm_id')?.value
                    if (!crm_id) return
                    $.ajax({
                        url: '/crm_add_asignado',
                        data: JSON.stringify({ user: value, crm_id }),
                        type: 'POST',
                        contentType: 'application/json',
                        success: function(response) {
                            if (response.result == 1) {
                                var users = response.users[0]
                                crm_msg_insert(crm_id, users.cdepartamento, users.xdepartamento, 'Add user',
                                     ' added user "' + users.Name + '".')
                                crm_get_case(crm_id)
                                launch_toast('User "' + users.Name + '" added successfully', 1)
                            } else {
                                launch_toast('Error adding user', 2)
                            }
                        },
                        error: function() { launch_toast('Error adding user', 2) }
                    })
                } else {
                    if (typeof _origSelect === 'function') _origSelect(name, value)
                }
            }

            window.removeFloatingMultiselectChip = function(name, value) {
                if (name === 'crm_asignados_fu') {
                    var crm_id = document.getElementById('crm_id')?.value
                    if (!crm_id) return
                    $.ajax({
                        url: '/crm_remove_user',
                        data: JSON.stringify({ u_asignado: value, crm_id }),
                        type: 'POST',
                        contentType: 'application/json',
                        success: function(response) {
                            if (response.result == 1) {
                                var users = response.users[0]
                                crm_msg_insert(crm_id, users.cdepartamento, users.nombre, 'Remove user',
                                    users.nombre + ' removed user "' + users.Name + '".')
                                crm_get_case(crm_id)
                            } else if (response.result == 2) {
                                showCrmDepartmentRequiredModal()
                            } else {
                                launch_toast('Error removing user', 2)
                            }
                        },
                        error: function() { launch_toast('Error removing user', 2) }
                    })
                } else {
                    if (typeof _origRemove === 'function') _origRemove(name, value)
                }
            }
        })()
    }
    if (titulo.includes("CRM - Tools")) {
        fill_selects("tools_get_companias", "companias")
    }
    // 
    // Funciones de clic
    $("#addisirdata").click(function (e) {
        crm_show_sirdata()
    })
    
    // Manejar cambio en el selector de tipo de referencia
    $(".reference-type-selector").change(function (e) {
        const selectedType = $(this).val();
        const divReference = document.getElementById('div_reference');
        
        // Limpiar el contenido previo
        divReference.innerHTML = '';
        
        if (selectedType === 'approval') {
            // Abrir modal de approvals (funcionalidad existente)
            if (typeof openApprovalModal === 'function') {
                openApprovalModal();
            }
            // Resetear el select
            $(this).val('');
        } else if (selectedType === 'crm') {
            // Abrir modal de CRMs (funcionalidad existente)
            if (typeof openCrmCrmModal === 'function') {
                openCrmCrmModal();
            }
            // Resetear el select
            $(this).val('');
        } else if (selectedType === 'sir') {
            // Mostrar formulario de SIR en div_reference
            crm_show_sirdata('div_reference');
            // Reset the dropdown after the form is submitted
            $(this).val('');
        } else if (selectedType === 'cas') {
            // Mostrar formulario de CAS en div_reference
            crm_show_casdata('div_reference');
            $(this).val('');
        }
    })
    //
    //New case
    $("#opennewcase, #closenewcase, #hidenewcase").click(function (e) {
        crm_newcase.classList.toggle("mostrar");
        hidenewcase.classList.toggle("Not");

        // Resetear el formulario cuando se cierra
        if (!crm_newcase.classList.contains("mostrar")) {
            crm_reset_newcase_form();
        }
    })
    $("#newcase_adduser, #hidenewcase_adduser").click(function (e) {
        mini_popup_user_list.classList.toggle("Not")
        hidenewcase_adduser.classList.toggle("Not");
    })
    $("#submitCRMNewCase").click(function (e) {
        crm_addnewcase()
        // for (let index = 0; index < campos_new_case.length; index++) {
        //     temp.push(document.getElementById(campos_new_case[index]))
        // Deprecated: now using centralized validation
        // }

    })
    $("#submitCRMNewMSGCase").click(function (e) {
        e.preventDefault()
        form_crm_new_msg()
    })
    // Tools
    $("#submitEstados").click(function (e) {
        crm_add_estado()
    })
    if ($("#badaco_contact").length && $("#badaco_informacion_contacto").length) {
        const toggleBadacoInfo = () => {
            const contacto = $("#badaco_contact").val();
            if (contacto === "new") {
                $("#badaco_informacion_contacto").attr("class", "row");
            } else {
                $("#badaco_informacion_contacto").attr("class", "row Not");
            }
        };
        $("#badaco_contact").on("change", toggleBadacoInfo);
        toggleBadacoInfo();
    }
    $("#crm_show_completeted").click(function (e) {
        load_main()
    })
})
