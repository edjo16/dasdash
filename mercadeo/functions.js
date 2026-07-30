import PDFDocumentWithTables from 'pdfkit-table';
function formatCurrency(value) { 
  return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
  export function compareEventData(initial, current) {
    // Part 1: Compare the general fields of the event
    const changes = {
      eventChanges: {},
      participantsChanges: {
        toAdd: [],
        toUpdate: [],
        toRemove: []
      },
      meetingsChanges: {
        toAdd: [],
        toUpdate: [],
        toRemove: []
      }
    };
  
    // Compare the general fields of the event
    const eventFields = ['objective','participants_number','start_date','end_date','estimated_budget','comments'];
    eventFields.forEach(field => {
      if (initial.formData[field] !== current[field]) {
        changes.eventChanges[field] = { initial: initial.formData[field], current: current[field] };
      }
    });
  
    // Part 2: Compare participants
    const initialParticipants = initial.participants;
    const currentParticipants = current.participants;
  
    // Identify participants to add, update, or remove
    currentParticipants.forEach(curr => {
      const initialParticipant = initialParticipants.find(p => p.id === curr.id);
      if (!initialParticipant) {
        // New participant
        changes.participantsChanges.toAdd.push(curr);
      } else if (JSON.stringify(initialParticipant) !== JSON.stringify(curr)) {
        // Existing participant with changes
        changes.participantsChanges.toUpdate.push({ initial: initialParticipant, current: curr });
      }
    });
  
    initialParticipants.forEach(init => {
      const currentParticipant = currentParticipants.find(p => p.id === init.id);
      if (!currentParticipant) {
        // Removed participant
        changes.participantsChanges.toRemove.push(init);
      }
    });
  
    // Part 3: Compare meetings
    const initialMeetings = initial.meetings || [];
    const currentMeetings = current.meetings;
    if(currentMeetings.length > 0) {
    // Identificar reuniones a agregar, actualizar o eliminar
    currentMeetings.forEach(curr => {
      const initialMeeting = initialMeetings.find(m => m.id === curr.id);
      if (!initialMeeting) {
        // New meeting
        changes.meetingsChanges.toAdd.push(curr);
      } else if (JSON.stringify(initialMeeting) !== JSON.stringify(curr)) {
        // Existing meeting with changes
        changes.meetingsChanges.toUpdate.push({ initial: initialMeeting, current: curr });
      }
    });
  
    initialMeetings.forEach(init => {
      const currentMeeting = currentMeetings.find(m => m.id === init.id);
      if (!currentMeeting) {
        // Removed meeting
        changes.meetingsChanges.toRemove.push(init);
      }
    });
    }
    return changes;
  }
  export function addGeneralInfo(doc, data) {
      doc.moveDown(1);
      const table = {
          headers: ['', ''],
          rows: [
              ['Category', data.category],
              ['country', data.country],
              ['City', data.city],
              ['Objective', data.objective],
              ...(data.event_name ? [['Event Name', data.event_name]] : []),
              ['Estimated Budget', formatCurrency(data.estimated_budget)],
              ['Participants Number', data.participants_number],
              ['Start Date', data.start_date],
              ['End Date', data.end_date],        
              ['Comments', data.comments || ' '],
          ]
      };
  
      doc.table(table, {                
          width: 450,
          columnsSizes: [160, 290],
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
  export function addMeetings(doc, meetings) {
      const meetingsNumber = meetings.length-1;
      doc.moveDown(1.5);
      for (let i = 0; i <= Number(meetingsNumber); i++) {
  
          const meetingInfo = [
              [`Meeting # ${i+1}`, ` `]
          ];
              meetingInfo.push(
                  ['Meeting Name', meetings[i].meeting_name || ' '],
                  ['Meeting Address', meetings[i].meeting_address || ' '],
                  ['Meeting Comments', meetings[i].meeting_comments || ' '],
              );
  
          const table = {
              headers: ['', ''],
              rows: meetingInfo
          };
  
          if (doc.y + 100 > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
          }
  
          doc.table(table, { columnsSizes: [160, 290], x: 0, y: doc.y, width: 450, hideHeader: true, divider: { horizontal: { opacity: 0.1 } },
              prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                  doc.font('Montserrat-Bold');
                  doc.fillColor('#00586F'); 
                  doc.fontSize(10);
                  if (indexRow !== 0) {
                      doc.fillColor('#0000');
                      doc.fontSize(8);
                  }
                  if (indexColumn !== 0) {
                  doc.font('Montserrat');
              } }});
          doc.moveDown(0.4);
      }
      doc.moveDown(1);
  }
  export function addParticipants(doc, participants) {
      const participantsNumber = participants.length -1;
      console.log(participantsNumber);
      doc.moveDown(1.5);
      for (let i = 0; i <= Number(participantsNumber); i++) {
          const ParticipantInfo = [];
              ParticipantInfo.push(
                  [`Participant #${i+1} `, participants[i].name || ' '],
              );
  
          const table = {
              headers: ['', ''],
              rows: ParticipantInfo
          };
  
          if (doc.y + 100 > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
          }
  
          doc.table(table, { columnsSizes: [160, 290], x: 0, y: doc.y, width: 450, hideHeader: true, divider: { horizontal: { opacity: 0.1 } },
              prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                  doc.font('Montserrat-Bold');
                  doc.fontSize(8);
                  if (indexRow !== 0) {
                      doc.fillColor('#0000');
                      doc.fontSize(8);
                  }
                  if (indexColumn !== 0) {
                  doc.font('Montserrat');
              } }});
      }
      doc.moveDown(1);
  }
  export function checkAndAddPage(doc, threshold) {
      if (doc.y + threshold > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
      }
  }
  export async function generatePdf(data, approval, approver) {
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
  
        doc.fontSize(18).font('Montserrat-Bold').fillColor('#00586F').text(data.category, 60, 100, { align: 'center' });
        doc.moveDown(1);
  
        doc.fontSize(14).font('Montserrat-Bold').fillColor('#0000').text('Event Information', 60, 135).font('Montserrat');
        addGeneralInfo(doc, data);
        if(data.participants && data.participants !== '[]'){
          doc.fontSize(14).font('Montserrat-Bold').text('Participants', { continued: true })
          const participants = typeof data.participants === 'string' ? JSON.parse(data.participants) : data.participants;
          addParticipants(doc, participants);
        }
        checkAndAddPage(doc,200);
        if(data.meetings && data.meetings !== '[]'){
          doc.fontSize(14).font('Montserrat-Bold').text('Meetings', { continued: true })
          const meetings = typeof data.meetings === 'string' ? JSON.parse(data.meetings) : data.meetings;
          addMeetings(doc, meetings);
        }
        checkAndAddPage(doc,100);
        doc.moveDown(2);
        doc.strokeColor('#b4b4b4').roundedRect(45, doc.y+5 - 5, 480 + 40, 70 + 10, 10).stroke()
        doc.moveDown(1);
        doc.font('Montserrat-Bold').text('Approval Signature',{ align: 'left',continued: false })
        doc.moveDown(3);
        doc.font('Montserrat').text('Approved by: ', {width:540, x: 80, y: doc.y+5, align: 'left', continued: true }).text('    ___________________________    ')
        doc.text(`${approver}`, 130, doc.y + 5, { width: 100 }); 
        doc.moveDown(5);

        let pages = doc.bufferedPageRange();

        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
  
            doc.image(headerImagePath, 20, 0, { width: headerImageWidth, height: headerImageHeight });
            doc.fontSize(10).fillColor('#24576E').text(`Approval #${approval}`, doc.page.width - 160, 50, { align: 'left' });
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
  