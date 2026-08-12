# services-fix

Correcciones al pipeline de traducción de documentos (CRM + APPROVALS).

**Problema:** los jobs de `/crm-translate/create` quedan en `queued` para siempre y
`/crm-translate/status` nunca resuelve.

**Causa raíz confirmada (log del servidor: `sources: none`):** ninguna cola quedó
registrada en el motor. El registro se hace por *import de efecto secundario*
(`Approvals.js` líneas 26 y 29). El proceso en producción arranca desde otro
entrypoint — `package.json` declara `"main": "Approvals-Desa.js"`, archivo que no
está versionado — y ese archivo llama a `startTranslationJobRunner()` sin importar
`translation-job-runner.js` ni `CRM/services/crm-translation-source.js`. Resultado:
el runner arranca, hace tick cada 15s y no encuentra ninguna cola que recorrer.
Los jobs se quedan en `pending` para siempre, tanto en CRM como en APPROVALS.

La corrección de abajo hace que el motor **cargue sus propias fuentes** al arrancar
(`ensureSourcesRegistered`), de modo que deja de depender de qué archivo sea el
entrypoint, y añade un `console.error` explícito si aun así se queda sin fuentes.

**Causa raíz secundaria (bloqueo de cola):** `translateText()` hace `fetch` sin timeout. Si el endpoint de IA no
responde, la promesa nunca resuelve, `activeCount` del motor se queda en 1
(`TRANSLATION_MAX_CONCURRENT` por defecto) y **ninguna cola vuelve a reclamar jobs**.
`requeueStaleJobs` solo corría al arrancar el proceso, así que el job zombie nunca se
recuperaba. A eso se suma que `drainQueue` no era round-robin real (siempre empezaba
por la primera fuente registrada) y que `findActiveJob` devolvía el job atascado en
cada reintento (`alreadyQueued: true`), impidiendo reencolar.

## Archivos modificados

| # | Archivo | Cambio |
|---|---|---|
| 1 | `Tools/services/translation-service.js` | Timeout + `AbortSignal` en la llamada a la IA |
| 2 | `Approvals_functions/services/translation-job-engine.js` | Timeout por job, requeue periódico de zombies, round-robin real |
| 3 | `CRM/model/crm_translations.js` | `findActiveJob` ignora los `processing` caducados |

## Variables de entorno nuevas (opcionales, todas con default)

```env
AI_TIMEOUT_MS=120000                      # timeout de cada llamada a la IA (2 min)
TRANSLATION_JOB_TIMEOUT_MS=900000         # timeout total de un job (15 min)
TRANSLATION_REQUEUE_INTERVAL_MS=300000    # cada cuánto se rescatan zombies (5 min)
TRANSLATION_MAX_CONCURRENT=2              # recomendado subir de 1 a 2
TRANSLATION_STALE_MINUTES=30
TRANSLATION_IDLE_POLL_MS=15000
```

## Antes de desplegar

Confirma que la migración de preview se aplicó sobre `crm_translations` (si falta
`preview_ready_at` o `translated` en el CHECK, el `OUTPUT` del claim revienta y el
job se queda en `pending` sin error visible):

```sql
SELECT COL_LENGTH('dbo.crm_translations','preview_ready_at') AS preview_col,
       COL_LENGTH('dbo.crm_translations','translated_text')  AS text_col;

SELECT definition FROM sys.check_constraints
WHERE name = 'CK_crm_translations_status';
```

Si `preview_col` o `text_col` salen `NULL`, ejecuta `sql/translation_preview.sql`.

---

# 1. `Tools/services/translation-service.js`

```js
/**
 * Servicio de traducción.
 *
 * Reutiliza la misma infraestructura de IA del proyecto (`AI_ENDPOINT` /
 * `AI_MODEL`, endpoint tipo Ollama `/api/generate`) que ya emplea el módulo
 * `AI/`. Portado de `traducir_con_gpt` / `extract_structured_data_local`
 */
import { nameFromCode } from '../utils/languages.js';

/**
 * Timeout de una llamada al servicio de IA.
 *
 * Sin esto un endpoint que acepta la conexion pero nunca responde deja la
 * promesa colgada para siempre; como el motor de jobs cuenta ese job como
 * activo, la cola entera (CRM y APPROVALS) se bloquea de forma permanente.
 */
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 120000);

/** Construye el prompt de traducción */
export function buildTranslationPrompt(text, targetLangName) {
  return `Eres un traductor profesional experto en múltiples idiomas incluyendo árabe, hebreo, chino, japonés y coreano.
Traduce el texto manteniendo el formato, contexto y significado original.
Si el texto contiene caracteres especiales o es de un idioma de escritura de derecha a izquierda, maneja la traducción apropiadamente.

Detecta el idioma del siguiente texto y tradúcelo al ${targetLangName} de manera precisa, natural y completa:

${text}

Proporciona la traducción directamente, de forma completa y sin explicaciones adicionales.`;
}

/** Extrae el texto de la respuesta del proveedor de IA (varias formas posibles). */
function extractAIText(response) {
  if (!response) return '';
  if (typeof response.response === 'string') return response.response;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.content === 'string') return response.content;
  return '';
}

/**
 * Señal de aborto con timeout, compatible con versiones de Node que no
 * exponen `AbortSignal.timeout` (< 17.3).
 */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), cancel: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer.unref === 'function') timer.unref();
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Traduce un texto al idioma destino.
 *
 * @param {string} text
 * @param {string} targetCode  código ISO del idioma destino (p. ej. 'eng')
 * @returns {Promise<string>}
 */
export async function translateText(text, targetCode) {
  if (!process.env.AI_ENDPOINT) {
    throw new Error('AI_ENDPOINT is not configured');
  }

  const targetName = nameFromCode(targetCode);
  const prompt = buildTranslationPrompt(text, targetName);

  const { signal, cancel } = timeoutSignal(AI_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(process.env.AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        prompt,
        stream: false
      }),
      signal
    });
  } catch (error) {
    // Un abort se traduce a un error propio para que el motor pueda marcar
    // el job como `failed` con un mensaje util en vez de dejarlo colgado.
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      const timeoutError = new Error(
        `The translation service did not respond within ${Math.round(AI_TIMEOUT_MS / 1000)}s`
      );
      timeoutError.code = 'AI_TIMEOUT';
      throw timeoutError;
    }
    const connError = new Error(`Could not reach the translation service: ${error.message}`);
    connError.code = 'AI_UNAVAILABLE';
    throw connError;
  } finally {
    cancel();
  }

  if (!res.ok) {
    throw new Error(`AI service error status ${res.status}`);
  }

  const data = await res.json();
  return extractAIText(data).trim();
}
```

---

# 2. `Approvals_functions/services/translation-job-engine.js`

```js
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
import {
    extractAndTranslate,
    buildTranslatedPdf,
    buildTranslatedFilename,
} from './translation-pdf-service.js';

const MAX_CONCURRENT = Number(process.env.TRANSLATION_MAX_CONCURRENT || 1);
const IDLE_POLL_MS = Number(process.env.TRANSLATION_IDLE_POLL_MS || 15000);
const STALE_JOB_MINUTES = Number(process.env.TRANSLATION_STALE_MINUTES || 30);

/**
 * Techo de duracion de un job. Es la red de seguridad del motor: aunque una
 * dependencia (OCR, IA, lectura de red) se quede colgada, el job termina en
 * `failed` y libera el slot de concurrencia en vez de bloquear la cola.
 */
const JOB_TIMEOUT_MS = Number(process.env.TRANSLATION_JOB_TIMEOUT_MS || 15 * 60 * 1000);

/**
 * Cada cuanto se rescatan los jobs que quedaron en `processing`. Antes esto
 * solo ocurria al arrancar el proceso, asi que un job zombie inmovilizaba la
 * cola hasta el siguiente reinicio.
 */
const REQUEUE_INTERVAL_MS = Number(process.env.TRANSLATION_REQUEUE_INTERVAL_MS || 5 * 60 * 1000);

/** Fuentes registradas, por key. */
const sources = new Map();

let connectionConfig = null;
let running = false;
let activeCount = 0;
let wakeUpTimer = null;
let lastRequeueAt = 0;

/**
 * Desplazamiento del turno de arranque en drainQueue. Sin esto el bucle
 * siempre empezaba por la primera fuente registrada y, con concurrencia 1,
 * una cola con trabajo constante dejaba a la otra sin atender nunca.
 */
let rotationOffset = 0;

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

/**
 * Rechaza la promesa si tarda mas de `ms`. No cancela el trabajo subyacente
 * (no todas las dependencias lo permiten), pero si libera el slot para que
 * la cola siga avanzando.
 */
function withTimeout(promise, ms, code, message) {
    let timer = null;
    const guard = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(message);
            error.code = code;
            reject(error);
        }, ms);
        if (typeof timer.unref === 'function') timer.unref();
    });
    return Promise.race([promise, guard]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

/** Mensaje de error apto para mostrar al usuario final. */
function toUserMessage(error) {
    switch (error?.code) {
        case 'NO_TEXT':
            return 'No readable text was found in this document.';
        case 'FONT_UNAVAILABLE':
        case 'LEGACY_DOC_UNSUPPORTED':
            return error.message;
        case 'INVALID_DOCX':
            return 'The Word file could not be read. It may be corrupted — try opening it and saving it again as .docx.';
        case 'INVALID_ODT':
            return 'The OpenDocument file could not be read. It may be corrupted.';
        case 'UNSUPPORTED_FILE':
            return 'This file type cannot be translated.';
        case 'EMPTY_TRANSLATION':
            return 'The translation service returned an empty result. Please try again.';
        case 'FILE_LOCKED':
            return 'The file is currently open by another user. Please try again later.';
        case 'AI_TIMEOUT':
        case 'JOB_TIMEOUT':
            return 'The translation took too long and was cancelled. Please try again, or try with a smaller document.';
        case 'AI_UNAVAILABLE':
            return 'The translation service is not available right now. Please try again later.';
        default:
            return error?.message || 'Unexpected error while translating the document.';
    }
}

function describeJob(source, job) {
    return typeof source.describe === 'function'
        ? source.describe(job)
        : `${source.key} job ${job.id}`;
}

/**
 * Ruta absoluta del archivo original de un job, verificando que existe.
 * Cada modulo tiene su propio layout de carpetas, de ahi el `resolveSourcePath`
 * de la fuente.
 */
async function resolveSourceFilePath(source, job) {
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
    return resolved.fullPath;
}

/** Contenido del archivo original, traduciendo el bloqueo a un codigo propio. */
async function readSourceFile(fullPath) {
    try {
        return await readFile(fullPath);
    } catch (readErr) {
        if (isFileLockedError(readErr)) {
            const error = new Error('The file is locked by another process');
            error.code = 'FILE_LOCKED';
            throw error;
        }
        throw readErr;
    }
}

/**
 * Procesa un job ya reclamado (estado `processing`).
 *
 * Termina en `translated`, NO en `completed`: el motor solo hace la parte
 * cara (extraccion + traduccion) y deja el texto guardado. El documento se
 * genera despues, cuando el usuario lo pide desde el preview — asi no se
 * escriben PDFs en el expediente que nadie ha revisado.
 */
async function processJob(source, job) {
    const sourceFilename = job.source_filename;

    const sourcePath = await resolveSourceFilePath(source, job);
    const sourceBytes = await readSourceFile(sourcePath);

    // Techo duro: si la extraccion o la IA se cuelgan, el job falla y libera
    // el slot en vez de dejar la cola bloqueada indefinidamente.
    const result = await withTimeout(
        extractAndTranslate({
            sourceBytes,
            sourceFilename,
            targetCode: job.target_lang,
            sourceCode: job.source_lang || 'auto',
        }),
        JOB_TIMEOUT_MS,
        'JOB_TIMEOUT',
        `The job exceeded the ${Math.round(JOB_TIMEOUT_MS / 60000)} minute limit`,
    );

    await withTransaction(async (transaction) => {
        await source.model.markTranslated(transaction, job.id, {
            translated_text: result.translatedText,
            char_count: result.charCount,
            extraction_method: result.extractionMethod,
        });
        await source.model.insertAuditLog(transaction, {
            ...source.auditScope(job),
            translation_id: job.id,
            source_filename: sourceFilename,
            action: 'translation_ready',
            user_id: job.created_by,
            user_name: job.created_by_name,
            details: `lang=${job.target_lang}; chars=${result.charCount}; method=${result.extractionMethod}`,
        });
    });

    console.log(
        `[Translations] ${describeJob(source, job)} translated ` +
        `(${result.charCount} chars) — awaiting document generation`,
    );
}

/**
 * Segunda etapa: compone el documento con el texto ya revisado y lo escribe
 * junto al archivo original. La invoca el controlador dentro del request,
 * porque solo compone el PDF (sin OCR ni IA) y tarda decimas de segundo.
 *
 * No toca la base de datos: devuelve los datos del archivo para que el
 * controlador los persista en su propia transaccion.
 *
 * @param {string} sourceKey clave de la fuente registrada ('crm', 'approvals')
 * @param {object} job fila del job (necesita source_filename, target_lang, version)
 * @param {string} translatedText texto final, posiblemente editado por el usuario
 * @returns {Promise<{ translatedFilename:string, filePath:string,
 *                     fileHash:string, pageCount:number }>}
 */
export async function renderTranslationDocument(sourceKey, job, translatedText) {
    const source = sources.get(sourceKey);
    if (!source) throw new Error(`Unknown translation source: ${sourceKey}`);
    if (!connectionConfig) {
        // Solo puede pasar si se llama antes de arrancar el motor.
        throw new Error('The translation engine has not been started yet');
    }

    const text = String(translatedText || '').trim();
    if (!text) {
        const error = new Error('There is no translated text to generate the document from');
        error.code = 'NO_TEXT';
        throw error;
    }

    // Solo hace falta la ruta del original (el documento se guarda a su
    // lado), no su contenido: el texto ya esta traducido y guardado.
    const fullPath = await resolveSourceFilePath(source, job);

    const { bytes, pageCount } = await buildTranslatedPdf({
        translatedText: text,
        sourceFilename: job.source_filename,
        targetCode: job.target_lang,
        sourceCode: job.source_lang || 'auto',
        createdByName: job.created_by_name,
        ...(typeof source.pdfContext === 'function' ? source.pdfContext(job) : {}),
    });

    const targetDir = path.dirname(fullPath);
    if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
    }

    const translatedFilename = buildTranslatedFilename(
        job.source_filename,
        job.target_lang,
        job.version,
    );
    const outputPath = path.join(targetDir, translatedFilename).replace(/\\/g, '/');

    await writeFileSafe(outputPath, bytes);

    return {
        translatedFilename,
        filePath: outputPath,
        fileHash: hashBuffer(bytes),
        pageCount,
    };
}

/** Mensaje de error de usuario, reexportado para los controladores. */
export { toUserMessage as translationErrorMessage };

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
 * Devuelve a `pending` los jobs que se quedaron en `processing` mas tiempo
 * del razonable. Se ejecuta al arrancar y periodicamente desde el tick.
 */
async function requeueStaleJobs() {
    for (const source of sources.values()) {
        try {
            const count = await withTransaction((transaction) =>
                source.model.requeueStaleJobs(transaction, STALE_JOB_MINUTES));
            if (count > 0) {
                console.log(`[Translations] re-queued ${count} stale ${source.key} job(s)`);
            }
        } catch (error) {
            console.error(
                `[Translations] could not re-queue stale ${source.key} jobs:`,
                error.message,
            );
        }
    }
}

/**
 * Reclama y procesa jobs hasta agotar todas las colas o alcanzar el limite
 * de concurrencia. Recorre las fuentes por turnos — empezando cada vez por
 * una distinta — para que una cola larga en un modulo no deje al otro sin
 * atender.
 */
async function drainQueue() {
    if (!connectionConfig || sources.size === 0) return;

    while (activeCount < MAX_CONCURRENT) {
        let claimedAny = false;

        // Turno rotatorio: el orden de `sources` es el de registro, asi que
        // sin esto la primera fuente se llevaba siempre el unico slot libre.
        const all = [...sources.values()];
        const start = rotationOffset % all.length;
        const ordered = all.slice(start).concat(all.slice(0, start));
        rotationOffset = (rotationOffset + 1) % all.length;

        for (const source of ordered) {
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
 * Modulos que registran una cola. El motor los carga el mismo al arrancar
 * en vez de confiar en que el entrypoint tenga los imports de efecto
 * secundario: si faltan (o si se arranca desde otro archivo), el runner
 * giraba en vacio con `sources: none` y ningun job avanzaba nunca.
 *
 * Import dinamico a proposito: ocurre despues de que este modulo ya esta
 * evaluado, asi que la dependencia circular no es un problema.
 */
const SOURCE_MODULES = [
    './translation-job-runner.js',
    '../../CRM/services/crm-translation-source.js',
];

async function ensureSourcesRegistered() {
    for (const spec of SOURCE_MODULES) {
        try {
            await import(spec);
        } catch (error) {
            console.error(
                `[Translations] could not load source module ${spec}:`,
                error.message,
            );
        }
    }
}

/**
 * Arranca el motor. Idempotente: llamarlo dos veces no duplica bucles.
 * Se invoca una sola vez desde el arranque de la app.
 */
export function startTranslationJobRunner(sqlConfig) {
    if (running) return;
    connectionConfig = sqlConfig;
    running = true;
    lastRequeueAt = 0;

    const tick = () => {
        const now = Date.now();
        if (now - lastRequeueAt >= REQUEUE_INTERVAL_MS) {
            lastRequeueAt = now;
            // Los jobs colgados vuelven a la cola sin esperar a un reinicio.
            requeueStaleJobs()
                .catch((error) => console.error('[Translations] requeue error:', error.message))
                .finally(() => {
                    drainQueue().catch((error) => {
                        console.error('[Translations] drain error:', error.message);
                    });
                });
            return;
        }
        drainQueue().catch((error) => {
            console.error('[Translations] drain error:', error.message);
        });
    };

    ensureSourcesRegistered().then(() => {
        if (sources.size === 0) {
            console.error(
                '[Translations] NO translation sources registered — the queue will ' +
                'never advance. Check the imports in SOURCE_MODULES.',
            );
        }

        tick();
        wakeUpTimer = setInterval(tick, IDLE_POLL_MS);
        if (typeof wakeUpTimer.unref === 'function') wakeUpTimer.unref();

        console.log(
            `[Translations] job runner started (concurrency ${MAX_CONCURRENT}, ` +
            `job timeout ${Math.round(JOB_TIMEOUT_MS / 60000)}m, ` +
            `sources: ${[...sources.keys()].join(', ') || 'none'})`,
        );
    });
}

/** Detiene el motor (util en tests o apagado controlado). */
export function stopTranslationJobRunner() {
    running = false;
    if (wakeUpTimer) clearInterval(wakeUpTimer);
    wakeUpTimer = null;
}
```

---

# 3. `CRM/model/crm_translations.js` — solo `findActiveJob`

Reemplaza el método completo (el resto del archivo no cambia):

```js
    /**
     * Job existente aun en curso para el mismo archivo+idioma (evita duplicados).
     *
     * Un `processing` mas viejo que `staleMinutes` NO cuenta como activo: es un
     * job colgado que el motor va a reencolar, y bloquearlo aqui hacia que cada
     * reintento del usuario devolviese `alreadyQueued` sobre el mismo registro
     * muerto, sin forma de volver a lanzar la traduccion.
     */
    static async findActiveJob(transaction, crmId, msgId, sourceFilename, targetLang, staleMinutes = 30) {
        const request = new sql.Request(transaction);
        request.input('crm_id', sql.Int, crmId);
        request.input('msg_id', sql.Int, msgId);
        request.input('source_filename', sql.NVarChar(500), sourceFilename);
        request.input('target_lang', sql.NVarChar(20), targetLang);
        request.input('staleMinutes', sql.Int, staleMinutes);
        const result = await request.query(`
            SELECT TOP 1 ${SELECT_COLUMNS}
            FROM crm_translations
            WHERE crm_id = @crm_id
              AND msg_id = @msg_id
              AND source_filename = @source_filename
              AND target_lang = @target_lang
              AND (
                    status = '${TRANSLATION_STATUS.PENDING}'
                 OR (
                        status = '${TRANSLATION_STATUS.PROCESSING}'
                    AND started_at IS NOT NULL
                    AND DATEDIFF(MINUTE, started_at, GETDATE()) < @staleMinutes
                    )
              )
            ORDER BY created_at DESC
        `);
        return result.recordset[0] || null;
    }
```

> El mismo cambio aplica a `Approvals_functions/models/translations.js` si quieres
> el comportamiento simétrico en APPROVALS (allí la firma es
> `findActiveJob(transaction, approvalId, sourceFilename, targetLang)` y no hay
> `crm_id` / `msg_id`).

---

## Verificación tras desplegar

1. En el log de arranque debe aparecer:
   `[Translations] job runner started (concurrency 2, job timeout 15m, sources: approvals, crm)`
   Si vuelve a decir `sources: none`, mira la línea
   `could not load source module ...` justo encima: te dice cuál de los dos
   módulos falló al cargar y por qué.
1b. Identifica qué archivo arranca de verdad y, si no es `Approvals.js`, alinéalo:
   ```bash
   pm2 describe <app> | grep -i "script path"
   grep -n "translation" Approvals-Desa.js
   ```
   Con `ensureSourcesRegistered` ya no hace falta, pero conviene corregir también
   `"main": "Approvals-Desa.js"` en `package.json` para que apunte al entrypoint real.
2. Desbloquea la cola actual una sola vez:
   ```sql
   UPDATE crm_translations       SET status='pending', started_at=NULL WHERE status='processing';
   UPDATE approval_translations  SET status='pending', started_at=NULL WHERE status='processing';
   ```
3. Lanza una traducción y sigue el estado:
   ```sql
   SELECT id, status, started_at, preview_ready_at, error_message
   FROM crm_translations ORDER BY id DESC;
   ```
   Debe pasar `pending → processing → translated`. Si se queda en `failed` con
   mensaje de timeout, el problema real está en el endpoint de IA (`AI_ENDPOINT`)
   o en el OCR, no en la cola — pero ahora al menos lo verás en vez de esperar.
