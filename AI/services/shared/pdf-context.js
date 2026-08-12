import { existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import {
  extractFromDocument,
  isSupportedDocument
} from '../../../Tools/services/office-extraction-service.js';

const MAX_PDF_FILES = Number(process.env.AI_CRM_MAX_PDFS || 8);
const MAX_PDF_BYTES = Number(process.env.AI_CRM_MAX_PDF_BYTES || (8 * 1024 * 1024));
const MAX_DOC_CONTEXT_CHARS = Number(process.env.AI_CRM_MAX_DOC_CHARS || 50000);
const MAX_DOC_CHARS_PER_FILE = Number(process.env.AI_CRM_MAX_DOC_CHARS_PER_FILE || 12000);

let pdfParserPromise = null;

export function trimContextText(text, maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxChars), truncated: true };
}

export function isSafeFilename(filename) {
  const value = String(filename || '').trim();
  return !!value && !/[/\\]/.test(value) && !value.includes('..');
}

export function isPdfFile(filename) {
  return /\.pdf$/i.test(String(filename || '').trim());
}

/**
 * Formatos cuyo texto se puede incorporar al contexto del asistente:
 * PDF mas los documentos ofimaticos que sabe leer office-extraction-service
 * (Word moderno, OpenDocument, RTF y texto plano).
 *
 * A diferencia de la traduccion, aqui NO hay OCR: un PDF escaneado o una
 * imagen no aportan texto, asi que las imagenes quedan fuera.
 */
export function isAiReadableFile(filename) {
  const value = String(filename || '').trim();
  return isPdfFile(value) || isSupportedDocument(value);
}

async function getPdfParser() {
  if (!pdfParserPromise) {
    pdfParserPromise = import('pdf-parse')
      .then((mod) => {
        const parserClass = mod?.PDFParse || mod?.default?.PDFParse || null;
        const parserFunction = typeof mod?.default === 'function' ? mod.default : null;
        return { parserClass, parserFunction };
      })
      .catch((err) => {
        console.error('[AI PDF] parser load error:', err);
        return null;
      });
  }
  return pdfParserPromise;
}

async function extractPdfText(buffer, parserApi) {
  if (!parserApi) {
    throw new Error('Parser API unavailable');
  }

  if (parserApi.parserClass) {
    const parser = new parserApi.parserClass({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        text: String(result?.text || ''),
        pages: Number(result?.total || 0)
      };
    } finally {
      try {
        await parser.destroy();
      } catch (_) {}
    }
  }

  if (typeof parserApi.parserFunction === 'function') {
    const result = await parserApi.parserFunction(buffer);
    return {
      text: String(result?.text || ''),
      pages: Number(result?.numpages || result?.total || 0)
    };
  }

  throw new Error('Unsupported parser API');
}

function buildDocumentKey(item) {
  const ref = item.id_msg ?? item.ref_id ?? item.id ?? 0;
  return String(ref) + '|' + String(item.filename || '').toLowerCase();
}

function normalizeCandidate(candidate) {
  return {
    id_msg: Number(candidate.id_msg ?? candidate.ref_id ?? candidate.id ?? 0),
    filename: String(candidate.filename || '').trim(),
    process: String(candidate.process || ''),
    source_label: String(candidate.source_label || ''),
    meta: candidate.meta || null
  };
}

export async function buildPdfContextFromCandidates(candidates, resolveFilePath) {
  const parserApi = await getPdfParser();
  const documents = [];
  const warnings = [];

  // Si falta el parser de PDF, los documentos ofimaticos siguen siendo
  // legibles: solo se avisa y se saltan los PDFs.
  const pdfAvailable = !!(parserApi && (parserApi.parserClass || parserApi.parserFunction));
  if (!pdfAvailable) {
    warnings.push('PDF parser is unavailable on the server.');
  }

  const normalized = (Array.isArray(candidates) ? candidates : []).map(normalizeCandidate);
  const dedup = new Map();
  for (const candidate of normalized) {
    const key = buildDocumentKey(candidate);
    if (!dedup.has(key)) dedup.set(key, candidate);
  }

  let selected = Array.from(dedup.values());
  if (selected.length > MAX_PDF_FILES) {
    warnings.push('Only the first ' + MAX_PDF_FILES + ' documents were processed due to safety limits.');
    selected = selected.slice(0, MAX_PDF_FILES);
  }

  const blocks = [];
  let usedChars = 0;
  let truncated = false;

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    const filename = item.filename;
    const idMsg = Number(item.id_msg || 0);

    if (!isSafeFilename(filename)) {
      documents.push({ id_msg: idMsg, filename, status: 'skipped_unsafe_name' });
      continue;
    }

    let resolved = null;
    try {
      resolved = await resolveFilePath(item);
    } catch (error) {
      console.error('[AI PDF] resolve path error:', error);
      resolved = null;
    }

    const filePath = resolved?.path || resolved?.fullPath || null;
    const sourceHost = resolved?.host || null;

    if (!filePath || !existsSync(filePath)) {
      documents.push({ id_msg: idMsg, filename, status: 'missing_file' });
      continue;
    }

    const stats = statSync(filePath);
    if (stats.size > MAX_PDF_BYTES) {
      documents.push({ id_msg: idMsg, filename, status: 'skipped_size_limit', size_bytes: stats.size });
      continue;
    }

    const isPdf = isPdfFile(filename);
    if (isPdf && !pdfAvailable) {
      documents.push({ id_msg: idMsg, filename, status: 'parser_unavailable' });
      continue;
    }
    if (!isPdf && !isSupportedDocument(filename)) {
      documents.push({ id_msg: idMsg, filename, status: 'unsupported_type' });
      continue;
    }

    try {
      const buffer = await readFile(filePath);
      // El PDF va por pdf-parse; Word/ODT/RTF/texto por el lector propio.
      const extracted = isPdf
        ? await extractPdfText(buffer, parserApi)
        : await extractFromDocument(buffer, filename);
      let text = String(extracted?.text || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (!text) {
        documents.push({ id_msg: idMsg, filename, status: 'empty_text' });
        continue;
      }

      let docTruncated = false;
      if (text.length > MAX_DOC_CHARS_PER_FILE) {
        text = text.slice(0, MAX_DOC_CHARS_PER_FILE);
        docTruncated = true;
      }

      const available = MAX_DOC_CONTEXT_CHARS - usedChars;
      if (available <= 0) {
        truncated = true;
        documents.push({ id_msg: idMsg, filename, status: 'skipped_global_limit' });
        break;
      }

      let chunk = text;
      if (chunk.length > available) {
        chunk = chunk.slice(0, available);
        truncated = true;
        docTruncated = true;
      }

      usedChars += chunk.length;
      const refLabel = item.source_label || ('msg_id=' + idMsg);
      blocks.push('[' + (isPdf ? 'PDF' : 'DOC') + ' ' + (i + 1) + '] file=' + filename +
        ' ' + refLabel + '\n' + chunk);

      documents.push({
        id_msg: idMsg,
        filename,
        status: 'ok',
        text: chunk,
        source_host: sourceHost,
        size_bytes: stats.size,
        extracted_chars: chunk.length,
        pages: Number(extracted?.pages || 0),
        truncated: docTruncated,
        process: item.process || undefined
      });

      if (usedChars >= MAX_DOC_CONTEXT_CHARS) {
        truncated = true;
        break;
      }
    } catch (err) {
      console.error('[AI PDF] extract error:', err);
      documents.push({ id_msg: idMsg, filename, status: 'parse_error' });
    }
  }

  return {
    documentContextText: blocks.join('\n\n---\n\n'),
    documents,
    warnings,
    truncated
  };
}
