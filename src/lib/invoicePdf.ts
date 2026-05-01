import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Lang = "en" | "ar";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + " EGP";
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

export function generateInvoicePdf(opts: {
  invoice: any;
  items: any[];
  payments: any[];
  patient: any;
  branch?: { name_en?: string; name_ar?: string; address?: string; phone?: string } | null;
  lang: Lang;
  t: (k: string) => string;
}) {
  const { invoice, items, payments, patient, branch, lang, t } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const M = 14;

  // Header — clinic block
  doc.setFillColor(58, 26, 94); // primary purple
  doc.rect(0, 0, pageWidth, 32, "F");

  // Logo placeholder (square)
  doc.setDrawColor(255); doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 8, 16, 16, 2, 2, "F");
  doc.setTextColor(58, 26, 94);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Z", M + 8, 18, { align: "center" });

  // Clinic name
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(branch?.name_en || "ZMedico Clinic", M + 22, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (branch?.address) doc.text(branch.address, M + 22, 22);
  if (branch?.phone) doc.text(branch.phone, M + 22, 27);

  // INVOICE label right
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("INVOICE", pageWidth - M, 18, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(invoice.invoice_number, pageWidth - M, 26, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 42;

  // Bill to / dates
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("BILL TO", M, y);
  doc.text("INVOICE DATE", pageWidth - M - 50, y);
  doc.text("STATUS", pageWidth - M, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const patientName = `${patient?.first_name_en ?? ""} ${patient?.last_name_en ?? ""}`.trim();
  doc.text(patientName + (patient?.patient_code ? `  #${patient.patient_code}` : ""), M, y);
  doc.text(fmtDate(invoice.invoice_date), pageWidth - M - 50, y);
  doc.text(String(invoice.status).toUpperCase(), pageWidth - M, y, { align: "right" });
  y += 5;
  if (patient?.phone) { doc.setTextColor(110); doc.text(patient.phone, M, y); doc.setTextColor(0); y += 5; }
  if (patient?.email) { doc.setTextColor(110); doc.text(patient.email, M, y); doc.setTextColor(0); y += 5; }

  y += 4;
  // Items table
  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Qty", "Unit Price", "Total"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.description_en + (it.description_ar ? `\n${it.description_ar}` : ""),
      String(it.quantity),
      money(it.unit_price),
      money(it.total),
    ]),
    theme: "striped",
    headStyles: { fillColor: [58, 26, 94], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 32 },
      4: { halign: "right", cellWidth: 32 },
    },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: M, right: M },
  });

  // Totals box
  let cy = (doc as any).lastAutoTable.finalY + 8;
  const boxX = pageWidth - M - 80;
  const boxW = 80;
  const lineH = 6;
  const remaining = +(Number(invoice.total) - Number(invoice.paid_amount)).toFixed(2);

  const rows: Array<[string, string, [number, number, number]?]> = [
    ["Subtotal", money(invoice.subtotal), [60, 60, 60]],
    ["Discount", "- " + money(invoice.discount), [60, 60, 60]],
    ["Tax", "+ " + money(invoice.tax), [60, 60, 60]],
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  rows.forEach(([l, v, c]) => {
    if (c) doc.setTextColor(c[0], c[1], c[2]);
    doc.text(l, boxX, cy);
    doc.text(v, boxX + boxW, cy, { align: "right" });
    cy += lineH;
  });
  doc.setDrawColor(200); doc.line(boxX, cy - 2, boxX + boxW, cy - 2);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.setTextColor(58, 26, 94);
  doc.text("TOTAL", boxX, cy + 3);
  doc.text(money(invoice.total), boxX + boxW, cy + 3, { align: "right" });
  cy += 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(34, 139, 34);
  doc.text("Paid", boxX, cy);
  doc.text(money(invoice.paid_amount), boxX + boxW, cy, { align: "right" });
  cy += lineH;
  doc.setTextColor(204, 102, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Remaining", boxX, cy);
  doc.text(money(remaining), boxX + boxW, cy, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // Notes (left side, parallel to totals)
  if (invoice.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Notes", M, notesY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const split = doc.splitTextToSize(invoice.notes, boxX - M - 8);
    doc.text(split, M, notesY + 5);
  }

  // Payment history table
  if (payments.length > 0) {
    autoTable(doc, {
      startY: cy + 8,
      head: [["Payment Date", "Method", "Reference", "Amount"]],
      body: payments.map((p) => [
        fmtDate(p.payment_date || p.created_at),
        String(p.payment_method).replace("_", " "),
        p.reference_number || "—",
        money(p.amount),
      ]),
      theme: "grid",
      headStyles: { fillColor: [240, 240, 245], textColor: 40, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" } },
      styles: { fontSize: 9, cellPadding: 2.5 },
      margin: { left: M, right: M },
    });
  }

  // Footer
  const footerY = pageHeight - 12;
  doc.setDrawColor(220); doc.line(M, footerY - 4, pageWidth - M, footerY - 4);
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120);
  doc.text("Thank you for your visit", pageWidth / 2, footerY, { align: "center" });
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, M, footerY);
  doc.text(invoice.invoice_number, pageWidth - M, footerY, { align: "right" });

  doc.save(`${invoice.invoice_number}.pdf`);
}