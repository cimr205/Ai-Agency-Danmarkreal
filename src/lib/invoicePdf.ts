import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type InvoiceTemplate = 'modern' | 'classic' | 'minimal' | 'bold' | 'elegant';

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: string | null;
  dueDate: string | null;
  status: string;
  companyName: string;
  companyCvr: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyLogoUrl: string;
  customerName: string;
  customerEmail: string;
  customerCountry: string;
  customerVat: string;
  lines: { description: string; quantity: number; unit_price: number; total: number }[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  vatNote: string;
  notes: string;
  formatCurrency: (n: number) => string;
  locale: string;
}

const TEMPLATES: Record<InvoiceTemplate, {
  label: string;
  labelDa: string;
  primary: [number, number, number];
  accent: [number, number, number];
  headerBg: [number, number, number];
  headerText: [number, number, number];
  bodyBg: [number, number, number];
  stripe: [number, number, number];
  font: string;
}> = {
  modern: {
    label: 'Modern Blue',
    labelDa: 'Moderne Blå',
    primary: [30, 64, 175],
    accent: [59, 130, 246],
    headerBg: [30, 64, 175],
    headerText: [255, 255, 255],
    bodyBg: [248, 250, 252],
    stripe: [241, 245, 249],
    font: 'helvetica',
  },
  classic: {
    label: 'Classic Dark',
    labelDa: 'Klassisk Mørk',
    primary: [30, 30, 46],
    accent: [100, 116, 139],
    headerBg: [30, 30, 46],
    headerText: [255, 255, 255],
    bodyBg: [255, 255, 255],
    stripe: [248, 248, 248],
    font: 'times',
  },
  minimal: {
    label: 'Minimal',
    labelDa: 'Minimalistisk',
    primary: [0, 0, 0],
    accent: [107, 114, 128],
    headerBg: [255, 255, 255],
    headerText: [0, 0, 0],
    bodyBg: [255, 255, 255],
    stripe: [250, 250, 250],
    font: 'helvetica',
  },
  bold: {
    label: 'Bold Emerald',
    labelDa: 'Kraftig Grøn',
    primary: [5, 150, 105],
    accent: [16, 185, 129],
    headerBg: [5, 150, 105],
    headerText: [255, 255, 255],
    bodyBg: [240, 253, 244],
    stripe: [220, 252, 231],
    font: 'helvetica',
  },
  elegant: {
    label: 'Elegant Purple',
    labelDa: 'Elegant Lilla',
    primary: [109, 40, 217],
    accent: [139, 92, 246],
    headerBg: [109, 40, 217],
    headerText: [255, 255, 255],
    bodyBg: [250, 245, 255],
    stripe: [243, 232, 255],
    font: 'helvetica',
  },
};

export function getTemplateOptions(locale: string) {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    value: key as InvoiceTemplate,
    label: locale === 'da' ? t.labelDa : t.label,
  }));
}

export async function generateInvoicePdf(data: InvoicePdfData, template: InvoiceTemplate = 'modern'): Promise<Blob> {
  const t = TEMPLATES[template];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont(t.font);

  // ─── Header accent bar ────────────────────────
  if (template !== 'minimal') {
    doc.setFillColor(...t.primary);
    doc.rect(0, 0, pageWidth, 8, 'F');
  }

  y = template !== 'minimal' ? 16 : margin;

  // ─── Invoice title & number ───────────────────
  doc.setFontSize(28);
  doc.setTextColor(...t.primary);
  doc.setFont(t.font, 'bold');
  const isDa = data.locale === 'da';
  doc.text(isDa ? 'FAKTURA' : 'INVOICE', pageWidth - margin, y, { align: 'right' });

  doc.setFontSize(11);
  doc.setTextColor(...t.accent);
  doc.setFont(t.font, 'normal');
  doc.text(`#${data.invoiceNumber}`, pageWidth - margin, y + 8, { align: 'right' });

  // ─── Company info (left) ──────────────────────
  doc.setFontSize(14);
  doc.setTextColor(...t.primary);
  doc.setFont(t.font, 'bold');
  doc.text(data.companyName || '', margin, y);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont(t.font, 'normal');
  let cy = y + 6;
  if (data.companyCvr) { doc.text(`CVR: ${data.companyCvr}`, margin, cy); cy += 4; }
  if (data.companyAddress) { doc.text(data.companyAddress, margin, cy); cy += 4; }
  if (data.companyEmail) { doc.text(data.companyEmail, margin, cy); cy += 4; }
  if (data.companyPhone) { doc.text(data.companyPhone, margin, cy); cy += 4; }

  y = Math.max(cy, y + 20) + 10;

  // ─── Divider ──────────────────────────────────
  doc.setDrawColor(...t.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ─── Customer & Meta columns ──────────────────
  const colWidth = contentWidth / 2;

  // Customer box
  doc.setFillColor(...t.bodyBg);
  doc.roundedRect(margin, y, colWidth - 5, 32, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setTextColor(...t.primary);
  doc.setFont(t.font, 'bold');
  doc.text(isDa ? 'FAKTURERES TIL' : 'BILL TO', margin + 5, y + 6);

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 46);
  doc.setFont(t.font, 'bold');
  doc.text(data.customerName, margin + 5, y + 13);

  doc.setFontSize(9);
  doc.setFont(t.font, 'normal');
  doc.setTextColor(100, 116, 139);
  let custY = y + 18;
  if (data.customerEmail) { doc.text(data.customerEmail, margin + 5, custY); custY += 4; }
  if (data.customerCountry) { doc.text(data.customerCountry, margin + 5, custY); custY += 4; }
  if (data.customerVat) { doc.text(`VAT: ${data.customerVat}`, margin + 5, custY); }

  // Meta box
  const metaX = margin + colWidth + 5;
  doc.setFillColor(...t.bodyBg);
  doc.roundedRect(metaX, y, colWidth - 5, 32, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setTextColor(...t.primary);
  doc.setFont(t.font, 'bold');
  doc.text(isDa ? 'DETALJER' : 'DETAILS', metaX + 5, y + 6);

  doc.setFontSize(9);
  doc.setFont(t.font, 'normal');
  doc.setTextColor(100, 116, 139);
  const metaItems = [
    [isDa ? 'Udstedt' : 'Issued', data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : '–'],
    [isDa ? 'Forfald' : 'Due', data.dueDate ? new Date(data.dueDate).toLocaleDateString() : '–'],
    [isDa ? 'Status' : 'Status', data.status],
  ];
  let metaY = y + 13;
  for (const [label, value] of metaItems) {
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, metaX + 5, metaY);
    doc.setTextColor(30, 30, 46);
    doc.setFont(t.font, 'bold');
    doc.text(value, metaX + 30, metaY);
    doc.setFont(t.font, 'normal');
    metaY += 6;
  }

  y += 40;

  // ─── Line items table ─────────────────────────
  const tableHead = [
    isDa ? 'Beskrivelse' : 'Description',
    isDa ? 'Antal' : 'Qty',
    isDa ? 'Enhedspris' : 'Unit Price',
    'Total',
  ];

  const tableBody = data.lines.map(l => [
    l.description,
    String(l.quantity),
    data.formatCurrency(l.unit_price),
    data.formatCurrency(l.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [tableHead],
    body: tableBody,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: t.headerBg,
      textColor: t.headerText,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: [30, 30, 46],
    },
    alternateRowStyles: {
      fillColor: t.stripe,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 },
    },
    theme: 'plain',
    didDrawPage: () => {},
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ─── Totals ───────────────────────────────────
  const totalsX = pageWidth - margin - 80;
  const totalsWidth = 80;

  doc.setFillColor(...t.bodyBg);
  doc.roundedRect(totalsX - 5, y - 3, totalsWidth + 10, data.vatNote ? 42 : 35, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setFont(t.font, 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(isDa ? 'Subtotal' : 'Subtotal', totalsX, y + 4);
  doc.setTextColor(30, 30, 46);
  doc.text(data.formatCurrency(data.subtotal), totalsX + totalsWidth, y + 4, { align: 'right' });

  doc.setTextColor(100, 116, 139);
  doc.text(`${isDa ? 'Moms' : 'VAT'} (${data.vatRate}%)`, totalsX, y + 11);
  doc.setTextColor(30, 30, 46);
  doc.text(data.formatCurrency(data.vatAmount), totalsX + totalsWidth, y + 11, { align: 'right' });

  if (data.vatNote) {
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(data.vatNote, totalsX, y + 17, { maxWidth: totalsWidth });
    y += 7;
  }

  // Grand total
  doc.setDrawColor(...t.primary);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 5, y + 17, totalsX + totalsWidth + 5, y + 17);

  doc.setFontSize(13);
  doc.setFont(t.font, 'bold');
  doc.setTextColor(...t.primary);
  doc.text(isDa ? 'Total' : 'Total', totalsX, y + 25);
  doc.text(data.formatCurrency(data.total), totalsX + totalsWidth, y + 25, { align: 'right' });

  y += 35;

  // ─── Notes ────────────────────────────────────
  if (data.notes) {
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(margin, y, contentWidth, 20, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setFont(t.font, 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text(isDa ? 'Bemærkninger' : 'Notes', margin + 5, y + 6);
    doc.setFont(t.font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    doc.text(data.notes, margin + 5, y + 12, { maxWidth: contentWidth - 10 });
  }

  // ─── Footer ───────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 12;
  if (template !== 'minimal') {
    doc.setFillColor(...t.primary);
    doc.rect(0, footerY - 2, pageWidth, 14, 'F');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
  }

  const footerParts = [data.companyName, data.companyCvr ? `CVR: ${data.companyCvr}` : '', data.companyEmail].filter(Boolean);
  doc.text(footerParts.join(' · '), pageWidth / 2, footerY + 2, { align: 'center' });

  return doc.output('blob');
}

export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
