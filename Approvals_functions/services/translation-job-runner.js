/* ============================================================
   Translation jobs — background runner
   ------------------------------------------------------------
   La traduccion de un documento largo puede tardar minutos (OCR +
   varias llamadas al modelo), demasiado para el ciclo request /
   response. El controlador solo encola el job y responde; este
   runner lo procesa fuera del request.

   Caracteristicas:
     - Cola persistida en `approval_translations` (sobrevive a los
       reinicios; los jobs colgados se re-encolan al arrancar).
     - Concurrencia limitada para no saturar el servicio de IA.
     - Un unico bucle por proceso; `notify()` lo despierta cuando
       entra trabajo nuevo, en vez de hacer polling agresivo.
   ============================================================ */
import sql from 'mssql';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import ApprovalTranslationsModel, { TRANSLATION_STATUS } from '../models/translations.js';
import { resolveApprovalFileFullPath } from '../shared/approval-file-routing.js';
import { hashBuffer, writeFileSafe, isFileLockedError } from './pdf-text-writer.js';
import { generateTranslatedPdf, buildTranslatedFilename } from './translation-pdf-service.js';

const MAX_CONCURRENT = Number(process.env.TRANSLATION_MAX_CONCURRENT || 1);
const IDLE_POLL_MS = Number(process.env.TRANSLATION_IDLE_POLL_MS || 15000);
const STALE_JOB_MINUTES = Number(process.env.TRANSLATION_STALE_MINUTES || 30);

let connectionConfig = null;
let running = false;
let activeCount = 0;
let wakeUpTimer = null;

/** Ejecuta `fn` dentro de una transaccion, con rollback ante error. */
async function withTransaction(fn) {
    await sql.connect(connectionConfig);
    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
        const result = await fn(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        throw error;
    }
}

/** Mensaje de error apto para mostrar al usuario final. */
function toUserMessage(error) {
    switch (error?.code) {
        case 'NO_TEXT':
            return 'No readable text was found in this document.';
        case 'FONT_UNAVAILABLE':
            return error.message;
        case 'UNSUPPORTED_FILE':
            return 'This file type cannot be translated.';
        case 'EMPTY_TRANSLATION':
            return 'The translation service returned an empty result. Please try again.';
        case 'FILE_LOCKED':
            return 'The file is currently open by another user. Please try again later.';
        default:
            return error?.message || 'Unexpected error while translating the document.';
    }
}

/** Procesa un job ya reclamado (estado `processing`). */
async function processJob(job) {
    const sourceFilename = job.source_filename;

    // 1) Localizar el archivo original en su ruta UNC.
    const resolved = await resolveApprovalFileFullPath(
        connectionConfig,
        job.approval_id,
        sourceFilename,
    );

    if (!resolved?.ok || !resolved.fullPath) {
        const error = new Error(resolved?.error || 'Could not resolve the source file path');
        error.code = 'PATH_NOT_RESOLVED';
        throw error;
    }
    if (!existsSync(resolved.fullPath)) {
        const error = new Error('Source file not found on the server');
        error.code = 'FILE_NOT_FOUND';
        throw error;
    }

    let sourceBytes;
    try {
        sourceBytes = await readFile(resolved.fullPath);
    } catch (readErr) {
        if (isFileLockedError(readErr)) {
            const error = new Error('The file is locked by another process');
            error.code = 'FILE_LOCKED';
            throw error;
        }
        throw readErr;
    }

    // 2) Extraer + traducir + componer el PDF.
    const result = await generateTranslatedPdf({
        sourceBytes,
        sourceFilename,
        targetCode: job.target_lang,
        sourceCode: job.source_lang || 'auto',
        createdByName: job.created_by_name,
        approvalId: job.approval_id,
    });

    // 3) Guardar junto al original.
    const targetDir = path.dirname(resolved.fullPath);
    if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
    }

    const translatedFilename = buildTranslatedFilename(
        sourceFilename,
        job.target_lang,
        job.version,
    );
    const outputPath = path.join(targetDir, translatedFilename).replace(/\\/g, '/');

    await writeFileSafe(outputPath, result.bytes);

    // 4) Marcar como completado.
    await withTransaction(async (transaction) => {
        await ApprovalTranslationsModel.markCompleted(transaction, job.id, {
            translated_filename: translatedFilename,
            file_path: outputPath,
            file_hash: hashBuffer(result.bytes),
            page_count: result.pageCount,
            char_count: result.charCount,
            extraction_method: result.extractionMethod,
        });
        await ApprovalTranslationsModel.insertAuditLog(transaction, {
            translation_id: job.id,
            approval_id: job.approval_id,
            source_filename: sourceFilename,
            action: 'translation_completed',
            user_id: job.created_by,
            user_name: job.created_by_name,
            details: `lang=${job.target_lang}; file=${translatedFilename}; pages=${result.pageCount}`,
        });
    });

    console.log(`[Translations] job ${job.id} completed -> ${translatedFilename}`);
}

/** Reclama y procesa jobs hasta agotar la cola o el limite de concurrencia. */
async function drainQueue() {
    if (!connectionConfig) return;

    while (activeCount < MAX_CONCURRENT) {
        let job = null;
        try {
            job = await withTransaction((transaction) =>
                ApprovalTranslationsModel.claimNextPendingJob(transaction));
        } catch (error) {
            console.error('[Translations] failed to claim job:', error.message);
            return;
        }

        if (!job) return; // cola vacia

        activeCount += 1;
        // Deliberadamente sin await: se procesan hasta MAX_CONCURRENT en paralelo.
        processJob(job)
            .catch(async (error) => {
                console.error(`[Translations] job ${job.id} failed:`, error);
                try {
                    await withTransaction(async (transaction) => {
                        await ApprovalTranslationsModel.markFailed(
                            transaction, job.id, toUserMessage(error),
                        );
                        await ApprovalTranslationsModel.insertAuditLog(transaction, {
                            translation_id: job.id,
                            approval_id: job.approval_id,
                            source_filename: job.source_filename,
                            action: 'translation_failed',
                            user_id: job.created_by,
                            user_name: job.created_by_name,
                            details: toUserMessage(error),
                        });
                    });
                } catch (dbError) {
                    console.error('[Translations] could not persist failure:', dbError.message);
                }
            })
            .finally(() => {
                activeCount -= 1;
                // Puede haber quedado trabajo pendiente mientras este corria.
                setImmediate(() => { drainQueue().catch(() => {}); });
            });
    }
}

/** Despierta el runner (lo llama el controlador tras encolar un job). */
export function notifyNewJob() {
    if (!running) return;
    drainQueue().catch((error) => {
        console.error('[Translations] drain error:', error.message);
    });
}

/**
 * Arranca el runner. Idempotente: llamarlo dos veces no duplica bucles.
 * Se invoca una sola vez desde el arranque de la app.
 */
export function startTranslationJobRunner(sqlConfig) {
    if (running) return;
    connectionConfig = sqlConfig;
    running = true;

    // Los jobs que quedaron en `processing` tras un reinicio vuelven a la cola.
    withTransaction((transaction) =>
        ApprovalTranslationsModel.requeueStaleJobs(transaction, STALE_JOB_MINUTES))
        .then((count) => {
            if (count > 0) console.log(`[Translations] re-queued ${count} stale job(s)`);
        })
        .catch((error) => {
            console.error('[Translations] could not re-queue stale jobs:', error.message);
        });

    const tick = () => {
        drainQueue().catch((error) => {
            console.error('[Translations] drain error:', error.message);
        });
    };

    tick();
    wakeUpTimer = setInterval(tick, IDLE_POLL_MS);
    if (typeof wakeUpTimer.unref === 'function') wakeUpTimer.unref();

    console.log(`[Translations] job runner started (concurrency ${MAX_CONCURRENT})`);
}

/** Detiene el runner (util en tests o apagado controlado). */
export function stopTranslationJobRunner() {
    running = false;
    if (wakeUpTimer) clearInterval(wakeUpTimer);
    wakeUpTimer = null;
}

export { TRANSLATION_STATUS };
