/**
 * Almacenamiento en disco de las imágenes de tarjetas de presentación.
 *
 * Raíz:  //<DB_SERVER>/BADACO   (override: BADACO_FILES_ROOT / BADACO_FILES_SERVER)
 * Final: <raíz>/<cf_id>/<archivo>          -- cf_id es el id de `card_files`
 * Temp:  <raíz>/_staging/<token>/<archivo>
 *
 * ¿Por qué el "staging"? La imagen llega en /api/tools/cards/extract, pero el
 * contacto (y con él el id que da nombre a la carpeta definitiva) no existe
 * hasta que el usuario revisa la tabla y pulsa enviar. En vez de subir la
 * imagen dos veces, se aparca con un token y el alta la mueve a su sitio.
 *
 * Nada de esto puede tumbar la extracción: si el recurso compartido no está
 * disponible, `stageCardImage` devuelve null y la herramienta sigue
 * funcionando sin archivar la imagen.
 */
import { mkdir, writeFile, readFile, readdir, rm, stat } from 'fs/promises';
import { randomUUID } from 'crypto';

const STAGING_DIR = '_staging';
/** Tiempo que sobrevive una imagen aparcada que nunca se convirtió en contacto. */
const STAGING_TTL_MS = Number(process.env.TOOLS_CARD_STAGING_TTL_MS || 24 * 60 * 60 * 1000);
const PURGE_EVERY_MS = 60 * 60 * 1000;

/** Los tokens son UUID v4: cualquier otra cosa no toca el disco. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
};

let lastPurgeAt = 0;

/**
 * Raíz de las imágenes de BADACO. Devuelve null si no hay servidor
 * configurado (en ese caso simplemente no se archiva nada).
 */
export function cardsRootPath() {
  const explicit = String(process.env.BADACO_FILES_ROOT || '').trim();
  if (explicit) return explicit.replace(/\\/g, '/').replace(/\/+$/, '');

  const host = String(process.env.BADACO_FILES_SERVER || process.env.DB_SERVER || '')
    .trim()
    .replace(/^[/\\]+|[/\\]+$/g, '');
  if (!host) return null;

  return `//${host}/BADACO`;
}

/** Extensión (sin punto) de un nombre de archivo, en minúsculas. */
function extensionOf(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function mimeFromName(name) {
  return MIME_BY_EXT[extensionOf(name)] || 'application/octet-stream';
}

/**
 * Nombre de archivo seguro: sin rutas, sin caracteres prohibidos en Windows y
 * siempre con una extensión de imagen soportada.
 */
export function sanitizeFileName(name) {
  let clean = Array.from(String(name || '').split(/[/\\]/).pop()) // el nombre, nunca la ruta
    .filter((char) => char.charCodeAt(0) > 31)                    // fuera caracteres de control
    .join('')
    .normalize('NFC')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  if (!MIME_BY_EXT[extensionOf(clean)]) {
    clean = clean.replace(/\.[^.]*$/, '') + '.jpg';
  }
  if (/^\.[A-Za-z0-9]+$/.test(clean)) {
    clean = 'card' + clean;   // el nombre original no aportaba nada usable
  }
  if (clean.length > 120) {
    const ext = extensionOf(clean);
    clean = clean.slice(0, 120 - (ext.length + 1)) + '.' + ext;
  }
  return clean || 'card.jpg';
}

function stagingPath(token) {
  const root = cardsRootPath();
  if (!root || !TOKEN_RE.test(String(token || ''))) return null;
  return `${root}/${STAGING_DIR}/${token}`;
}

/**
 * Borra las carpetas de staging caducadas. Se llama en segundo plano al
 * aparcar una imagen, como mucho una vez por hora.
 */
export async function purgeStaging(force = false) {
  const root = cardsRootPath();
  if (!root) return;
  if (!force && Date.now() - lastPurgeAt < PURGE_EVERY_MS) return;
  lastPurgeAt = Date.now();

  try {
    const base = `${root}/${STAGING_DIR}`;
    const entries = await readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !TOKEN_RE.test(entry.name)) continue;
      const dir = `${base}/${entry.name}`;
      try {
        const info = await stat(dir);
        if (Date.now() - info.mtimeMs > STAGING_TTL_MS) {
          await rm(dir, { recursive: true, force: true });
        }
      } catch (_) { /* otra petición ya la borró */ }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[Tools Cards] purgeStaging error:', error.message);
    }
  }
}

/**
 * Aparca la imagen recibida y devuelve el token con el que reclamarla.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<{token: string, fileName: string, size: number, mimeType: string}|null>}
 */
export async function stageCardImage(buffer, originalName) {
  const root = cardsRootPath();
  if (!root || !buffer?.length) return null;

  const token = randomUUID();
  const fileName = sanitizeFileName(originalName);

  try {
    const dir = `${root}/${STAGING_DIR}/${token}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${fileName}`, buffer);
    purgeStaging().catch(() => { /* la limpieza nunca bloquea */ });
    return { token, fileName, size: buffer.length, mimeType: mimeFromName(fileName) };
  } catch (error) {
    console.error('[Tools Cards] stageCardImage error:', error.message);
    return null;
  }
}

/**
 * Recupera una imagen aparcada. Devuelve null si el token no existe o ya
 * caducó (el usuario tardó más de STAGING_TTL_MS en enviar la fila).
 */
export async function readStagedFile(token) {
  const dir = stagingPath(token);
  if (!dir) return null;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const file = entries.find((entry) => entry.isFile());
    if (!file) return null;

    const buffer = await readFile(`${dir}/${file.name}`);
    return { buffer, fileName: file.name, size: buffer.length, mimeType: mimeFromName(file.name) };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[Tools Cards] readStagedFile error:', error.message);
    }
    return null;
  }
}

/** Tira la copia aparcada una vez guardada en su carpeta definitiva. */
export async function discardStaged(token) {
  const dir = stagingPath(token);
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.error('[Tools Cards] discardStaged error:', error.message);
  }
}

/**
 * Escribe la imagen en su carpeta definitiva (el id de `card_files`).
 *
 * @returns {Promise<string>} ruta completa del archivo
 */
export async function storeCardFile(cfId, fileName, buffer) {
  const root = cardsRootPath();
  if (!root) throw new Error('BADACO file server is not configured (DB_SERVER / BADACO_FILES_ROOT)');

  const safeName = sanitizeFileName(fileName);
  const dir = `${root}/${cfId}`;
  await mkdir(dir, { recursive: true });
  const fullPath = `${dir}/${safeName}`;
  await writeFile(fullPath, buffer);
  return fullPath;
}

/** Lee una imagen ya archivada a partir de su fila de `card_files`. */
export async function readStoredFile(record) {
  const root = cardsRootPath();
  const path = record?.file_path
    ? String(record.file_path).replace(/\\/g, '/')
    : (root && record?.cf_id ? `${root}/${record.cf_id}/${sanitizeFileName(record.file_name)}` : null);
  if (!path) return null;

  try {
    const buffer = await readFile(path);
    return { buffer, fileName: record.file_name, mimeType: record.mime_type || mimeFromName(record.file_name) };
  } catch (error) {
    console.error('[Tools Cards] readStoredFile error:', error.message);
    return null;
  }
}
