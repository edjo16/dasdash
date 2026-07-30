import PDFDocumentWithTables from 'pdfkit-table';
import {getFormatedDateHours} from '../Middleware/validateUserId.js';

export function addGeneralInfo(doc, data) {
    const date = getFormatedDateHours()
    doc.moveDown(1);
    const table = {
        headers: ['', ''],
        rows: [
            ['Application Name', data.application_name],
            ['Request Date', `${date} GMT-0`],
            ['Priority', data.priority],
            ['Collaborator Name', data.solicitante],
            ['Collaborator Position', data.collaborator_position],
            ['Collaborator Department', data.collaborator_department],
            ['Type', data.type],
            ['Title', data.title],
        ]
    };

    doc.table(table, {                
        width: 450,
        columnsSizes: [180, 270],
        y: doc.y,
        hideHeader: true,
        divider: { horizontal: { opacity: 0.1 } },
        prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
            doc.font('Montserrat-Bold');
            if (indexColumn !== 0) {
                doc.font('Montserrat');
            }
        }
    });
    doc.moveDown(1);
}
export function checkAndAddPage(doc, threshold) {
    if (doc.y + threshold > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
    }
}

export async function generatePDF(data, approval, verificador, aprobador, id) {
  return new Promise(async (resolve, reject) => {
      const options = { paragraphGap: "1.2", size: 'LETTER', bufferPages: true, type: "Pagination", margins: { top: 90, bottom: 0, left: 50, right: 50 } };

      const doc = new PDFDocumentWithTables({ ...options });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
      });

      const headerImagePath = './public/header.png';
      const headerImageWidth = 612;
      const headerImageHeight = 90;
      doc.image(headerImagePath, 20, 10, { width: headerImageWidth, height: headerImageHeight });
      doc.registerFont('Montserrat', './public/font/Montserrat-Regular.ttf');
      doc.registerFont('Montserrat-Bold', './public/font/Montserrat-Bold.ttf');

      doc.fontSize(18).font('Montserrat-Bold').fillColor('#00586F').text(`Change Request #${id}`, 60, 100, { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(14).font('Montserrat-Bold').fillColor('#0000').text('Event Information', 60, 135).font('Montserrat');
      addGeneralInfo(doc, data);
    if(data.report){
      checkAndAddPage(doc,120);
      doc.fontSize(14).font('Montserrat-Bold').text('Report Estructure').moveDown(1);
      doc.fontSize(8).font('Montserrat').text(data.report);
      doc.moveDown(2);
      }

    if(data.fields){
      checkAndAddPage(doc,120);
      doc.fontSize(14).font('Montserrat-Bold').text('Fields').moveDown(1);
      doc.fontSize(8).font('Montserrat').text(data.fields);
      doc.moveDown(2);
    }

    if(data.functions){
      checkAndAddPage(doc,120);
      doc.fontSize(14).font('Montserrat-Bold').text('Functions').moveDown(1);
      doc.fontSize(8).font('Montserrat').text(data.functions);
      doc.moveDown(2);
    }

    if(data.comments){
      checkAndAddPage(doc,120);
      doc.fontSize(14).font('Montserrat-Bold').text('Additional Comments').moveDown(1);
      doc.fontSize(8).font('Montserrat').text(data.comments);
      doc.moveDown(2);
    }
    checkAndAddPage(doc,120);
    doc.strokeColor('#b4b4b4').roundedRect(45, doc.y+5, 480 + 40, 60 + 10, 10).stroke()
    doc.moveDown(1.5);
    doc.font('Montserrat-Bold').text('Authorization of changes', { align: 'left', continued: false }).moveDown(2);
    doc.font('Montserrat').text('Changes Authorized by: ', { width: 540, x: 80, y: doc.y+5, align: 'left', continued: true })
       .text('    ___________________________    ', { continued: true })
       .text('Signature: ', { width: 100, x: 350, y: doc.y+5, align: 'left', continued: true })
       .text('     __________________________     ', { continued: true })
       .text('Date: ', { width: 100, x: 360, y: doc.y+5, align: 'left', continued: true })
       .text('     __________________     ');
       const originalX = doc.x;
       doc.text(`${verificador !== "N/A"? verificador : aprobador}`, 185, doc.y - 17, { width: 100 }); 
       doc.x = originalX;
      doc.moveDown(4);

      checkAndAddPage(doc,200);
      doc.strokeColor('#b4b4b4').roundedRect(45, doc.y+5 - 5, 480 + 40, 130 + 10, 10).stroke()
      doc.moveDown(1);
      doc.font('Montserrat-Bold').text('Development',{ align: 'left',continued: false })
      doc.moveDown(2);
      doc.font('Montserrat').text('Programmed by: ', {width:540, x: 80, y: doc.y+5, align: 'left', continued: true }).text('    ___________________________    ',{ continued: true })
      .text('Signature: ', { width:100, x: 350, y: doc.y+5, align: 'left', continued: true }).text('     __________________________     ',{ continued: true })
      .text('Date: ', { width:100, x: 360, y: doc.y+5, align: 'left', continued: true}).text('     _________________________     ')
      doc.moveDown(1);
      doc.text('Observations: ', {width:540, x: 80, y: doc.y+5, align: 'left'})
      doc.strokeColor('#b4b4b4').roundedRect(110, doc.y, 400 + 40, 50 + 10, 10, 10).stroke();
      doc.moveDown(9);

      checkAndAddPage(doc,200);
      doc.strokeColor('#b4b4b4').roundedRect(45, doc.y+5 - 5, 480 + 40, 130 + 10, 10).stroke()
      doc.moveDown(1); 
      doc.font('Montserrat-Bold').text('Acceptance of evidence',{ align: 'left',continued: false })
      doc.moveDown(2);
      doc.font('Montserrat').text('Changes tested by: ', {width:540, x: 80, y: doc.y+5, align: 'left', continued: true }).text('    ___________________________    ',{ continued: true })
      .text('Signature: ', { width:100, x: 350, y: doc.y+5, align: 'left', continued: true }).text('     __________________________     ',{ continued: true })
      .text('Date: ', { width:100, x: 360, y: doc.y+5, align: 'left', continued: true}).text('     _________________________     ')
      doc.moveDown(1);
      doc.text('Observations: ', {width:540, x: 80, y: doc.y+5, align: 'left'})
      doc.strokeColor('#b4b4b4').roundedRect(110, doc.y, 400 + 40, 50 + 10, 10, 10).stroke();
      doc.moveDown(9);

      checkAndAddPage(doc,200);
      doc.strokeColor('#b4b4b4').roundedRect(45, doc.y+5 - 5, 480 + 40, 60 + 10, 10).stroke();
      doc.moveDown(1); 
      doc.font('Montserrat-Bold').text('Approval to go into production',{align: 'left',continued: false }).moveDown(2);
      doc.font('Montserrat').text('Deploy Approved by: ', {width:540, x: 80, y: doc.y+5, align: 'left', continued: true }).text('    ___________________________    ',{ continued: true })
      .text('Signature: ', { width:100, x: 350, y: doc.y+5, align: 'left', continued: true }).text('     __________________________     ',{ continued: true })
      .text('Date: ', { width:450, x: 360, y: doc.y+5, align: 'left', continued: true}).text('     _______________________     ')

      let pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);

          doc.image(headerImagePath, 20, 0, { width: headerImageWidth, height: headerImageHeight });
          doc.font('Montserrat-Bold').fontSize(10).fillColor('#24576E').text(`Approval #${approval}`, doc.page.width - 160, 50, { align: 'left' });
          let oldBottomMargin = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;

          doc.font('Montserrat-Bold').fontSize(8).fillColor('#24576E')
              .text(
                  `Page: ${i + 1} of ${pages.count}`,
                  0,
                  doc.page.height - 30,
                  { align: 'center' }
              );
          doc.page.margins.bottom = oldBottomMargin;
      }

      doc.end();
  });
}
