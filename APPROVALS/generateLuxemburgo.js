import PDFDocument from 'pdfkit';

export const getFormatedDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  date.setMinutes(date.getMinutes() - offset);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  return `${day}/${month}/${year} ${strHours}:${minutes}:${seconds} ${ampm}`;
};

function parsePlainTextSansTables(html) {
  if (!html || typeof html !== 'string') return [];
  html = html.replace(/<table[\s\S]*?<\/table>/gi, '');
  html = html.replace(/<th[\s\S]*?<\/th>/gi, '');
  html = html.replace(/<td[\s\S]*?<\/td>/gi, '');
  html = html.replace(/<tr[\s\S]*?<\/tr>/gi, '');
  const segments = [];
  const stack = [];
  const tokenRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  let match;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[4] !== undefined) {
      let text = match[4].replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ');
      segments.push({ text, bold: stack.includes('bold'), color: null, trailingSpace: false });
    } else {
      const isClose = match[1] === '/';
      const tag = match[2].toLowerCase();
      if (['b', 'strong'].includes(tag)) {
        if (isClose) { const i = stack.lastIndexOf('bold'); if (i >= 0) stack.splice(i, 1); }
        else stack.push('bold');
      } else if (['p', 'br', 'div'].includes(tag) && !isClose) {
        segments.push({ text: ' ', bold: false, color: null });
      } else if (tag === 'li' && !isClose) {
        segments.push({ text: ' • ', bold: false, color: null });
      } else if (['h1','h2','h3','h4','h5','h6'].includes(tag) && !isClose) {
        stack.push('bold');
      } else if (['h1','h2','h3','h4','h5','h6'].includes(tag) && isClose) {
        const i = stack.lastIndexOf('bold'); if (i >= 0) stack.splice(i, 1);
        segments.push({ text: ' ', bold: false, color: null });
      }
    }
  }
  return segments;
}

const CURRENCY_NAMES = { 'USD': 'dólares', 'EUR': 'euros', 'GBP': 'libras esterlinas' };
const _unidades = ['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
const _teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
const _decenas = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const _centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

function _numberToWords(n) {
  if (n === 0) return 'cero';
  if (n === 100) return 'cien';
  let result = '';
  if (n >= 1000000) {
    const millones = Math.floor(n / 1000000);
    result += (millones === 1 ? 'un millón' : _numberToWords(millones) + ' millones');
    n %= 1000000;
    if (n > 0) result += ' ';
  }
  if (n >= 1000) {
    const miles = Math.floor(n / 1000);
    result += (miles === 1 ? 'mil' : _numberToWords(miles) + ' mil');
    n %= 1000;
    if (n > 0) result += ' ';
  }
  if (n >= 100) {
    if (n === 100) { result += 'cien'; return result; }
    result += _centenas[Math.floor(n / 100)];
    n %= 100;
    if (n > 0) result += ' ';
  }
  if (n >= 10 && n <= 19) {
    result += _teens[n - 10];
    return result;
  }
  if (n >= 20 && n <= 29) {
    result += (n === 20 ? 'veinte' : 'veinti' + _unidades[n - 20]);
    return result;
  }
  if (n >= 30) {
    result += _decenas[Math.floor(n / 10)];
    n %= 10;
    if (n > 0) result += ' y ';
  }
  if (n > 0) {
    result += _unidades[n];
  }
  return result;
}

export function montoEnPalabras(amount, currencyCode) {
  if (!amount || isNaN(amount)) return '';
  const num = Math.abs(parseFloat(amount));
  const entero = Math.floor(num);
  const decimales = Math.round((num - entero) * 100);
  const monedaNombre = CURRENCY_NAMES[currencyCode] || currencyCode || '';
  let texto = _numberToWords(entero);
  texto = texto.charAt(0).toUpperCase() + texto.slice(1);
  if (decimales > 0) {
    texto += ' con ' + String(decimales).padStart(2, '0') + '/100';
  }
  texto += ' ' + monedaNombre;
  return texto;
}

function getCurrentDateSpanish() {
  const meses = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre',
  ];
  const date = new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = meses[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

function drawStyledText(doc, segments, x, y, width, fontSize = 10, lineGap = 6) {
  const words = [];

  segments.forEach((seg) => {
    const text = String(seg?.text || '');
    if (!text) return;

    const chunkWords = text.split(/\s+/).filter(w => w.length > 0);
    chunkWords.forEach((word) => {
      doc.font(seg.bold ? 'Montserrat-Bold' : 'Montserrat').fontSize(fontSize);
      words.push({
        text: word,
        bold: Boolean(seg.bold),
        width: doc.widthOfString(word),
      });
    });
  });

  if (!words.length) return y;

  doc.font('Montserrat').fontSize(fontSize);
  const spaceWidth = doc.widthOfString(' ');
  const lines = [];
  let currentLine = [];
  let currentWordsWidth = 0;

  words.forEach((word) => {
    if (!currentLine.length) {
      currentLine.push(word);
      currentWordsWidth = word.width;
      return;
    }

    const nextLineWidth = currentWordsWidth + (currentLine.length * spaceWidth) + word.width;
    if (nextLineWidth <= width) {
      currentLine.push(word);
      currentWordsWidth += word.width;
    } else {
      lines.push({ words: currentLine, wordsWidth: currentWordsWidth });
      currentLine = [word];
      currentWordsWidth = word.width;
    }
  });

  if (currentLine.length) {
    lines.push({ words: currentLine, wordsWidth: currentWordsWidth });
  }

  let currentY = y;
  const lineHeight = fontSize + lineGap;

  lines.forEach((line, lineIndex) => {
    const isLastLine = lineIndex === lines.length - 1;
    const gapCount = line.words.length - 1;
    const gapWidth = (!isLastLine && gapCount > 0)
      ? (width - line.wordsWidth) / gapCount
      : spaceWidth;

    let currentX = x;
    line.words.forEach((word, wordIndex) => {
      doc
        .font(word.bold ? 'Montserrat-Bold' : 'Montserrat')
        .fontSize(fontSize)
        .fillColor('#000000')
        .text(word.text, currentX, currentY, { lineBreak: false });

      currentX += word.width;
      if (wordIndex < line.words.length - 1) {
        currentX += gapWidth;
      }
    });

    currentY += lineHeight;
  });

  return currentY;
}

function drawLabelValue(doc, label, value, x, y, valueX) {
  if (!value) return y;
  doc.font('Montserrat-Bold').fontSize(10).fillColor('#000000').text(label, x, y);
  doc.font('Montserrat').fontSize(10).fillColor('#000000').text(value, valueX, y);
  return y + 18;
}

export async function generateLuxemburgo(data, transactionDetail) {
  const td = transactionDetail || {};

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'portrait',
        bufferPages: true,
        margins: { top: 60, bottom: 60, left: 72, right: 72 },
      });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.registerFont('Montserrat', './public/font/Montserrat-Regular.ttf');
      doc.registerFont('Montserrat-Bold', './public/font/Montserrat-Bold.ttf');

      const pageW = doc.page.width;
      const marginX = 72;
      const contentW = pageW - marginX * 2;
      const labelX = 200;

      // Header
      if (td.xheader) {
        try {
          doc.image(`./public/${td.xheader}`, 20, 10, {
            width: pageW - 40, height: 80,
          });
        } catch (_) {}
      }

      let y = 90;

      // Date (right-aligned)
      doc.font('Montserrat').fontSize(10).fillColor('#000000');
      doc.text(getCurrentDateSpanish(), marginX, y, { align: 'right', width: contentW });

      // Bank address block
      y = 120;
      doc.font('Montserrat').fontSize(10)
        .text('Banque BPP SA', marginX, y)
        .text('30, boulevard Royal', marginX, y + 16)
        .text('L-2449', marginX, y + 32)
        .text(`IBAN: ${td.iban}` || '', marginX, y + 58);

      y += 90;

      // Salutation
      doc.text('Estimados Señores,', marginX, y);
      y += 22;

      // Authorization paragraph with styled bold/normal segments
      const cuenta_bancaria = td.account_number || data.cuenta_bancaria || '';
      const correspondienteSegments = parsePlainTextSansTables(data.correspondiente);
      const hasRichCorrespondiente = correspondienteSegments.length > 0;
      const mensajeSegments = [
        { text: 'Autorizamos que se procese de nuestra cuenta bancaria', bold: false },
        { text: `No. ${cuenta_bancaria}`, bold: true },
        { text: 'una transferencia bancaria por el monto de', bold: false },
        { text: `${data.monto || ''} (${data.monto_texto || ''})`, bold: true },
        { text: 'a favor de', bold: false },
        { text: `${data.a_favor_de || ''},`, bold: true },
        { text: 'correspondiente a', bold: false },
        ...(hasRichCorrespondiente
          ? (function(){ var segs = correspondienteSegments.slice(); var last = segs[segs.length-1]; if(last) { last.text = ((last.text || '').trimRight() || '') + '.'; } return segs; })()
          : [{ text: `${data.correspondiente || ''}.`, bold: true, color: null }]),
      ];
      y = drawStyledText(doc, mensajeSegments, marginX, y, contentW, 10, 6);

      // Second paragraph
      y += 6;
      doc.font('Montserrat').fontSize(10).fillColor('#000000');
      doc.text('A continuación, detallamos información bancaria para que puedan emitir dicha transferencia.', marginX, y, { width: contentW });
      y += 32;

      // Beneficiary bank details
      y = drawLabelValue(doc, 'Banco Beneficiario:', data.banco_beneficiario, marginX, y, labelX);
      y = drawLabelValue(doc, 'Dirección Beneficiario:', data.direcion_beneficiario, marginX, y, labelX);

      if (data.moneda !== 'GBP') {
        y += 6
        y = drawLabelValue(doc, 'SWIFT:', data.SWIFT, marginX, y, labelX);
      }
      if (data.moneda === 'USD') {
        y = drawLabelValue(doc, 'SORT:', data.SORT, marginX, y, labelX);
      }
      y = drawLabelValue(doc, 'IBAN:', data.IBAN, marginX, y, labelX);
      y = drawLabelValue(doc, 'Beneficiario:', data.cuenta_banco_beneficiario, marginX, y, labelX);

      y = drawLabelValue(doc, 'Cuenta del beneficiario:', data.cuenta_banco, marginX, y, labelX);
      
      if (data.moneda !== 'GBP') {
        y += 6
        y = drawLabelValue(doc, 'Dirección:', data.direccion, marginX, y, labelX);
      }

      // Signature block
      y += 60;
      doc.font('Montserrat').fontSize(10).text('Atentamente,', marginX, y);
      y += 20;
      doc.text(td.xnombre_legal || '', marginX, y);
      y += 40;
      doc.text('__________________________________', marginX, y);
      y += 14;
      doc.text('p.p.                                     p.p.', marginX, y);

      // Footer & header on every page
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        if (td.xheader) {
          try {
            doc.image(`./public/${td.xheader}`, 20, 10, {
              width: pageW - 40, height: 80,
            });
          } catch (_) {}
        }
        if (td.xfooter) {
          try {
            doc.image(`./public/${td.xfooter}`, 20, doc.page.height - 100, {
              width: pageW - 40, height: 80,
            });
          } catch (_) {}
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
