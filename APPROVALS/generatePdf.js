import PDFDocumentWithTables from 'pdfkit-table';
import { JSDOM } from 'jsdom';

function drawFieldRow(doc, x, y, labelWidth, totalWidth, label, value, color='#000000', style=null, options = {}) {
    const paddingX = 6;
    const paddingY = 8;
    const valueWidth = totalWidth - labelWidth;
    const lineHeight = doc.currentLineHeight();
    const valueLines = (value || '').toString().split(/\n/);
    const rowHeight = Math.max(lineHeight, valueLines.length * lineHeight, options.minHeight || 0) + paddingY * 2;

    doc.save();
    doc.rect(x, y, labelWidth, rowHeight).fill('#f3f3f3');
    doc.restore();

    doc.strokeColor('#2e2e2e');
    doc.rect(x, y, totalWidth, rowHeight).stroke();
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + rowHeight).stroke();
    const valueFont = style === 'bold' ? 'Montserrat-Bold' : 'Montserrat';

    doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(options.labelFontSize || 8)
        .text(label.toUpperCase(), x + paddingX, y + paddingY, { width: labelWidth - paddingX * 2 });
    doc.font(valueFont).fillColor(color).fontSize(options.valueFontSize || 8)
        .text(value || '', x + labelWidth + paddingX, y + paddingY, { width: valueWidth - paddingX * 2 });

    return rowHeight;
}

function isNA(val) {
    if (val === null || val === undefined) return true;
    const s = String(val).trim();
    return s === '' || s.toLowerCase() === 'na' || s.toLowerCase() === 'n/a';
}

const ALLOWED_COLORS = ['#000000','#dc3545','#e67700','#c09300','#198754','#00586f','#0d6efd','#6f42c1','#d63384','#6c757d'];

function normalizeColor(hex) {
    if (!hex) return null;
    const c = hex.toLowerCase();
    const match = ALLOWED_COLORS.find(a => a.toLowerCase() === c);
    return match || null;
}

function parseHtmlToSegments(html) {

    html = (html || '')
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const dom = new JSDOM(html);

    const segments = [];

    function walk(node, style = {}) {

        if (node.nodeType === 3) {
            segments.push({
                text: node.nodeValue,
                bold: !!style.bold,
                underline: !!style.underline,
                color: style.color || null
            });
            return;
        }

        const next = { ...style };
        const tag = node.tagName?.toLowerCase();

        if (tag === 'b' || tag === 'strong')
            next.bold = true;

        if (tag === 'u')
            next.underline = true;

        if (tag === 'font')
            next.color = node.getAttribute('color');

        // Solo respetar BR explícitos
        if (tag === 'br') {
            segments.push({
                text: '\n',
                bold: false,
                underline: false,
                color: null
            });
        }

        [...node.childNodes].forEach(child =>
            walk(child, next)
        );
    }

    [...dom.window.document.body.childNodes]
        .forEach(node => walk(node));

    return segments;
}

function drawRichTextRow(doc, x, y, labelWidth, totalWidth, label, html, options = {}) {

    html = (html || '')
        .replace(/\u00A0/g, ' ')
        .trim();

    const labelPadding = 8;
    const valuePaddingX = 6;
    const valuePaddingY = 8;
    const valueWidth = totalWidth - labelWidth;
    const fontSize = options.valueFontSize || 8;

    const segments = parseHtmlToSegments(html);

    const plainText = segments
        .map(s => s.text)
        .join('');

    if (!plainText.trim()) {
        return 0;
    }

    doc.font('Montserrat')
        .fontSize(fontSize);

    const textHeight = doc.heightOfString(
        plainText,
        {
            width: valueWidth - (valuePaddingX * 2)
        }
    );

    const labelHeight = doc.heightOfString(
        label.toUpperCase(),
        {
            width: labelWidth - (labelPadding * 2)
        }
    );

    const rowHeight = Math.max(
        textHeight + (valuePaddingY * 2),
        labelHeight + (labelPadding * 2),
        options.minHeight || 35
    );

    // Fondo label
    doc.save();
    doc.rect(x, y, labelWidth, rowHeight).fill('#f3f3f3');
    doc.restore();

    // Bordes
    doc.strokeColor('#2e2e2e');
    doc.rect(x, y, totalWidth, rowHeight).stroke();

    doc.moveTo(x + labelWidth, y)
        .lineTo(x + labelWidth, y + rowHeight)
        .stroke();

    // Label
    doc.font('Montserrat-Bold')
        .fillColor('#2e2e2e')
        .fontSize(options.labelFontSize || 8)
        .text(
            label.toUpperCase(),
            x + labelPadding,
            y + labelPadding,
            {
                width: labelWidth - (labelPadding * 2)
            }
        );

    const runs = [];
    let current = null;

    segments.forEach(seg => {

        const key =
            (seg.bold ? 'B' : 'N') +
            '|' +
            (seg.color || '');

        if (
            current &&
            current.key === key
        ) {
            current.text += seg.text;
        } else {
            current = {
                key,
                text: seg.text,
                bold: seg.bold,
                color: seg.color
            };
            runs.push(current);
        }
    });

    const contentX = x + labelWidth + valuePaddingX;
    const contentY = y + valuePaddingY;
    const maxWidth = valueWidth - (valuePaddingX * 2);

    runs.forEach((run, index) => {

        const color =
            normalizeColor(run.color) ||
            '#000000';

        doc.font(
            run.bold
                ? 'Montserrat-Bold'
                : 'Montserrat'
        );

        doc.fillColor(color)
            .fontSize(fontSize);

        const last = index === runs.length - 1;

        if (index === 0) {
            doc.text(
                run.text,
                contentX,
                contentY,
                {
                    width: maxWidth,
                    continued: !last
                }
            );
        } else {
            doc.text(
                run.text,
                {
                    width: maxWidth,
                    continued: !last
                }
            );
        }
    });

    return rowHeight;
}

// Helper: two field rows side by side on the same row.
function drawSplitRow(doc, x, y, labelWidth, totalWidth, leftLabel, leftValue, rightLabel, rightValue, leftOpts = {}, rightOpts = {}) {
    const paddingX = 6;
    const paddingY = 8;
    const halfWidth = totalWidth / 2;
    const lineHeight = doc.currentLineHeight();
    const leftLines = (leftValue || '').toString().split(/\n/);
    const rightLines = (rightValue || '').toString().split(/\n/);
    const rowHeight = Math.max(lineHeight, leftLines.length * lineHeight, rightLines.length * lineHeight) + paddingY * 2;

    // Left label background
    doc.save();
    doc.rect(x, y, labelWidth, rowHeight).fill('#f3f3f3');
    doc.restore();
    // Right label background
    doc.save();
    doc.rect(x + halfWidth, y, labelWidth, rowHeight).fill('#f3f3f3');
    doc.restore();

    // Borders
    doc.strokeColor('#2e2e2e');
    doc.rect(x, y, totalWidth, rowHeight).stroke();
    // Centre divider
    doc.moveTo(x + halfWidth, y).lineTo(x + halfWidth, y + rowHeight).stroke();
    // Left label/value divider
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + rowHeight).stroke();
    // Right label/value divider
    doc.moveTo(x + halfWidth + labelWidth, y).lineTo(x + halfWidth + labelWidth, y + rowHeight).stroke();

    const leftValueFont  = leftOpts.style  === 'bold' ? 'Montserrat-Bold' : 'Montserrat';
    const rightValueFont = rightOpts.style === 'bold' ? 'Montserrat-Bold' : 'Montserrat';
    const leftValueWidth  = halfWidth - labelWidth;
    const rightValueWidth = halfWidth - labelWidth;

    doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(leftOpts.labelFontSize || 8)
        .text(leftLabel.toUpperCase(), x + paddingX, y + paddingY, { width: labelWidth - paddingX * 2 });
    doc.font(leftValueFont).fillColor(leftOpts.color || '#000000').fontSize(leftOpts.valueFontSize || 8)
        .text(leftValue || '', x + labelWidth + paddingX, y + paddingY, { width: leftValueWidth - paddingX * 2 });

    doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(rightOpts.labelFontSize || 8)
        .text(rightLabel.toUpperCase(), x + halfWidth + paddingX, y + paddingY, { width: labelWidth - paddingX * 2 });
    doc.font(rightValueFont).fillColor(rightOpts.color || '#000000').fontSize(rightOpts.valueFontSize || 8)
        .text(rightValue || '', x + halfWidth + labelWidth + paddingX, y + paddingY, { width: rightValueWidth - paddingX * 2 });

    return rowHeight;
}

// Helper: multiline key:value list rendered within single value cell; bold keys, normal values.
function drawDetailsRow(doc, x, y, labelWidth, totalWidth, label, pairs, options = {}) {
    const paddingX = 6;
    const paddingY = 4;
    const valueWidth = totalWidth - labelWidth;
    const lineHeight = doc.currentLineHeight();
    const rowsCount = pairs.length || 1; // at least one empty line
    const gap = options.gap !== undefined ? options.gap : 4; // vertical spacing between items
    const rowHeight = rowsCount * lineHeight + paddingY * 2 + (rowsCount > 1 ? (rowsCount - 1) * gap : 0);

    // Label cell background
    doc.save();
    doc.rect(x, y, labelWidth, rowHeight).fill('#f2f2f2');
    doc.restore();

    // Borders
    doc.strokeColor('#2e2e2e');
    doc.rect(x, y, totalWidth, rowHeight).stroke();
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + rowHeight).stroke();

    // Label text
    doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(options.labelFontSize || 8)
        .text(label.toUpperCase(), x + paddingX, y + paddingY, { width: labelWidth - paddingX * 2 });

    // Value cell content with aligned values: compute max key width
    const fontSize = options.valueFontSize || 8;
    doc.font('Montserrat-Bold').fontSize(fontSize);
    const keyWidths = pairs.map(([k, v]) => doc.widthOfString(`${k}:`));
    const maxKeyWidth = keyWidths.length ? Math.max(...keyWidths) : 0;
    const spacing = 8; // gap between key and value
    let lineY = y + paddingY;
    pairs.forEach(([k, v], idx) => {
        if (v === undefined || v === null || v === '') return; // skip empty
        // Draw key
        doc.font('Montserrat-Bold').fillColor('#000000').fontSize(fontSize)
           .text(`${k}:`, x + labelWidth + paddingX, lineY, { width: maxKeyWidth });
        // Draw value at aligned start
        doc.font('Montserrat').fillColor('#000000').fontSize(fontSize)
           .text(v, x + labelWidth + paddingX + maxKeyWidth + spacing, lineY, { width: valueWidth - (maxKeyWidth + spacing + paddingX * 2) });
        // Divider line & spacing (except after last rendered pair)
        if (idx < pairs.length - 1) {
            const dividerY = lineY + lineHeight + gap / 2;
            doc.strokeColor('#d0d0d0').moveTo(x + labelWidth, dividerY).lineTo(x + totalWidth, dividerY).stroke();
        }
        lineY += lineHeight + gap;
    });

    return rowHeight;
}

// Helper: two columns of key:value pairs side by side, each with its own sub-header.
function drawSplitDetailsRow(doc, x, y, labelWidth, totalWidth, mainLabel, leftTitle, leftPairs, rightTitle, rightPairs, options = {}) {
    const paddingX = 6;
    const paddingY = 6;
    const fontSize = options.valueFontSize || 8;
    const lineHeight = doc.currentLineHeight();
    const gap = options.gap !== undefined ? options.gap : 8;
    const subHeaderHeight = lineHeight + 6;
    const contentWidth = totalWidth - labelWidth;

    const leftVisible  = leftPairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
    const rightVisible = rightPairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
    const hasRight = rightVisible.length > 0;
    const halfContent = hasRight ? contentWidth / 2 : contentWidth;

    // Compute actual rendered height of a column accounting for text wrapping
    function computeColumnHeight(visible, colWidth) {
        if (!visible.length) return paddingY * 2;
        doc.font('Montserrat-Bold').fontSize(fontSize);
        const keyWidths = visible.map(([k]) => doc.widthOfString(`${k}:`));
        const maxKeyW = keyWidths.length ? Math.max(...keyWidths) : 0;
        const valSpacing = 6;
        const valWidth = colWidth - paddingX * 2 - maxKeyW - valSpacing;
        let totalH = paddingY;
        visible.forEach(([k, v], idx) => {
            doc.font('Montserrat-Bold').fontSize(fontSize);
            const keyH = doc.heightOfString(`${k}:`, { width: maxKeyW });
            doc.font('Montserrat').fontSize(fontSize);
            const valH = doc.heightOfString(String(v), { width: valWidth });
            totalH += Math.max(keyH, valH);
            if (idx < visible.length - 1) totalH += gap;
        });
        totalH += paddingY;
        return totalH;
    }

    const leftColH  = computeColumnHeight(leftVisible, halfContent);
    const rightColH = hasRight ? computeColumnHeight(rightVisible, halfContent) : 0;
    const rowHeight = subHeaderHeight + Math.max(leftColH, rightColH);

    // Main label background
    doc.save();
    doc.rect(x, y, labelWidth, rowHeight).fill('#f2f2f2');
    doc.restore();

    // Sub-header backgrounds
    doc.save();
    doc.rect(x + labelWidth, y, halfContent, subHeaderHeight).fill('#e0e8f0');
    doc.restore();
    if (hasRight) {
        doc.save();
        doc.rect(x + labelWidth + halfContent, y, halfContent, subHeaderHeight).fill('#e8f0e0');
        doc.restore();
    }

    // Outer border + main label divider
    doc.strokeColor('#2e2e2e');
    doc.rect(x, y, totalWidth, rowHeight).stroke();
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + rowHeight).stroke();
    // Centre column divider only when both columns are present
    if (hasRight) {
        doc.moveTo(x + labelWidth + halfContent, y).lineTo(x + labelWidth + halfContent, y + rowHeight).stroke();
    }
    // Sub-header divider line
    doc.strokeColor('#2e2e2e').moveTo(x + labelWidth, y + subHeaderHeight).lineTo(x + totalWidth, y + subHeaderHeight).stroke();

    // Main label text
    doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(options.labelFontSize || 8)
        .text(mainLabel.toUpperCase(), x + paddingX, y + paddingY, { width: labelWidth - paddingX * 2 });

    // Sub-header titles
    doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(fontSize)
        .text(leftTitle.toUpperCase(), x + labelWidth + paddingX, y + 3, { width: halfContent - paddingX * 2 });
    if (hasRight) {
        doc.font('Montserrat-Bold').fillColor('#2e2e2e').fontSize(fontSize)
            .text(rightTitle.toUpperCase(), x + labelWidth + halfContent + paddingX, y + 3, { width: halfContent - paddingX * 2 });
    }

    // Draw one column of key:value pairs with proper wrapping
    function drawColumn(visible, colX, colWidth) {
        if (!visible.length) return;
        doc.font('Montserrat-Bold').fontSize(fontSize);
        const keyWidths = visible.map(([k]) => doc.widthOfString(`${k}:`));
        const maxKeyW = keyWidths.length ? Math.max(...keyWidths) : 0;
        const valSpacing = 6;
        const valWidth = colWidth - paddingX * 2 - maxKeyW - valSpacing;
        let lineY = y + subHeaderHeight + paddingY;
        visible.forEach(([k, v], idx) => {
            doc.font('Montserrat-Bold').fontSize(fontSize);
            const keyH = doc.heightOfString(`${k}:`, { width: maxKeyW });
            doc.font('Montserrat').fontSize(fontSize);
            const valH = doc.heightOfString(String(v), { width: valWidth });
            const pairH = Math.max(keyH, valH);

            doc.font('Montserrat-Bold').fillColor('#000000').fontSize(fontSize)
               .text(`${k}:`, colX + paddingX, lineY, { width: maxKeyW });
            doc.font('Montserrat').fillColor('#000000').fontSize(fontSize)
               .text(String(v), colX + paddingX + maxKeyW + valSpacing, lineY, { width: valWidth });

            if (idx < visible.length - 1) {
                const divY = lineY + pairH + gap / 2;
                doc.strokeColor('#d0d0d0')
                   .moveTo(colX, divY).lineTo(colX + colWidth, divY).stroke();
            }
            lineY += pairH + gap;
        });
    }

    drawColumn(leftVisible,  x + labelWidth, halfContent);
    if (hasRight) {
        drawColumn(rightVisible, x + labelWidth + halfContent, halfContent);
    }

    return rowHeight;
}

// Build beneficiary bank detail pairs.
function buildBeneficiaryBankPairs(details, language = 'ENG') {
    if (!details) return [];
    const keys = [
        'cuenta_banco_beneficiario','cuenta_banco','direcion_beneficiario','banco_beneficiario', 'tipo_cuenta', 'pais_beneficiario',
        'SWIFT', 'IBAN', 'ABA', 'SORT','state_branch', 'beneficiary_address','cable_beneficiario','direccion', 
    ];
    const labelsENG = {
        cuenta_banco_beneficiario: 'Account Name', cuenta_banco: 'Account No.',banco_beneficiario: 'Bank',
        SWIFT: 'SWIFT', IBAN: 'IBAN', ABA: 'ABA', SORT: 'SORT', state_branch: 'State/Branch',
        beneficiary_address: 'Beneficiary Address', direcion_beneficiario: 'Ben. Address',
        cable_beneficiario: 'Cable', pais_beneficiario: 'Country', tipo_cuenta:'Account Type', direccion: 'Address'
    };
    const labelsES = {
        cuenta_banco_beneficiario: 'Nombre de Cuenta',banco_beneficiario: 'Banco',
        cuenta_banco: 'Cuenta Nº', SWIFT: 'SWIFT', IBAN: 'IBAN',ABA: 'ABA',SORT: 'SORT',
        state_branch: 'Sucursal/Estado', beneficiary_address: 'Dirección Beneficiario',
        direcion_beneficiario: 'Dirección de beneficiario',  cable_beneficiario: 'Cable',pais_beneficiario: 'País', tipo_cuenta:'Account Type', direccion: 'Dirección'
    };
    const labels = language === 'ES' ? labelsES : labelsENG;
    const pairs = [];
    keys.forEach(k => { if (details[k]) pairs.push([labels[k] || k, details[k]]); });
    return pairs;
}

// Build intermediary bank detail pairs.
function buildIntermediaryBankPairs(details, language = 'ENG') {
    if (!details) return [];
    const keys = [
        'cuenta_banco_intermediario','banco_intermediario','tipo_cuenta_intermediario',
        'pais_intermediario','SWIFT_banco_intermediario', 'IBAN_banco_intermediario',
        'ABA_banco_intermediario', 'SORT_banco_intermediario','state_branch_banco_intermediario',
        'cable_intermediario', 'direccion_banco_intermediario',
    ];
    const labelsENG = {
        banco_intermediario: 'Bank', tipo_cuenta_intermediario: 'Account Type',
        SWIFT_banco_intermediario: 'SWIFT', IBAN_banco_intermediario: 'IBAN',
        ABA_banco_intermediario: 'ABA', SORT_banco_intermediario: 'SORT',
        state_branch_banco_intermediario: 'State/Branch',
        cuenta_banco_intermediario: 'Account No.', cable_intermediario: 'Cable',
        direccion_banco_intermediario: 'Address', pais_intermediario: 'Country'
    };
    const labelsES = {
        banco_intermediario: 'Banco', tipo_cuenta_intermediario: 'Tipo de Cuenta',
        SWIFT_banco_intermediario: 'SWIFT', IBAN_banco_intermediario: 'IBAN',
        ABA_banco_intermediario: 'ABA', SORT_banco_intermediario: 'SORT',
        state_branch_banco_intermediario: 'Sucursal/Estado',
        cuenta_banco_intermediario: 'Cuenta Nº', cable_intermediario: 'Cable',
        direccion_banco_intermediario: 'Dirección', pais_intermediario: 'País'
    };
    const labels = language === 'ES' ? labelsES : labelsENG;
    const pairs = [];
    keys.forEach(k => { if (details[k]) pairs.push([labels[k] || k, details[k]]); });
    return pairs;
}


function drawSignatureSection(doc, x, y, totalWidth, data, language = 'ENG') {
    const roleMeta = [
        { key: 'solicitante', eng: 'Requester', es: 'Solicitante' },
        { key: 'verificador', eng: 'Verifier', es: 'Verificador' },
        { key: 'aprobador', eng: 'Approver', es: 'Aprovador' },
        { key: 'firmante', eng: 'Signer', es: 'Firmante' },
        { key: 'operador', eng: 'Operator', es: 'Operador' },
        { key: 'ejecutor', eng: 'Executer', es: 'Ejecutor' },
    ];
    const activeRoles = roleMeta.filter(r => data && data[r.key]);
    if (!activeRoles.length) return 0;

    const sectionHeight = 80;
    const paddingX = 10;
    const lineY = y + 48; // lower so lines sit mid-section
    const labelY = lineY + 10;

    // Background matches other label cells (#f3f3f3) for uniform look
    doc.save();
    doc.rect(x, y, totalWidth, sectionHeight).fill('#ffffff');
    doc.restore();

    // Border same style as other rows (#2e2e2e)
    doc.strokeColor('#2e2e2e').rect(x, y, totalWidth, sectionHeight).stroke();

    const segmentWidth = totalWidth / activeRoles.length;
    activeRoles.forEach((role, idx) => {
        const segX = x + idx * segmentWidth;

        // Signature line
        doc.moveTo(segX + paddingX, lineY).lineTo(segX + segmentWidth - paddingX, lineY).stroke();
        // Role label
        const label = language === 'ES' ? role.es : role.eng;
        doc.font('Montserrat').fontSize(9).fillColor('#000000')
            .text(label, segX, labelY, { width: segmentWidth, align: 'center' });
    });

    return sectionHeight; // no extra gap; outer border will enclose
}

function formatAmount(value) {
    if (value === undefined || value === null || value === '') return '';

    const parts = String(value).trim().split(/\s+/);

    if (parts.length < 2) return String(value);

    const currency = parts[0];
    const rawNumber = parts.slice(1).join('');
    const num = parseFloat(rawNumber.replace(/,/g, ''));
    if (isNaN(num)) return String(value);

    const formattedNumber = num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    return `${currency} ${formattedNumber}`;
}

export async function generateBeneficiaryPdf(data, language = 'ENG', approval = '', xheader) {
    return new Promise((resolve, reject) => {
        try {
            const options = { size: 'LETTER', layout: 'landscape', bufferPages: true, margins: { top: 60, bottom: 40, left: 50, right: 50 } };
            const doc = new PDFDocumentWithTables(options);
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // Assets & fonts
            const headerImagePath = `./public/${xheader}`;
            const headerImageWidth = 700;
            const headerImageHeight = 80;
            doc.registerFont('Montserrat', './public/font/Montserrat-Regular.ttf');
            doc.registerFont('Montserrat-Bold', './public/font/Montserrat-Bold.ttf');

            // Header
            if(xheader !== null){
            doc.image(headerImagePath, 20, 10, { width: headerImageWidth, height: headerImageHeight });
            }    

            const title = language === 'ES' ? 'FORMULARIO DE TRANSFERENCIA - ' : 'TRANSFER FORM - ';
            doc.fontSize(12).font('Montserrat-Bold').fillColor('#2e2e2e')
                .text(`${title}  ${data.company_name || ''}`, 45, 90, { align: 'center', width: doc.page.width - 90 });
            doc.moveDown(0.5);
            // Structured box
            const startY = doc.y;
            const x = 45;
            const totalWidth = doc.page.width - x - 45; // symmetrical margin
            const labelWidth = 110;
            let cursorY = startY;

            // Rows
            const lblDate = language === 'ES' ? 'Fecha de Solicitud' : 'Date of Application';
            const lblBankPayable = language === 'ES' ? 'Banco a Pagar' : 'Bank Payable';
            const lblBankDetails     = language === 'ES' ? 'Coordenadas Bancarias' : 'Bank Details';
            const lblBenBankDetails  = language === 'ES' ? 'Beneficiario'          : 'Beneficiary';
            const lblIntBankDetails  = language === 'ES' ? 'Intermediario'         : 'Intermediary';
            const lblConcept = language === 'ES' ? 'Concepto' : 'Concept';
            const lblAmount = language === 'ES' ? 'Monto a Pagar' : 'Amount To Be Paid';

            if (!isNA(data.request_date || data.fecha_solicitud)) {
                cursorY += drawFieldRow(doc, x, cursorY, labelWidth, totalWidth, lblDate, data.request_date || data.fecha_solicitud || '');
            }
            if (!isNA(data.banco)) {
                cursorY += drawFieldRow(doc, x, cursorY, labelWidth, totalWidth, lblBankPayable, data.banco || '', '#ff0000', 'bold');
            }

            // Bank details: beneficiary and intermediary side by side.
            const benPairs = buildBeneficiaryBankPairs(data, language).filter(([, v]) => !isNA(v));
            const intPairs = buildIntermediaryBankPairs(data, language).filter(([, v]) => !isNA(v));
            if (benPairs.length > 0 || intPairs.length > 0) {
                cursorY += drawSplitDetailsRow(doc, x, cursorY, labelWidth, totalWidth,
                    lblBankDetails, lblBenBankDetails, benPairs, lblIntBankDetails, intPairs, { gap: 8 });
            }

            if (!isNA(data.concepto)) {
                cursorY += drawRichTextRow(doc, x, cursorY, labelWidth, totalWidth, lblConcept, data.concepto || '', { minHeight: 35 });
            }
            if (!isNA(data.monto)) {
                cursorY += drawFieldRow(doc, x, cursorY, labelWidth, totalWidth, lblAmount, formatAmount(data.monto), '#1F497D', 'bold');
            }

            // Signatures section (if any flags true)
            cursorY += drawSignatureSection(doc, x, cursorY, totalWidth, data, language);

            // Outer border (surround entire box including signatures)
            doc.strokeColor('#2E4C5A');
            doc.rect(x, startY, totalWidth, cursorY - startY).stroke();

            doc.moveDown(2);

            // Footer / pagination
            const pages = doc.bufferedPageRange();
            for (let i = 0; i < pages.count; i++) {
                doc.switchToPage(i);
                // Repaint header on every page
            if(xheader !== null){
                doc.image(headerImagePath, 20, 10, { width: headerImageWidth, height: headerImageHeight });
            }
                const approvalText = language === 'ES' ? 'Aprobación' : 'Approval';
                doc.font('Montserrat-Bold').fontSize(9).fillColor('#24576E').text(`${approvalText} #${approval}`, doc.page.width - 200, 55, { align: 'left' });
                const oldBottom = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;
                const pageLabel = language === 'ES' ? 'Página' : 'Page';
                doc.font('Montserrat').fontSize(8).fillColor('#24576E').text(`${pageLabel} ${i + 1} / ${pages.count}`, 0, doc.page.height - 30, { align: 'center' });
                doc.page.margins.bottom = oldBottom;
            }

            doc.end();
        } catch (e) {
            reject(e);
        }
    });
}