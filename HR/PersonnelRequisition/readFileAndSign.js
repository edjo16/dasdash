import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {getFormatedDateHours } from '../../Middleware/validateUserId.js';
import fs from 'fs/promises';
import path from 'path';
import res from 'express/lib/response.js';
export async function readFileAndSign(approval, estado, filePath, nombre, coments) {

    const addTextWithWrapping = (page, text, startX, startY, endY, maxChars, fontSize = 10, lineHeight = 10) => {
        let currentY = startY;
        let currentX = startX;

        if (!text) return currentY;

        const words = text.split(' ');
        let currentLine = '';
        let currentLineChars = 0;
        let linesDrawn = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordLength = word.length;

            if (currentLineChars + wordLength + (currentLine ? 1 : 0) > maxChars && currentLine !== '') {
                page.drawText(currentLine.trim(), {
                    x: currentX,
                    y: currentY,
                    size: fontSize
                });

                currentY -= lineHeight;
                linesDrawn++;
                currentLine = word;
                currentLineChars = wordLength;

                if (currentY <= endY) {
                    return currentY;
                }
            } else {
                currentLine = currentLine ? `${currentLine} ${word}` : word;
                currentLineChars += wordLength + (currentLine ? 1 : 0);
            }
        }

        if (currentLine) {
            page.drawText(currentLine.trim(), {
                x: currentX,
                y: currentY,
                size: fontSize,
            });
            linesDrawn++;
        }
        return currentY;
    };
   
    if (estado !== "Rejected") {
        const pdfBytes = await fs.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const page = pdfDoc.getPages()[1];
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const date = getFormatedDateHours();

        let mensaje = '';

        if (estado == "Verified") {
            mensaje = `This request has been supported by ${nombre} with Approval ${approval} and date ${date}`;
            addTextWithWrapping(page, mensaje, 332, 376, 350, 48);

        } if (estado == "Approved") {
            mensaje = `This request has been financially approved by ${nombre} with Approval ${approval} and date ${date}`;
            addTextWithWrapping(page, mensaje, 75, 312, 280, 48);
            addTextWithWrapping(page, coments, 332, 314, 290, 48);

        } if (estado == "Signed") {
            mensaje = `This request has been approved by ${nombre} with Approval ${approval} and date ${date}`;
            addTextWithWrapping(page, mensaje, 75, 250, 230, 48);
            addTextWithWrapping(page, coments, 332, 250, 220, 48);
        }
        const updatedPdfBytes = await pdfDoc.save();
        // Update File is saved in the same folder
        let principalFilePath = filePath.split("Personnel Requisition Form")[0]+"Personnel Requisition Form";
        const filePathNew = principalFilePath +  " - " + estado + ".pdf";
        const dir = path.dirname(filePathNew);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePathNew, updatedPdfBytes);
        return {result: "Success"};
    } else{
        return {result: "No acction needed"};
    }
}