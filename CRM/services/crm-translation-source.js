/* ============================================================
   CRM — Translation jobs source
   ------------------------------------------------------------
   Registra la cola `crm_translations` en el motor generico de
   traducciones (Approvals_functions/services/translation-job-engine.js).

   Lo unico especifico de CRM es como se localiza el archivo
   original: a diferencia de APPROVALS, la ruta es determinista y
   no requiere consultar la base de datos:

       \\{server_1}\CRM\{crm_id}\{msg_id}\{filename}

   El PDF traducido se escribe en esa misma carpeta, junto al
   original, para que viaje con el caso.
   ============================================================ */
import { buildCrmUncPath } from '../controllers/CRM.js';
import CRMTranslationsModel from '../model/crm_translations.js';
import {
    registerTranslationSource,
    notifyNewJob,
} from '../../Approvals_functions/services/translation-job-engine.js';

registerTranslationSource({
    key: 'crm',
    model: CRMTranslationsModel,

    resolveSourcePath: (job) => {
        const fullPath = buildCrmUncPath(job.crm_id, job.msg_id, job.source_filename);
        if (!fullPath) {
            return { ok: false, error: 'server_1 is not configured on this server' };
        }
        return { ok: true, fullPath };
    },

    auditScope: (job) => ({ crm_id: job.crm_id, msg_id: job.msg_id }),

    pdfContext: (job) => ({ documentRef: `CRM: ${job.crm_id} · Message: ${job.msg_id}` }),

    describe: (job) => `job ${job.id} (CRM ${job.crm_id}/${job.msg_id})`,
});

export { notifyNewJob };
