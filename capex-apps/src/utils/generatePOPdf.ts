import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MasterCatalogueItem, PurchaseOrder, Vendor } from '../types';

const SILOAM_BUYER = {
  name: 'PT. Siloam International Hospitals',
  lines: [
    'Siloam Hospitals Head Office',
    'Jl. Boulevard Sudirman No. 1688 - Lippo Karawaci',
    'Fakultas Kedokteran Universitas Pelita Harapan Lt.31',
    '(Gedung samping Siloam Hospitals Lippo Village)',
    'Tangerang',
  ],
  npwp: '02.438.873.8-606.001',
  invoiceAddress: [
    'PT. Siloam International Hospitals',
    'Siloam Hospitals Head Office',
    'Jl. Boulevard Sudirman No. 1688 - Lippo Karawaci',
    'Fakultas Kedokteran Universitas Pelita Harapan Lt.31',
    '(Gedung samping Siloam Hospitals Lippo Village)',
    'u.p: M Patoni',
    'Tel: (021) 2566 8000',
    'Fax: (021) 547 5890',
    'Email: m.patoni@siloamhospitals.com',
  ],
};

const TERMS = [
  'PO ini dinyatakan sah berlaku dan mengikat kedua belah pihak apabila sudah ditandatangani oleh pejabat yang berwenang dari PT. SILOAM INTERNATIONAL HOSPITALS.',
  'Barang harus mempunyai kwalitas sesuai dengan spesifikasi teknis yang ditentukan, diluar ketentuan tersebut barang tidak akan diterima dan harus diganti dengan yang baru, dan barang yang diserahkan mempunyai ijin sesuai dengan ketentuan hukum yang berlaku.',
  'Pengiriman barang harus sesuai dengan tanggal kirim yang tercantum dalam PO.',
  'Supplier dengan ini menjamin dan membebaskan PT. SILOAM INTERNATIONAL HOSPITALS dari segala tuntutan hukum apapun dan dari pihak manapun juga tanpa ada yang dikecualikan.',
];

export type GeneratePOPdfContext = {
  hospitalUnitName?: string;
  hospitalUnitCode?: string;
  projectName?: string;
  masterCatalogue?: MasterCatalogueItem[];
  deliveryDate?: string;
  franco?: string;
};

export type GeneratePOPdfMode = 'view' | 'download';

function formatPoDate(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const yr = String(d.getFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

/** Amount style matching reference PO: `587,908,920` or `(41,163,061)` */
function formatPoAmount(value: number): string {
  const abs = Math.abs(Math.round(value));
  const formatted = new Intl.NumberFormat('en-US').format(abs);
  return value < 0 ? `(${formatted})` : formatted;
}

function splitAddress(address: string | undefined): string[] {
  if (!address?.trim()) return ['-'];
  return address
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function unitLabel(context?: GeneratePOPdfContext): string {
  const code = context?.hospitalUnitCode?.trim();
  const name = context?.hospitalUnitName?.trim();
  if (code && name) return `${code} / ${name}`;
  return code || name || 'PIPELINE UNIT';
}

function isJasaItem(name: string, category?: string): boolean {
  const probe = `${name} ${category ?? ''}`.toLowerCase();
  return probe.includes('jasa') || probe.includes('service') || probe.includes('instalasi');
}

function buildTableBody(
  po: PurchaseOrder,
  context?: GeneratePOPdfContext,
): Array<Array<string | { content: string; colSpan?: number; styles?: Record<string, unknown> }>> {
  const catalogueMap = new Map((context?.masterCatalogue ?? []).map((c) => [c.id, c]));
  const rows: Array<Array<string | { content: string; colSpan?: number; styles?: Record<string, unknown> }>> = [];

  let rowNo = 0;
  const materialItems: typeof po.items = [];
  const jasaItems: typeof po.items = [];

  for (const item of po.items) {
    const cat = catalogueMap.get(item.catalogueId)?.category;
    if (isJasaItem(item.name, cat)) jasaItems.push(item);
    else materialItems.push(item);
  }

  const pushGroup = (label: string, items: typeof po.items) => {
    if (items.length === 0) return;
    rows.push([
      {
        content: label,
        colSpan: 7,
        styles: { fontStyle: 'bold', fillColor: [245, 245, 245] },
      },
    ]);
    for (const item of items) {
      rowNo += 1;
      rows.push([
        String(rowNo),
        item.name,
        String(item.qty),
        'Unit',
        formatPoAmount(item.price),
        '0%',
        formatPoAmount(item.subtotal),
      ]);
    }
  };

  if (context?.projectName?.trim()) {
    rows.push([
      {
        content: context.projectName.trim(),
        colSpan: 7,
        styles: { fontStyle: 'bold', fillColor: [235, 240, 246] },
      },
    ]);
  }

  pushGroup('Material', materialItems);
  pushGroup('Jasa', jasaItems);

  if (materialItems.length === 0 && jasaItems.length === 0) {
    for (const item of po.items) {
      rowNo += 1;
      rows.push([
        String(rowNo),
        item.name,
        String(item.qty),
        'Unit',
        formatPoAmount(item.price),
        '0%',
        formatPoAmount(item.subtotal),
      ]);
    }
  }

  return rows;
}

function openPdf(doc: jsPDF, fileName: string, mode: GeneratePOPdfMode) {
  if (mode === 'download') {
    doc.save(fileName);
    return;
  }
  try {
    const blobUrl = doc.output('bloburl');
    const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!win) doc.save(fileName);
  } catch {
    doc.save(fileName);
  }
}

export function generatePOPdf(
  po: PurchaseOrder,
  vendor: Vendor | undefined,
  context?: GeneratePOPdfContext,
  mode: GeneratePOPdfMode = 'view',
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const rightX = pageWidth - margin;
  let y = 14;

  const shipToLines = splitAddress(po.shippingAddress);
  const shipToTitle = shipToLines[0] ?? context?.hospitalUnitName ?? SILOAM_BUYER.name;

  // --- Top header (ship-to left, PO meta right) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(shipToTitle, margin, y);
  doc.text(`No PO : ${po.poNumber}`, rightX, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const leftHeaderLines = shipToLines.slice(1);
  const metaLines = [
    'No. RFC :',
    'No. PRF :',
    `UNIT : ${unitLabel(context)}`,
  ];
  const headerRows = Math.max(leftHeaderLines.length, metaLines.length);
  for (let i = 0; i < headerRows; i += 1) {
    if (leftHeaderLines[i]) doc.text(leftHeaderLines[i], margin, y);
    if (metaLines[i]) doc.text(metaLines[i], rightX, y, { align: 'right' });
    y += 4;
  }
  y += 2;

  // --- Vendor & shipping ---
  const blockTop = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Kepada Yth:', margin, blockTop);
  doc.text('Pengiriman Kepada:', pageWidth / 2 + 4, blockTop);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const vendorLines = [
    vendor?.name || po.vendorName || '-',
    ...(vendor?.address ? splitAddress(vendor.address) : []),
    vendor?.contactPerson ? `UP : ${vendor.contactPerson}${vendor.contactPhone ? ` (${vendor.contactPhone})` : ''}` : '',
    vendor?.contactPhone ? `Telp : ${vendor.contactPhone}` : '',
    vendor?.contactEmail ? `Email : ${vendor.contactEmail}` : '',
  ].filter(Boolean);

  const deliveryLines = shipToLines.length > 0 ? shipToLines : [context?.hospitalUnitName || '-'];

  const partyRows = Math.max(vendorLines.length, deliveryLines.length);
  let partyY = blockTop + 5;
  for (let i = 0; i < partyRows; i += 1) {
    if (vendorLines[i]) doc.text(vendorLines[i], margin, partyY, { maxWidth: 82 });
    if (deliveryLines[i]) doc.text(deliveryLines[i], pageWidth / 2 + 4, partyY, { maxWidth: 82 });
    partyY += 4;
  }

  y = partyY + 2;
  doc.setFont('helvetica', 'normal');
  doc.text(`Tanggal PO : ${formatPoDate(po.createdAt)}`, rightX, y, { align: 'right' });
  y += 4;
  doc.text(`Tanggal Pengiriman : ${formatPoDate(context?.deliveryDate)}`, rightX, y, { align: 'right' });
  y += 4;
  doc.text('Tanggal Sampai di Unit : (by : )', rightX, y, { align: 'right' });
  y += 4;
  doc.text(`Franco : ${context?.franco || context?.hospitalUnitName || 'Siloam Unit'}`, rightX, y, { align: 'right' });
  y += 6;

  // --- Title ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PESANAN PEMBELIAN', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(12);
  doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(9);
  doc.text('CAPEX - PIPELINE', pageWidth / 2, y, { align: 'center' });
  y += 4;

  // --- Items table ---
  const tableBody = buildTableBody(po, context);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['No', 'Nama Barang', 'Jumlah', 'Satuan', 'Harga Satuan', 'Disc', 'Harga Nett']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 62 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'center', cellWidth: 12 },
      6: { halign: 'right', cellWidth: 28 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && (data.column.index === 4 || data.column.index === 6)) {
        const raw = String(data.cell.raw ?? '');
        if (raw && raw !== '-') {
          data.cell.text = [`${raw} Rp`];
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursorY = ((doc as any).lastAutoTable?.finalY as number | undefined) ?? y + 20;
  cursorY += 4;

  const subTotal = po.totalValue;
  const ppn = Math.round(subTotal * 0.11);
  const grandTotal = subTotal + ppn;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Delivery Cost : Included', margin, cursorY);
  doc.text(`${formatPoAmount(subTotal)} Rp`, rightX, cursorY, { align: 'right' });
  cursorY += 5;

  doc.text('Termin Pembayaran :', margin, cursorY);
  doc.text('- Rp', rightX, cursorY, { align: 'right' });
  cursorY += 4;
  doc.text(`${formatPoAmount(subTotal)} Rp`, rightX, cursorY, { align: 'right' });
  cursorY += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Material', margin, cursorY);
  cursorY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Termin 1 : 30% DP', margin, cursorY);
  doc.text('Delivery+Biaya Layanan+Asuransi', margin + 48, cursorY);
  doc.text('- Rp', rightX, cursorY, { align: 'right' });
  cursorY += 4;
  doc.text('Termin 2 : 70% Sebelum Material dikirim', margin, cursorY);
  cursorY += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Jasa', margin, cursorY);
  cursorY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Termin 1 : 50% DP', margin, cursorY);
  doc.text(`${formatPoAmount(Math.round(subTotal * 0.3))} Rp`, rightX, cursorY, { align: 'right' });
  cursorY += 4;
  doc.text('Termin 2 : 50% Setelah BAST', margin, cursorY);
  doc.text(`${formatPoAmount(Math.round(subTotal * 0.7))} Rp`, rightX, cursorY, { align: 'right' });
  cursorY += 8;

  // --- NPWP & approvals ---
  const sigTop = cursorY;
  doc.setFont('helvetica', 'bold');
  doc.text('Alamat NPWP :', margin, sigTop);
  doc.text('Reviewed by,', pageWidth / 2 - 8, sigTop, { align: 'center' });
  doc.text('Approved by,', rightX - 24, sigTop, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  let npwpY = sigTop + 4;
  for (const line of [SILOAM_BUYER.name, ...SILOAM_BUYER.lines.slice(0, 3)]) {
    doc.text(line, margin, npwpY, { maxWidth: 70 });
    npwpY += 4;
  }
  doc.text(`NO. NPWP : ${vendor?.npwp || SILOAM_BUYER.npwp}`, margin, npwpY + 2);

  const signLineY = sigTop + 22;
  doc.line(pageWidth / 2 - 34, signLineY, pageWidth / 2 + 10, signLineY);
  doc.line(rightX - 50, signLineY, rightX - 2, signLineY);
  doc.text('Rumintang', pageWidth / 2 - 8, signLineY + 4, { align: 'center' });
  doc.text('Linawati Widjaja', rightX - 24, signLineY + 4, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('Purchasing Controller', pageWidth / 2 - 8, signLineY + 8, { align: 'center' });
  doc.text('Head of HO Procurement Division', rightX - 24, signLineY + 8, { align: 'center' });

  cursorY = signLineY + 16;

  // --- Invoice address & T&C ---
  if (cursorY > 250) {
    doc.addPage();
    cursorY = 14;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Kwitansi, Invoice, Faktur Pajak & Surat Jalan', margin, cursorY);
  doc.text('dikirim ke :', margin, cursorY + 4);
  doc.setFont('helvetica', 'normal');
  let invoiceY = cursorY + 8;
  for (const line of SILOAM_BUYER.invoiceAddress) {
    doc.text(line, margin, invoiceY, { maxWidth: 88 });
    invoiceY += 3.8;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Terms & Conditions:', pageWidth / 2 + 4, cursorY);
  doc.setFont('helvetica', 'normal');
  let termsY = cursorY + 5;
  TERMS.forEach((term, idx) => {
    const wrapped = doc.splitTextToSize(`${idx + 1}. ${term}`, pageWidth / 2 - 20);
    doc.text(wrapped, pageWidth / 2 + 4, termsY);
    termsY += wrapped.length * 3.6 + 1.5;
  });

  const totalsY = Math.max(invoiceY, termsY) + 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Total PO', rightX - 58, totalsY, { align: 'right' });
  doc.text('PPN', rightX - 58, totalsY + 5, { align: 'right' });
  doc.text('Grand Total', rightX - 58, totalsY + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatPoAmount(subTotal)} Rp`, rightX, totalsY, { align: 'right' });
  doc.text(`${formatPoAmount(ppn)} Rp`, rightX, totalsY + 5, { align: 'right' });
  doc.text(`${formatPoAmount(grandTotal)} Rp`, rightX, totalsY + 10, { align: 'right' });

  doc.setFontSize(7);
  doc.text(formatPoDate(po.createdAt), margin, doc.internal.pageSize.getHeight() - 8);

  openPdf(doc, `${po.poNumber}.pdf`, mode);
}
