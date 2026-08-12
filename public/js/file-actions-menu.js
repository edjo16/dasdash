/* ═══════════════════════════════════════════════════════════
   File actions menu
   -----------------------------------------------------------
   Menu desplegable de acciones para una fila de archivo. Sustituye
   a la hilera de iconos que tenian APPROVALS y CRM: la fila queda
   con la accion mas frecuente (abrir) y un boton de opciones que
   agrupa el resto.

   Es agnostico del modulo: recibe una lista de acciones y las pinta.

     FileActionsMenu.create([
       { icon: 'fa-download', label: 'Download', href: '/x?dl=1' },
       { separator: true },
       { icon: 'fa-language', label: 'Translate...', onClick: fn },
       { icon: 'fa-eye', label: 'Translations', badge: '2', onClick: fn },
       { icon: 'fa-magic', label: 'Summarize with AI', onClick: fn,
         disabled: true, disabledReason: 'Only PDF and Word files' }
     ], { ariaLabel: 'Actions for contrato.pdf' })

   Devuelve el boton listo para insertar en el DOM.

   El panel se ancla en <body> con position:fixed en lugar de dentro
   de la fila: las listas de archivos viven en contenedores con
   overflow, y un menu anidado quedaria recortado.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var openMenu = null;   // { panel, button } del menu abierto, si hay alguno
  var listenersReady = false;

  function closeOpenMenu() {
    if (!openMenu) return;
    openMenu.panel.remove();
    openMenu.button.setAttribute('aria-expanded', 'false');
    openMenu.button.classList.remove('fam-btn--active');
    openMenu = null;
  }

  /**
   * Un unico juego de listeners globales para todos los menus de la pagina.
   * Se registran la primera vez que se crea un menu.
   */
  function ensureGlobalListeners() {
    if (listenersReady) return;
    listenersReady = true;

    document.addEventListener('click', function (event) {
      if (!openMenu) return;
      if (openMenu.panel.contains(event.target)) return;
      if (openMenu.button.contains(event.target)) return;
      closeOpenMenu();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !openMenu) return;
      var button = openMenu.button;
      closeOpenMenu();
      button.focus();
    });

    // Al hacer scroll o redimensionar, el panel anclado a coordenadas fijas
    // dejaria de coincidir con su boton: es mas honesto cerrarlo.
    window.addEventListener('scroll', closeOpenMenu, true);
    window.addEventListener('resize', closeOpenMenu);
  }

  /** Coloca el panel bajo el boton, girandolo si no cabe en la ventana. */
  function positionPanel(panel, button) {
    var rect = button.getBoundingClientRect();
    var panelRect = panel.getBoundingClientRect();
    var margin = 6;

    var top = rect.bottom + margin;
    if (top + panelRect.height > window.innerHeight - margin) {
      var above = rect.top - panelRect.height - margin;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - panelRect.height - margin);
    }

    // Alineado por la derecha con el boton, que es donde vive en la fila.
    var left = rect.right - panelRect.width;
    if (left < margin) left = margin;
    if (left + panelRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - panelRect.width - margin);
    }

    panel.style.top = Math.round(top) + 'px';
    panel.style.left = Math.round(left) + 'px';
  }

  function buildItem(action, panel) {
    if (action.separator) {
      var hr = document.createElement('div');
      hr.className = 'fam-separator';
      hr.setAttribute('role', 'separator');
      return hr;
    }

    // Los enlaces se pintan como <a> para conservar "abrir en pestana nueva"
    // con el boton central o Ctrl+click.
    var isLink = !!action.href && !action.disabled;
    var item = document.createElement(isLink ? 'a' : 'button');
    item.className = 'fam-item' + (action.danger ? ' fam-item--danger' : '');
    item.setAttribute('role', 'menuitem');

    if (isLink) {
      item.href = action.href;
      if (action.target) item.target = action.target;
      if (action.download) item.setAttribute('download', '');
    } else {
      item.type = 'button';
    }

    if (action.disabled) {
      item.classList.add('fam-item--disabled');
      item.setAttribute('aria-disabled', 'true');
      if (item.tagName === 'BUTTON') item.disabled = true;
      if (action.disabledReason) item.title = action.disabledReason;
    } else if (action.title) {
      item.title = action.title;
    }

    var icon = document.createElement('i');
    icon.className = 'fas ' + (action.icon || 'fa-circle') + ' fam-item__icon';
    icon.setAttribute('aria-hidden', 'true');
    item.appendChild(icon);

    var label = document.createElement('span');
    label.className = 'fam-item__label';
    label.textContent = action.label || '';
    item.appendChild(label);

    if (action.badge) {
      var badge = document.createElement('span');
      badge.className = 'fam-item__badge' + (action.badgeAttention ? ' fam-item__badge--attention' : '');
      badge.textContent = action.badge;
      item.appendChild(badge);
    }

    if (!action.disabled) {
      item.addEventListener('click', function (event) {
        if (typeof action.onClick === 'function') {
          event.preventDefault();
          closeOpenMenu();
          action.onClick(event);
          return;
        }
        // Enlace normal: se deja navegar, pero el menu se cierra.
        closeOpenMenu();
      });
    } else {
      item.addEventListener('click', function (event) { event.preventDefault(); });
    }

    return item;
  }

  function openPanel(button, actions, options) {
    var panel = document.createElement('div');
    panel.className = 'fam-panel';
    panel.setAttribute('role', 'menu');
    if (options.ariaLabel) panel.setAttribute('aria-label', options.ariaLabel);

    var visible = actions.filter(function (a) { return a && (a.separator || a.label); });

    // Separadores al principio, al final o duplicados quedarian sueltos.
    var cleaned = [];
    visible.forEach(function (action) {
      if (action.separator) {
        if (!cleaned.length) return;
        if (cleaned[cleaned.length - 1].separator) return;
      }
      cleaned.push(action);
    });
    while (cleaned.length && cleaned[cleaned.length - 1].separator) cleaned.pop();

    cleaned.forEach(function (action) {
      panel.appendChild(buildItem(action, panel));
    });

    document.body.appendChild(panel);
    positionPanel(panel, button);

    button.setAttribute('aria-expanded', 'true');
    button.classList.add('fam-btn--active');
    openMenu = { panel: panel, button: button };

    var first = panel.querySelector('.fam-item:not(.fam-item--disabled)');
    if (first) first.focus();
  }

  /**
   * Crea el boton de opciones.
   *
   * @param {Array|Function} actions lista de acciones, o una funcion que la
   *        devuelve en el momento de abrir (util cuando el estado cambia,
   *        p. ej. el numero de traducciones)
   * @param {{ariaLabel?:string, attention?:boolean, className?:string}} [options]
   * @returns {HTMLButtonElement}
   */
  function create(actions, options) {
    ensureGlobalListeners();
    var opts = options || {};

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fam-btn' + (opts.className ? ' ' + opts.className : '');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', opts.ariaLabel || 'File actions');
    button.title = opts.ariaLabel || 'File actions';
    button.innerHTML = '<i class="fas fa-ellipsis-v" aria-hidden="true"></i>';

    if (opts.attention) {
      var dot = document.createElement('span');
      dot.className = 'fam-btn__dot';
      button.appendChild(dot);
    }

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();

      var wasOpen = openMenu && openMenu.button === button;
      closeOpenMenu();
      if (wasOpen) return;

      var list = typeof actions === 'function' ? actions() : actions;
      if (!list || !list.length) return;
      openPanel(button, list, opts);
    });

    return button;
  }

  global.FileActionsMenu = { create: create, close: closeOpenMenu };
}(window));
