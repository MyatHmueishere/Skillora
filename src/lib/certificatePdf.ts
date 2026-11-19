import { jsPDF } from 'jspdf';
import type { CertificateTemplateId, IssuedCertificateRecord } from '../types';
import { formatCertificateFullDate } from './achievements';

const NAVY_DARK: [number, number, number] = [15, 29, 58]; // #0F1D3A
const NAVY_MID: [number, number, number] = [22, 42, 82]; // #162A52
const GOLD: [number, number, number] = [200, 162, 74]; // #C8A24A
const GOLD_LIGHT: [number, number, number] = [223, 194, 120]; // #DFC278
const IVORY: [number, number, number] = [252, 251, 247]; // #FCFBF7
const WHITE: [number, number, number] = [255, 255, 255];
const SLATE_MUTED: [number, number, number] = [92, 102, 122];

function drawGoldSeal(doc: jsPDF, cx: number, cy: number, radius = 12) {
  doc.setFillColor(...GOLD);
  doc.circle(cx, cy, radius, 'F');
  doc.setDrawColor(...NAVY_DARK);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, radius - 1.5, 'S');
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, radius - 3, 'S');

  doc.setTextColor(...NAVY_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('VERIFIED', cx, cy - 1.2, { align: 'center' });
  doc.setFontSize(6);
  doc.text('SKILLORA', cx, cy + 2.6, { align: 'center' });
}

function drawSignatureAndMetaRow(
  doc: jsPDF,
  cert: IssuedCertificateRecord,
  leftX: number,
  rightX: number,
  yLine: number,
  textColor: [number, number, number],
  accentColor: [number, number, number]
) {
  const dateLabel = formatCertificateFullDate(cert.completionDate || cert.issuedAt) || 'Verified';
  const verifyOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://skillora.app';
  const verifyUrl = `${verifyOrigin}/?verify=${encodeURIComponent(cert.certificateNumber)}`;

  // Left: Completion Date
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.45);
  doc.line(leftX, yLine, leftX + 54, yLine);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(dateLabel, leftX + 27, yLine - 3, { align: 'center' });
  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('COMPLETION DATE', leftX + 27, yLine + 5, { align: 'center' });

  // Right: Authorized Signatory
  doc.setDrawColor(...accentColor);
  doc.line(rightX - 64, yLine, rightX, yLine);
  doc.setTextColor(...textColor);
  doc.setFont('times', 'italic');
  doc.setFontSize(14);
  doc.text('Skillora Academic Board', rightX - 32, yLine - 3.2, { align: 'center' });
  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(cert.issuerDesignation || 'Authorized Issuer · Skillora', rightX - 32, yLine + 5, {
    align: 'center',
  });

  // Footer verification strip
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...textColor);
  doc.text(`Certificate ID: ${cert.certificateNumber}`, leftX, 194);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(`Verify authenticity: ${verifyUrl}`, rightX, 194, { align: 'right' });
}

function renderClassicAcademicPdf(doc: jsPDF, cert: IssuedCertificateRecord) {
  // Background ivory
  doc.setFillColor(...IVORY);
  doc.rect(0, 0, 297, 210, 'F');

  // Outer Midnight Navy frame & inner Champagne Gold double rule
  doc.setDrawColor(...NAVY_DARK);
  doc.setLineWidth(2.4);
  doc.rect(10, 10, 277, 190, 'S');
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.9);
  doc.rect(14.5, 14.5, 268, 181, 'S');
  doc.setLineWidth(0.35);
  doc.rect(17, 17, 263, 176, 'S');

  // Top Header
  doc.setTextColor(...NAVY_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SKILLORA', 148.5, 31, { align: 'center' });
  doc.setTextColor(...GOLD);
  doc.setFontSize(8.5);
  doc.text('PROFESSIONAL LEARNING & CREDENTIALING', 148.5, 36.5, { align: 'center' });

  doc.setDrawColor(...GOLD_LIGHT);
  doc.setLineWidth(0.4);
  doc.line(90, 41, 207, 41);

  doc.setTextColor(...NAVY_DARK);
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.text(cert.certificateTypeLabel.toUpperCase(), 148.5, 55, {
    align: 'center',
    maxWidth: 245,
  });

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('This credential is proudly conferred upon', 148.5, 70, { align: 'center' });

  // Student Full Name
  doc.setTextColor(...NAVY_DARK);
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(34);
  doc.text(cert.studentName, 148.5, 89, { align: 'center', maxWidth: 240 });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.7);
  doc.line(78, 95, 219, 95);

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(
    'for successfully fulfilling all academic milestones, guided coursework, and verified evaluations for',
    148.5,
    108,
    { align: 'center', maxWidth: 230 }
  );

  // Course / Path Title
  doc.setTextColor(...NAVY_MID);
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text(cert.title, 148.5, 123, { align: 'center', maxWidth: 236 });

  // Learning Direction
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`LEARNING DIRECTION: ${cert.direction.toUpperCase()}`, 148.5, 136, {
    align: 'center',
  });

  drawGoldSeal(doc, 148.5, 166, 13);
  drawSignatureAndMetaRow(doc, cert, 28, 269, 170, NAVY_DARK, GOLD);
}

function renderModernProfessionalPdf(doc: jsPDF, cert: IssuedCertificateRecord) {
  // Crisp White Canvas
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, 297, 210, 'F');

  // Midnight Navy Structural Left Panel
  doc.setFillColor(...NAVY_DARK);
  doc.rect(0, 0, 72, 210, 'F');

  // Champagne Gold vertical accent stripe
  doc.setFillColor(...GOLD);
  doc.rect(72, 0, 2.2, 210, 'F');

  // Subtle Navy perimeter on right side
  doc.setDrawColor(225, 229, 238);
  doc.setLineWidth(0.6);
  doc.rect(74.2, 8, 214.8, 194, 'S');

  // Left Panel Branding & Details
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SKILLORA', 14, 28);
  doc.setTextColor(...GOLD_LIGHT);
  doc.setFontSize(8);
  doc.text('VERIFIED CREDENTIAL', 14, 34);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(14, 41, 58, 41);

  drawGoldSeal(doc, 36, 76, 15);

  doc.setTextColor(...GOLD_LIGHT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('CREDENTIAL TYPE', 14, 114);
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(cert.certificateTypeLabel, 14, 121, { maxWidth: 48 });

  doc.setTextColor(...GOLD_LIGHT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('LEARNING DIRECTION', 14, 142);
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(cert.direction, 14, 149, { maxWidth: 48 });

  doc.setTextColor(...GOLD_LIGHT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('STATUS', 14, 170);
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(cert.status === 'valid' ? 'AUTHENTIC · VALID' : 'REVOKED', 14, 177);

  // Right Content Area
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('OFFICIAL CERTIFICATE OF ACHIEVEMENT', 90, 34);

  doc.setTextColor(...NAVY_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(cert.certificateTypeLabel, 90, 48, { maxWidth: 185 });

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Awarded to', 90, 68);

  doc.setTextColor(...NAVY_DARK);
  doc.setFont('times', 'bold');
  doc.setFontSize(34);
  doc.text(cert.studentName, 90, 84, { maxWidth: 185 });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.9);
  doc.line(90, 91, 185, 91);

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(
    'In recognition of verified mastery and completion of all required curriculum milestones for:',
    90,
    106,
    { maxWidth: 185 }
  );

  doc.setTextColor(...NAVY_MID);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(cert.title, 90, 122, { maxWidth: 185 });

  drawSignatureAndMetaRow(doc, cert, 90, 275, 170, NAVY_DARK, GOLD);
}

function renderExcellenceAwardPdf(doc: jsPDF, cert: IssuedCertificateRecord) {
  // Rich Midnight Navy outer frame
  doc.setFillColor(...NAVY_DARK);
  doc.rect(0, 0, 297, 210, 'F');

  // Double Champagne Gold borders around ivory inner credential plate
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.1);
  doc.rect(9, 9, 279, 192, 'S');

  doc.setFillColor(...IVORY);
  doc.rect(14, 14, 269, 182, 'F');

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.rect(17, 17, 263, 176, 'S');

  // Midnight Navy top banner ribbon inside card
  doc.setFillColor(...NAVY_MID);
  doc.rect(17, 17, 263, 24, 'F');

  doc.setTextColor(...GOLD_LIGHT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('SKILLORA · CERTIFICATE OF DISTINCTION & EXCELLENCE', 148.5, 31.5, {
    align: 'center',
  });

  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('HIGH-PERFORMANCE ACADEMIC RECOGNITION', 148.5, 53, { align: 'center' });

  doc.setTextColor(...NAVY_DARK);
  doc.setFont('times', 'bold');
  doc.setFontSize(27);
  doc.text(cert.certificateTypeLabel.toUpperCase(), 148.5, 66, {
    align: 'center',
    maxWidth: 240,
  });

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Presented with honors to', 148.5, 80, { align: 'center' });

  doc.setTextColor(...NAVY_DARK);
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(34);
  doc.text(cert.studentName, 148.5, 97, { align: 'center', maxWidth: 235 });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(82, 103, 215, 103);

  doc.setTextColor(...NAVY_MID);
  doc.setFont('times', 'bold');
  doc.setFontSize(21);
  doc.text(cert.title, 148.5, 118, { align: 'center', maxWidth: 235 });

  doc.setTextColor(...SLATE_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(
    `Learning Direction: ${cert.direction} · Verified High Academic Standard`,
    148.5,
    130,
    { align: 'center', maxWidth: 230 }
  );

  drawGoldSeal(doc, 148.5, 162, 13.5);
  drawSignatureAndMetaRow(doc, cert, 28, 269, 169, NAVY_DARK, GOLD);
}

export function createCertificatePdfDoc(
  cert: IssuedCertificateRecord,
  templateOverride?: CertificateTemplateId
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const template = templateOverride ?? cert.templateId ?? 'classic_academic';

  switch (template) {
    case 'modern_professional':
      renderModernProfessionalPdf(doc, cert);
      break;
    case 'excellence_award':
      renderExcellenceAwardPdf(doc, cert);
      break;
    case 'classic_academic':
    default:
      renderClassicAcademicPdf(doc, cert);
      break;
  }

  return doc;
}

export function downloadCertificateAsPdf(
  cert: IssuedCertificateRecord,
  templateOverride?: CertificateTemplateId
): void {
  const doc = createCertificatePdfDoc(cert, templateOverride);
  doc.save(`Skillora-${cert.certificateNumber}.pdf`);
}

export function printCertificateA4Landscape(
  onPrepareDom?: () => void
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (onPrepareDom) onPrepareDom();
  document.body.classList.add('printing-certificate');

  const cleanup = () => {
    document.body.classList.remove('printing-certificate');
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 1500);
  }, 80);
}
