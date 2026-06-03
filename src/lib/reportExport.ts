import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";

export type ReportColumn = { header: string; key: string; width?: number };

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function ensureArabicFont() {
  if (document.getElementById("__cairo_font__")) return;
  const link = document.createElement("link");
  link.id = "__cairo_font__";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap";
  document.head.appendChild(link);
  await new Promise((r) => setTimeout(r, 600));
  try { await (document as any).fonts?.ready; } catch {}
}

export async function exportReportPDF(opts: {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: { label: string; value: string }[];
  lang: "en" | "ar";
}) {
  const isAr = opts.lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const fontFamily = isAr
    ? "'Cairo','Tajawal','Noto Naskh Arabic','Segoe UI',Tahoma,Arial,sans-serif"
    : "'Inter','Helvetica Neue',Arial,sans-serif";

  if (isAr) await ensureArabicFont();

  const headerCells = opts.columns
    .map((c) => `<th style="padding:8px;text-align:${isAr ? "right" : "left"};font-weight:700;border-bottom:2px solid #3a1a5e;">${esc(c.header)}</th>`)
    .join("");
  const bodyRows = opts.rows.map((r, i) => `
    <tr style="background:${i % 2 ? "#f7f7fb" : "#fff"};">
      ${opts.columns.map((c) => `<td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:${isAr ? "right" : "left"};">${esc(r[c.key] ?? "")}</td>`).join("")}
    </tr>`).join("");

  const summaryHtml = opts.summary?.length
    ? `<div style="margin-top:14px;padding:12px 14px;background:#f0eef7;border-${isAr ? "right" : "left"}:4px solid #3a1a5e;">
        ${opts.summary.map((s) => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;"><span style="color:#555;">${esc(s.label)}</span><span style="font-weight:700;color:#3a1a5e;">${esc(s.value)}</span></div>`).join("")}
       </div>`
    : "";

  const html = `
  <div id="__report_pdf__" dir="${dir}" lang="${opts.lang}" style="
    width: 1100px; padding: 28px; background:#fff; color:#111;
    font-family:${fontFamily}; font-size:12px; line-height:1.45; box-sizing:border-box;">
    <div style="border-bottom:2px solid #3a1a5e;padding-bottom:10px;margin-bottom:14px;">
      <div style="font-size:20px;font-weight:700;color:#3a1a5e;">${esc(opts.title)}</div>
      ${opts.subtitle ? `<div style="font-size:11px;color:#666;margin-top:2px;">${esc(opts.subtitle)}</div>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${opts.columns.length}" style="padding:20px;text-align:center;color:#999;">—</td></tr>`}</tbody>
    </table>
    ${summaryHtml}
    <div style="margin-top:18px;padding-top:8px;border-top:1px solid #eee;font-size:9px;color:#999;text-align:${isAr ? "left" : "right"};">
      ${esc(new Date().toLocaleString(isAr ? "ar-EG" : "en-GB"))}
    </div>
  </div>`;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  const node = container.firstElementChild as HTMLElement;
  try {
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    if (imgHeight <= pageHeight) {
      doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    } else {
      let position = 0;
      let heightLeft = imgHeight;
      doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        doc.addPage();
        doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }
    doc.save(`${opts.title.replace(/\s+/g, "_")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
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