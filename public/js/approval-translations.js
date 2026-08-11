/* ═══════════════════════════════════════════════════════════
   Approval Document Translations
   -----------------------------------------------------------
   Adaptador de APPROVALS sobre el nucleo compartido
   (/js/document-translations-core.js): describe como se identifica
   un archivo en los endpoints /approval-translate/* y como refrescar
   la lista de archivos del approval cuando algo cambia.

   API publica (sin cambios para public/scripts.js):
     ApprovalTranslations.openTranslateModal(rowId, filename)
     ApprovalTranslations.openTranslationsModal(rowId, filename)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!window.DocumentTranslations) {
    console.error('[Translations] document-translations-core.js must load first');
    return;
  }

  var instance = window.DocumentTranslations.create({
    endpointBase: '/approval-translate',

    docParams: function (ref) {
      return { RowID: ref.rowId, filename: ref.filename };
    },

    scopeParams: function (ref) {
      return { RowID: ref.rowId };
    },

    onChanged: function (ref) {
      if (typeof window.ArchivosApproval === 'function') {
        window.ArchivosApproval(ref.rowId, { highlightFilename: ref.filename });
      }
    }
  });

  function toRef(rowId, filename) {
    return { rowId: rowId, filename: filename };
  }

  window.ApprovalTranslations = {
    openTranslateModal: function (rowId, filename) {
      instance.openTranslateModal(toRef(rowId, filename));
    },
    openTranslationsModal: function (rowId, filename) {
      instance.openTranslationsModal(toRef(rowId, filename));
    },
    resumePolling: function (rowId, filename, translationId) {
      instance.resumePolling(toRef(rowId, filename), translationId);
    }
  };
})();
