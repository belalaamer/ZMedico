// html2canvas + jsPDF are loaded on-demand inside the exported async function
// so the ~600 KB PDF stack is only fetched when the user actually prints / exports.
import { patientDisplayName } from "@/lib/patientName";

type Lang = "en" | "ar";

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function fmtDate(d: string | Date | null | undefined, lang: Lang) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

export async function generatePrescriptionPdf(opts: {
  prescription: any;
  items: any[];
  patient: any;
  doctorName?: string;
  clinic?: { name?: string; address?: string; phone?: string } | null;
  lang: Lang;
}) {
  const { prescription, items, patient, doctorName, clinic, lang } = opts;
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const fontFamily = isAr
    ? "'Cairo','Tajawal','Noto Naskh Arabic','Segoe UI',Tahoma,Arial,sans-serif"
    : "'Inter','Helvetica Neue',Arial,sans-serif";

  if (isAr && !document.getElementById("__cairo_font__")) {
    const link = document.createElement("link");
    link.id = "__cairo_font__";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap";
    document.head.appendChild(link);
    await new Promise((r) => setTimeout(r, 600));
    try { await (document as any).fonts?.ready; } catch {}
  }

  const L = {
    rx: isAr ? "روشتة طبية" : "PRESCRIPTION",
    patient: isAr ? "المريض" : "PATIENT",
    date: isAr ? "التاريخ" : "DATE",
    med: isAr ? "الدواء" : "Medication",
    dosage: isAr ? "الجرعة" : "Dosage",
    freq: isAr ? "التكرار" : "Frequency",
    dur: isAr ? "المدة" : "Duration",
    qty: isAr ? "الكمية" : "Qty",
    notes: isAr ? "ملاحظات" : "Notes",
    doctor: isAr ? "الطبيب" : "Doctor",
    generated: isAr ? "تم الإنشاء" : "Generated",
  };
  const pname = patientDisplayName(patient, isAr ? "ar" : "en");

  const rows = items.map((it, i) => {
    const name = isAr
      ? (it.medications?.name_ar || it.medications?.name_en || "")
      : (it.medications?.name_en || it.medications?.name_ar || "");
    const instr = isAr ? it.instructions_ar : it.instructions_en;
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:7px;text-align:center;width:28px;">${i + 1}</td>
      <td style="padding:7px;">${esc(name)}${it.medications?.strength ? ` <span style="color:#666;">${esc(it.medications.strength)}</span>` : ""}${instr ? `<div style="font-size:10px;color:#666;margin-top:2px;">${esc(instr)}</div>` : ""}</td>
      <td style="padding:7px;">${esc(it.dosage ?? "—")}</td>
      <td style="padding:7px;">${esc(it.frequency ?? "—")}</td>
      <td style="padding:7px;">${esc(it.duration ?? "—")}</td>
      <td style="padding:7px;text-align:center;">${esc(it.quantity ?? 1)}</td>
    </tr>`;
  }).join("");

  const notes = isAr ? (prescription?.notes_ar || prescription?.notes_en) : (prescription?.notes_en || prescription?.notes_ar);

  const html = `
  <div dir="${dir}" lang="${lang}" style="
    width: 794px; background:#fff; color:#111;
    font-family:${fontFamily}; font-size:13px; line-height:1.45; box-sizing:border-box;">
    <div style="background:#3a1a5e;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:18px;font-weight:700;">${esc(clinic?.name || "ZMedico Clinic")}</div>
        ${clinic?.address ? `<div style="font-size:11px;opacity:.9;">${esc(clinic.address)}</div>` : ""}
        ${clinic?.phone ? `<div style="font-size:11px;opacity:.9;">${esc(clinic.phone)}</div>` : ""}
      </div>
      <div style="text-align:${isAr ? "left" : "right"};font-size:22px;font-weight:700;letter-spacing:1px;">${L.rx}</div>
    </div>
    <div style="padding:18px 28px 0;display:flex;justify-content:space-between;gap:16px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.patient}</div>
        <div style="font-weight:600;margin-top:4px;">${esc(pname)}${patient?.patient_code ? `  #${esc(patient.patient_code)}` : ""}</div>
        ${patient?.phone ? `<div style="color:#666;font-size:12px;">${esc(patient.phone)}</div>` : ""}
      </div>
      <div style="text-align:${isAr ? "right" : "left"};">
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.date}</div>
        <div style="margin-top:4px;">${esc(fmtDate(prescription?.prescription_date || prescription?.created_at, lang))}</div>
      </div>
    </div>
    <div style="padding:16px 28px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#3a1a5e;color:#fff;">
          <th style="padding:8px;text-align:center;">#</th>
          <th style="padding:8px;text-align:${isAr ? "right" : "left"};">${L.med}</th>
          <th style="padding:8px;text-align:${isAr ? "right" : "left"};">${L.dosage}</th>
          <th style="padding:8px;text-align:${isAr ? "right" : "left"};">${L.freq}</th>
          <th style="padding:8px;text-align:${isAr ? "right" : "left"};">${L.dur}</th>
          <th style="padding:8px;text-align:center;">${L.qty}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${notes ? `<div style="padding:14px 28px 0;"><div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.notes}</div><div style="font-size:12px;color:#333;margin-top:4px;white-space:pre-wrap;">${esc(notes)}</div></div>` : ""}
    <div style="padding:40px 28px 18px;display:flex;justify-content:${isAr ? "flex-start" : "flex-end"};">
      <div style="text-align:center;">
        <div style="border-top:1px solid #999;width:200px;padding-top:6px;font-size:11px;color:#666;">${esc(doctorName || L.doctor)}</div>
      </div>
    </div>
    <div style="padding:12px 28px;border-top:1px solid #e5e5e5;font-size:10px;color:#888;text-align:${isAr ? "left" : "right"};">${L.generated}: ${esc(new Date().toLocaleString(isAr ? "ar-EG" : "en-GB"))}</div>
  </div>`;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  const node = container.firstElementChild as HTMLElement;
  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
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
    doc.save(`Rx-${prescription?.id?.slice(0, 8) ?? "prescription"}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}