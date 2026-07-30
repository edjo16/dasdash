import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import { getFormatedDateHours } from '../../Middleware/validateUserId.js';
export async function generatePDF(data, formId) {
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
          size: fontSize,
          font: font
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
        font: font
      });
      linesDrawn++;
    }
        return currentY; 
  };
  
  const pdfBytes = await fs.readFile('./HR/PersonnelRequisition/PersonnelRequisitionTemplate.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const page = pdfDoc.getPages()[0];
  const page2 = pdfDoc.getPages()[1];

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  function convertDateFormat(dateString) {
    const [month, day, year] = dateString.split('/');
    return `${day}/${month}/${year}`;
  }


  const addText = (text, x, y, size = 10, color) => {
    page.drawText(text, { x, y, size, font, color });
  };

  function formatCurrency(value) { 
    return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

  const addTextPage2 = (text, x, y, size = 10, color) => {
    page2.drawText(text, { x, y, size, font, color });
  };

  const checkBox = (x, y) => {
    page.drawText('X', { x, y, size: 12, font });
  };
  const checkBoxPage2 = (x, y) => {
    page2.drawText('X', { x, y, size: 12, font });
  };
  addText(data.requestorName, 160, 650);
  addText(data.requestorPosition, 175, 635);

  const reasons = {
    'New position': [262, 601],
    'Add to Staff': [429, 601],
    'Promotion or Transfer': [96, 588],
    'Retirement': [96, 576],
    'Long Medical Leave': [96, 564],
    'Termination': [96, 551],
    'Other': [120, 542]
  };

  if(reasons[data.reasonForRequisition]) {
    checkBox(...reasons[data.reasonForRequisition]);
  } else {
    addText(data.reasonForRequisition, 110, 542);
  }
  if(data.replaceWho){
    addText("Who do we need to replace? Name… ", 80, 525, 8, rgb(193 / 255, 191 / 255, 191 / 255));
    addText(data.replaceWho, 80, 512);
  }

  if (data.effectiveDate) {
    addText("Effective date (last day of work)", 80, 490, 8, rgb(193 / 255, 191 / 255, 191 / 255));
    addText(data.effectiveDate, 80, 475);
  }
  if(data.expectedStartDate){
    addText(data.expectedStartDate, 476, 440);
  }

  if(data.supportOrBussineesNotes){
    addText("Justify New position or add to staff", 340, 590, 8, rgb(193 / 255, 191 / 255, 191 / 255));
    addText("Detail need and add a business case, if necessary", 315, 580,8, rgb(193 / 255, 191 / 255, 191 / 255));
    addTextWithWrapping(page,data.supportOrBussineesNotes, 245, 565, 480, 68);
  }
  if(data.reasonNotes){
    addText("Notes", 80, 460, 8, rgb(193 / 255, 191 / 255, 191 / 255));
    addTextWithWrapping(page,data.reasonNotes, 80, 440, 390, 85);

  }
  if(data.businessCaseIsAttached == "1") {
    checkBox(96, 450);
  } 
// 3 JOB INFORMATION
const positions = {
  'C-Level': [217, 357],
  'Global Head': [217, 345],
  'Head': [217, 333],
  'Manager': [217, 321],
  'Supervisor': [343, 357],
  'Coordinator': [343, 345],
  'Sr. Analyst': [343, 333],
  'Analyst': [469, 357],
  'Assistant': [469, 345],
  'Support': [469, 333]
};

const avaliableDesk = {
  'Not required': [472, 255],
  'Available': [472, 243],
  'TBD': [472, 231]
};
if (positions[data.positionType]) {
    checkBox(...positions[data.positionType]);
  } 
  if (avaliableDesk[data.availableDeskOffice]) {
    checkBox(...avaliableDesk[data.availableDeskOffice]);
  }   
  addText(data.positionJobTitle, 210, 305);
  addText(data.area, 210, 282);
  addText(data.location, 210, 250);
 
  const attachedDescription = {
    withMyA: [217, 218],
    withMyNotes: [217, 206],
    withBasicsFunctions: [217, 194]
  };
  
  const attachedDescriptionNames = Array.isArray(data.attachedDescription) ? data.attachedDescription : [data.attachedDescription];
  
  for (const attachedDescriptionName of attachedDescriptionNames) {
    if (attachedDescription[attachedDescriptionName]) {
      checkBox(...attachedDescription[attachedDescriptionName]);
    } else {
      console.error(`Unknown attached description: ${attachedDescriptionName}`);
    }
  }
  
  if(data.notesObservationsRequirements){
    addText("Notes, observations or Special Requirements for this search:", 80, 180, 8, rgb(193 / 255, 191 / 255, 191 / 255));
    addTextWithWrapping(page,data.notesObservationsRequirements, 80, 170, 120, 105);
    }

 // 4 COMPENSATION & BENEFITS
 const benefits = {
  'Allowance Insurance': [221, 644],
  'Allowance Connectivity': [221, 619],
  'Parking space': [221, 596]
};

const benefitNames = Array.isArray(data.benefits) ? data.benefits : [data.benefits];

for (const benefitName of benefitNames) {
  if (benefits[benefitName]) {
    checkBoxPage2(...benefits[benefitName]);  
  } else {
    console.error(`Unknown benefit: ${benefitName}`);
  }
}

  const annualBonus = {
    'Non explicit': [346, 631],
    '1 to 3 times': [346, 620],
    '3 to 5 times': [346, 605],
    'Other': [346, 595]
  };

  if (annualBonus[data.annualBonus]) {
    checkBoxPage2(...annualBonus[data.annualBonus]);
  } 
addTextPage2(formatCurrency(data.minCompensationRange), 230, 670);
addTextPage2(formatCurrency(data.avegareCompensationRange), 370, 670);
addTextPage2(formatCurrency(data.maxCompensationRange), 480, 670);
addTextPage2(data.rangeInfoSource, 200, 657);
if(data.benefitsNotes){
  addTextWithWrapping(page2, data.benefitsNotes, 78, 582, 550, 110);

}
// 5 SOURCE OF CANDIDATES
const sources = {
  'Internal Candidate': [96, 519],
  'HR Search & Refferals': [221, 519],
  'Headhunter': [346, 519],
  'Executive Headhunter': [471, 519]
};
const sourceNames = Array.isArray(data.source) ? data.source : [data.source];

// Iterate through the source and call checkBoxPage2
for (const sourceName of sourceNames) {
  if (sources[sourceName]) {
    checkBoxPage2(...sources[sourceName]);  
  } else {
    console.error(`Unknown Source: ${sourceName}`);
  }
}
if(data.preIndentifyCandidate){
  addTextWithWrapping(page2,data.preIndentifyCandidate, 78, 485, 465, 52);

}
if(data.headhunter){
    addTextWithWrapping(page2,data.headhunter, 327, 485, 465, 52);
}

if(data.notesSourceRequiriments){
  addTextPage2("Notes, observations or Special Requirements for this search: ", 76, 458, 10, rgb(193 / 255, 191 / 255, 191 / 255));
  addTextWithWrapping(page2,data.notesSourceRequiriments, 76, 445, 425, 110);
}
const date = getFormatedDateHours();
let mensaje = `This request has been made by ${data.requestorName} with Approval Number ${formId} and date ${date}`;
addTextWithWrapping(page2, mensaje, 75, 376, 350, 48);

  const pdfBytesGenerated = await pdfDoc.save();

  const filename = `Personnel Requisition Form.pdf`;
  return { fileBuffer: pdfBytesGenerated, filename: filename };
}

