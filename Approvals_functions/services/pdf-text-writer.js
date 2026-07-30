/* ============================================================
   PDF text writing — shared service
   ------------------------------------------------------------
   Logica comun para escribir texto dentro de un PDF (pdf-lib) y
   para el manejo de archivos/versiones. La usan APPROVALS (firma
   digital) y CRM (escritura de comentarios sin firma), por lo que
   no debe depender de tablas ni rutas de un modulo en particular.
   ============================================================ */
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile } from 'fs/promises';

export const MIN_TEXT_FONT_SIZE = 8;
export const MAX_TEXT_FONT_SIZE = 72;

const FILE_LOCKED_CODES = new Set(['EBUSY', 'EACCES', 'EPERM']);

export function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.connection?.remoteAddress
        || req.ip
        || 'unknown';
}

export function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function isFileLockedError(error) {
    return error && FILE_LOCKED_CODES.has(error.code);
}

export function isFileLockedCode(code) {
    return code === 'FILE_LOCKED';
}

export async function writeFileSafe(filePath, data) {
    try {
        await writeFile(filePath, data);
    } catch (err) {
        if (isFileLockedError(err)) {
            const e = new Error(`File is locked: ${filePath}`);
            e.code = 'FILE_LOCKED';
            throw e;
        }
        throw err;
    }
}

/**
 * Quita el sufijo de version de un nombre de archivo generado por el
 * viewer (`_signed_v3.pdf` en approvals, `_edited_v3.pdf` en CRM) para
 * volver al nombre original del documento.
 */
export function normalizeOriginalFilename(filename = '') {
    return String(filename).replace(/_(?:signed|edited)_v\d+(?=\.[^.]+$)/i, '');
}

export function parseHexColorToRgb(hexColor) {
    const raw = String(hexColor || '').trim().replace('#', '');
    const expanded = raw.length === 3
        ? raw.split('').map(ch => ch + ch).join('')
        : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
        return rgb(0.066, 0.066, 0.066);
    }
    const r = parseInt(expanded.slice(0, 2), 16) / 255;
    const g = parseInt(expanded.slice(2, 4), 16) / 255;
    const b = parseInt(expanded.slice(4, 6), 16) / 255;
    return rgb(r, g, b);
}

export function wrapLineByWidth(line, maxWidth, font, size) {
    if (!line) return [''];
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [line];

    const wrapped = [];
    let current = '';

    for (const ch of line) {
        const candidate = current + ch;
        if (current.length === 0 || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            current = candidate;
            continue;
        }
        wrapped.push(current);
        current = ch;
    }

    if (current.length > 0) {
        wrapped.push(current);
    }

    return wrapped.length > 0 ? wrapped : [''];
}

export function normalizeWriteLines(rawText, maxWidth, font, size) {
    const explicitLines = String(rawText || '').split('\n');
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return explicitLines;

    return explicitLines.flatMap((line) => wrapLineByWidth(line, maxWidth, font, size));
}

/**
 * Dibuja los textos recibidos del viewer sobre el documento pdf-lib.
 * Devuelve los writes realmente aplicados (ya normalizados/acotados),
 * para poder registrarlos en la auditoria del modulo que llama.
 */
export async function applyWritesToPdfDocument(pdfDoc, writes) {
    const safeWrites = Array.isArray(writes) ? writes : [];
    if (safeWrites.length === 0) return [];

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pageCount = pdfDoc.getPageCount();
    const appliedWrites = [];

    for (const rawWrite of safeWrites) {
        const text = String(rawWrite?.text ?? '').replace(/\r\n/g, '\n');
        if (!text.trim()) continue;

        const pageNumber = Math.min(pageCount, Math.max(1, Number(rawWrite?.page_number) || 1));
        const size = Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, Number(rawWrite?.font_size) || 12));
        const page = pdfDoc.getPage(pageNumber - 1);
        const { width, height } = page.getSize();

        const x = Math.min(width - 5, Math.max(0, Number(rawWrite?.position_x) || 0));
        const y = Math.min(height - 5, Math.max(0, Number(rawWrite?.position_y) || 0));
        const requestedBoxWidthRaw = Number(rawWrite?.box_width);
        const requestedBoxWidth = Number.isFinite(requestedBoxWidthRaw) && requestedBoxWidthRaw > 0
            ? requestedBoxWidthRaw
            : null;
        const availableWidth = Math.max(1, width - x - 2);
        const wrapWidth = Math.min(requestedBoxWidth || availableWidth, availableWidth);
        const color = parseHexColorToRgb(rawWrite?.color_hex);

        const lines = normalizeWriteLines(text, wrapWidth, helvetica, size);
        const lineHeight = size * 1.2;
        lines.forEach((line, idx) => {
            const drawY = Math.max(0, y - (idx * lineHeight));
            if (line.length === 0) return;
            page.drawText(line, {
                x,
                y: drawY,
                size,
                font: helvetica,
                color,
            });
        });

        appliedWrites.push({
            field_type: String(rawWrite?.field_type || 'text'),
            page_number: pageNumber,
            position_x: x,
            position_y: y,
            box_width: wrapWidth,
            font_size: size,
            text,
        });
    }

    return appliedWrites;
}

export { PDFDocument };