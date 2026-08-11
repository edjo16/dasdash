/* ============================================================
   Translation jobs — generic background engine
   ------------------------------------------------------------
   La traduccion de un documento largo puede tardar minutos (OCR +
   varias llamadas al modelo), demasiado para el ciclo request /
   response. Los controladores solo encolan el job y responden;
   este motor lo procesa fuera del request.

   El motor no conoce ningun modulo concreto: cada modulo registra
   una "fuente" (APPROVALS, CRM, ...) con su modelo de cola y su
   forma de resolver la ruta del archivo original. De esa manera
   hay un unico bucle y un unico limite de concurrencia para toda
   la aplicacion, en vez de un runner por modulo compitiendo por
   la misma CPU y el mismo servicio de IA.

   Contrato de una fuente (ver registerTranslationSource):
     key                -> identificador corto para los logs
     model              -> claimNextPendingJob / markCompleted /
                           markFailed / insertAuditLog / requeueStaleJobs
     resolveSourcePath  -> (job, sqlConfig) => { ok, fullPath, error }
     auditScope         -> (job) => campos de identidad para el audit log
     pdfContext         -> (job) => contexto extra para el PDF (opcional)
     describe           -> (job) => texto para los logs (opcional)
   ============================================================ */
import sql from 'mssql';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { hashBuffer, writeFileSafe, isFileLockedError } from './pdf-text-writer.js';
import { generateTranslatedPdf, buildTranslatedFilename } from './translation-pdf-service.js';

const MAX_CONCURRENT = Number(process.env.TRANSLATION_MAX_CONCURRENT || 1);
const IDLE_POLL_MS = Number(process.env.TRANSLATION_IDLE_POLL_MS || 15000);
const STALE_JOB_MINUTES = Number(process.env.TRANSLATION_STALE_MINUTES || 30);

/** Fuentes registradas, por key. */
const sources = new Map();

let connectionConfig = null;
let running = false;
let activeCount = 0;
let wakeUpTimer = null;

/**
 * Registra una cola de traducciones. Idempotente por `key`, de modo que
 * importar dos veces el modulo de una fuente no duplica el trabajo.
 */
export function registerTranslationSource(source) {
    if (!source?.key || !source.model) {
        throw new Error('A translation source needs at least { key, model }');
    }
    if (sources.has(source.key)) return;
    sources.set(source.key, source);
}

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

function describeJob(source, job) {
    return typeof source.describe === 'function'
        ? source.describe(job)
        : `${source.key} job ${job.id}`;
}

/** Procesa un job ya reclamado (estado `processing`). */
async function processJob(source, job) {
    const sourceFilename = job.source_filename;

    // 1) Localizar el archivo original (cada modulo tiene su propio layout).
    const resolved = await source.resolveSourcePath(job, connectionConfig);

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
        ...(typeof source.pdfContext === 'function' ? source.pdfContext(job) : {}),
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
        await source.model.markCompleted(transaction, job.id, {
            translated_filename: translatedFilename,
            file_path: outputPath,
            file_hash: hashBuffer(result.bytes),
            page_count: result.pageCount,
            char_count: result.charCount,
            extraction_method: result.extractionMethod,
        });
        await source.model.insertAuditLog(transaction, {
            ...source.auditScope(job),
            translation_id: job.id,
            source_filename: sourceFilename,
            action: 'translation_completed',
            user_id: job.created_by,
            user_name: job.created_by_name,
            details: `lang=${job.target_lang}; file=${translatedFilename}; pages=${result.pageCount}`,
        });
    });

    console.log(`[Translations] ${describeJob(source, job)} completed -> ${translatedFilename}`);
}

/** Persiste el fallo de un job sin dejar que un error de BD lo enmascare. */
async function persistFailure(source, job, error) {
    console.error(`[Translations] ${describeJob(source, job)} failed:`, error);
    try {
        await withTransaction(async (transaction) => {
            await source.model.markFailed(transaction, job.id, toUserMessage(error));
            await source.model.insertAuditLog(transaction, {
                ...source.auditScope(job),
                translation_id: job.id,
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
}

/**
 * Reclama y procesa jobs hasta agotar todas las colas o alcanzar el limite
 * de concurrencia. Recorre las fuentes por turnos para que una cola larga
 * en un modulo no deje al otro sin atender.
 */
async function drainQueue() {
    if (!connectionConfig || sources.size === 0) return;

    while (activeCount < MAX_CONCURRENT) {
        let claimedAny = false;

        for (const source of sources.values()) {
            if (activeCount >= MAX_CONCURRENT) break;

            let job = null;
            try {
                job = await withTransaction((transaction) =>
                    source.model.claimNextPendingJob(transaction));
            } catch (error) {
                console.error(`[Translations] failed to claim ${source.key} job:`, error.message);
                continue;
            }

            if (!job) continue; // esta cola esta vacia
            claimedAny = true;
            activeCount += 1;

            // Deliberadamente sin await: se procesan hasta MAX_CONCURRENT en paralelo.
            processJob(source, job)
                .catch((error) => persistFailure(source, job, error))
                .finally(() => {
                    activeCount -= 1;
                    // Puede haber quedado trabajo pendiente mientras este corria.
                    setImmediate(() => { drainQueue().catch(() => {}); });
                });
        }

        if (!claimedAny) return; // todas las colas vacias
    }
}

/** Despierta el motor (lo llaman los controladores tras encolar un job). */
export function notifyNewJob() {
    if (!running) return;
    drainQueue().catch((error) => {
        console.error('[Translations] drain error:', error.message);
    });
}

/**
 * Arranca el motor. Idempotente: llamarlo dos veces no duplica bucles.
 * Se invoca una sola vez desde el arranque de la app, despues de que los
 * modulos hayan registrado sus fuentes.
 */
export function startTranslationJobRunner(sqlConfig) {
    if (running) return;
    connectionConfig = sqlConfig;
    running = true;

    // Los jobs que quedaron en `processing` tras un reinicio vuelven a la cola.
    for (const source of sources.values()) {
        withTransaction((transaction) =>
            source.model.requeueStaleJobs(transaction, STALE_JOB_MINUTES))
            .then((count) => {
                if (count > 0) {
                    console.log(`[Translations] re-queued ${count} stale ${source.key} job(s)`);
                }
            })
            .catch((error) => {
                console.error(
                    `[Translations] could not re-queue stale ${source.key} jobs:`,
                    error.message,
                );
            });
    }

    const tick = () => {
        drainQueue().catch((error) => {
            console.error('[Translations] drain error:', error.message);
        });
    };

    tick();
    wakeUpTimer = setInterval(tick, IDLE_POLL_MS);
    if (typeof wakeUpTimer.unref === 'function') wakeUpTimer.unref();

    console.log(
        `[Translations] job runner started (concurrency ${MAX_CONCURRENT}, ` +
        `sources: ${[...sources.keys()].join(', ') || 'none'})`,
    );
}

/** Detiene el motor (util en tests o apagado controlado). */
export function stopTranslationJobRunner() {
    running = false;
    if (wakeUpTimer) clearInterval(wakeUpTimer);
    wakeUpTimer = null;
}
