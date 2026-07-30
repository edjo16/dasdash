// Reusable modal mixin
// Usage: showModal(message, onOk, onCancel, options)
// options: { title, okText, cancelText, type: 'danger'|'warning'|'info' }
function showModal(message, onOk, onCancel, options) {
    const opts = options || {};
    const title     = opts.title      || 'Confirm';
    const okText    = opts.okText     || 'OK';
    const cancelText= opts.cancelText || 'Cancel';
    const type      = opts.type       || 'info';

    const iconMap = {
      danger:  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e67e22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info:    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00586f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const okColorMap = { danger: '#dc3545', warning: '#e67e22', info: '#00586f' };
    const okColor = okColorMap[type] || '#00586f';

    const modal = document.createElement('div');
    modal.className = 'modal-mixin';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-icon">${iconMap[type] || iconMap.info}</div>
            <div class="modal-title">${title}</div>
            <div class="modal-message">${message}</div>
            <div class="modal-actions">
                <button class="modal-btn-cancel">${cancelText}</button>
                <button class="modal-btn-ok" style="background:${okColor}">${okText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    function destroy() { if (modal.parentNode) modal.parentNode.removeChild(modal); }

    modal.querySelector('.modal-btn-ok').onclick = function() { destroy(); if (onOk) onOk(); };
    modal.querySelector('.modal-btn-cancel').onclick = function() { destroy(); if (onCancel) onCancel(); };
    modal.querySelector('.modal-overlay').onclick = function() { destroy(); if (onCancel) onCancel(); };
}
