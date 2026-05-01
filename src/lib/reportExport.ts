import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ReportColumn = { header: string; key: string; width?: number };

export function exportReportPDF(opts: {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: { label: string; value: string }[];
  lang: "en" | "ar";
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text(opts.title, 14, 16);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(opts.subtitle, 14, 22);
    doc.setTextColor(0);
  }
  autoTable(doc, {
    startY: 28,
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.map((r) => opts.columns.map((c) => String(r[c.key] ?? ""))),
    headStyles: { fillColor: [124, 58, 237] },
    styles: { fontSize: 9 },
  });
  if (opts.summary?.length) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 40;
    doc.setFontSize(11);
    let y = finalY + 8;
    opts.summary.forEach((s) => {
      doc.text(`${s.label}: ${s.value}`, 14, y);
      y += 6;
    });
  }
  doc.save(`${opts.title.replace(/\s+/g, "_")}.pdf`);
}

export function exportReportExcel(opts: {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: { label: string; value: string }[];
}) {
  const data = [opts.columns.map((c) => c.header), ...opts.rows.map((r) => opts.columns.map((c) => r[c.key] ?? ""))];
  if (opts.summary?.length) {
    data.push([]);
    opts.summary.forEach((s) => data.push([s.label, s.value]));
  }
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${opts.title.replace(/\s+/g, "_")}.xlsx`);
}

export function defaultDateRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function ageBucket(daysOld: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (daysOld <= 30) return "0-30";
  if (daysOld <= 60) return "31-60";
  if (daysOld <= 90) return "61-90";
  return "90+";
}

export const CHART_COLORS = ["hsl(262 83% 58%)", "hsl(199 89% 48%)", "hsl(142 71% 45%)", "hsl(45 93% 47%)", "hsl(0 84% 60%)", "hsl(280 65% 55%)"];