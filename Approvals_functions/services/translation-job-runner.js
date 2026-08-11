/* ============================================================
   Translation jobs — APPROVALS source
   ------------------------------------------------------------
   Registra la cola `approval_translations` en el motor generico
   (translation-job-engine.js) y reexporta su API para que los
   consumidores existentes no cambien.

   Lo unico especifico de APPROVALS es como se localiza el archivo
   original: la ruta depende del flow/log/proceso y la resuelve
   approval-file-routing.js.
   ============================================================ */
import ApprovalTranslationsModel, { TRANSLATION_STATUS } from '../models/translations.js';
import { resolveApprovalFileFullPath } from '../shared/approval-file-routing.js';
import {
    registerTranslationSource,
    notifyNewJob,
    startTranslationJobRunner,
    stopTranslationJobRunner,
} from './translation-job-engine.js';

registerTranslationSource({
    key: 'approvals',
    model: ApprovalTranslationsModel,

    resolveSourcePath: (job, sqlConfig) =>
        resolveApprovalFileFullPath(sqlConfig, job.approval_id, job.source_filename),

    auditScope: (job) => ({ approval_id: job.approval_id }),

    pdfContext: (job) => ({ approvalId: job.approval_id }),

    describe: (job) => `job ${job.id} (approval ${job.approval_id})`,
});

export { notifyNewJob, startTranslationJobRunner, stopTranslationJobRunner, TRANSLATION_STATUS };
