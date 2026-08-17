// html2canvas + jsPDF are dynamically imported inside generateInvoicePdf so the
// heavy PDF renderer is only fetched when the user clicks Print/Download.
import invoiceArabicRegularUrl from "@/assets/fonts/NotoNaskhArabic-Regular.ttf";
import invoiceArabicBoldUrl from "@/assets/fonts/NotoNaskhArabic-Bold.ttf";
import { patientDisplayName } from "@/lib/patientName";

type Lang = "en" | "ar";

const INVOICE_ARABIC_FONT_FAMILY = "InvoiceArabic";

function ensureInvoiceArabicFontFace() {
  if (typeof document === "undefined" || document.getElementById("__invoice_arabic_font_face__")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "__invoice_arabic_font_face__";
  style.textContent = `
    @font-face {
      font-family: '${INVOICE_ARABIC_FONT_FAMILY}';
      src: url('${invoiceArabicRegularUrl}') format('truetype');
      font-style: normal;
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: '${INVOICE_ARABIC_FONT_FAMILY}';
      src: url('${invoiceArabicBoldUrl}') format('truetype');
      font-style: normal;
      font-weight: 700;
      font-display: block;
    }
  `;
  document.head.appendChild(style);
}

function money(n: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0) + (lang === "ar" ? " ج.م" : " EGP");
}

function fmtDate(d: string | Date | null | undefined, lang: Lang) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric", month: "short", day: "2-digit",
  });
}

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function wrapText(value: any, opts?: { rtl?: boolean; arabic?: boolean }) {
  const text = esc(value);
  if (!text) return "";
  const rtl = opts?.rtl
    ? "direction:rtl;unicode-bidi:isolate;"
    : "direction:ltr;unicode-bidi:isolate;";
  const arabic = opts?.arabic
    ? `font-family:'${INVOICE_ARABIC_FONT_FAMILY}','Noto Naskh Arabic','Amiri','Cairo','Tajawal',Tahoma,Arial,sans-serif;letter-spacing:0;word-spacing:normal;font-feature-settings:'liga','calt','rlig','init','medi','fina','isol';text-rendering:optimizeLegibility;`
    : "";
  return `<bdi style="${rtl}${arabic}">${text}</bdi>`;
}

function transliterateInvoiceAddress(value: any) {
  const input = String(value ?? "").trim();
  if (!input || !/[\u0600-\u06FF]/.test(input)) return input;

  const phraseMap: Array<[RegExp, string]> = [
    [/التجمع الخامس/g, "Fifth Settlement"],
    [/القاهرة الجديدة/g, "New Cairo"],
    [/النرجس/g, "Al Narges"],
    [/عمارات/g, "Buildings"],
    [/(?:أ|ا)وزون مول الطبي/g, "Ozone Medical Mall"],
    [/مبنى/g, "Building"],
    [/الدور الأول/g, "First Floor"],
    [/الدور الارضي|الدور الأرضي/g, "Ground Floor"],
    [/الدور الثاني/g, "Second Floor"],
    [/الدور الثالث/g, "Third Floor"],
    [/عيادة/g, "Clinic"],
    [/شارع/g, "St."],
  ];

  const charMap: Record<string, string> = {
    "ا": "a", "أ": "a", "إ": "e", "آ": "aa", "ب": "b", "ت": "t", "ث": "th", "ج": "g", "ح": "h", "خ": "kh",
    "د": "d", "ذ": "z", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
    "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "a",
    "و": "w", "ؤ": "o", "ي": "y", "ى": "a", "ئ": "e", "ء": "", "ـ": "",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "،": ", ",
  };

  let text = input.replace(/\s+/g, " ");

  for (const [pattern, replacement] of phraseMap) {
    text = text.replace(pattern, replacement);
  }

  text = Array.from(text, (char) => charMap[char] ?? char).join("");

  return text
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateInvoicePdf(opts: {
  invoice: any;
  items: any[];
  payments: any[];
  patient: any;
  branch?: { name_en?: string; name_ar?: string; address?: string; phone?: string } | null;
  logoUrl?: string | null;
  lang: Lang;
  mode?: "download" | "print";
  t: (k: string) => string;
}) {
  const { invoice, items, payments, patient, branch, logoUrl, lang, mode = "download", t } = opts;

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const remaining = +(Number(invoice.total) - Number(invoice.paid_amount)).toFixed(2);
  const patientName = patientDisplayName(patient, isAr ? "ar" : "en");
  const branchName = (isAr ? branch?.name_ar : branch?.name_en) || branch?.name_en || branch?.name_ar || "ZMedico Clinic";
  const branchAddress = transliterateInvoiceAddress(branch?.address);

  const L = {
    invoice: isAr ? "فاتورة" : "INVOICE",
    billTo: isAr ? "فاتورة إلى" : "BILL TO",
    invoiceDate: isAr ? "تاريخ الفاتورة" : "INVOICE DATE",
    status: isAr ? "الحالة" : "STATUS",
    desc: isAr ? "الوصف" : "Description",
    qty: isAr ? "الكمية" : "Qty",
    unitPrice: isAr ? "سعر الوحدة" : "Unit Price",
    total: isAr ? "الإجمالي" : "Total",
    subtotal: isAr ? "المجموع الفرعي" : "Subtotal",
    discount: isAr ? "الخصم" : "Discount",
    tax: isAr ? "الضريبة" : "Tax",
    TOTAL: isAr ? "الإجمالي" : "TOTAL",
    paid: isAr ? "المدفوع" : "Paid",
    remaining: isAr ? "المتبقي" : "Remaining",
    notes: isAr ? "ملاحظات" : "Notes",
    payDate: isAr ? "تاريخ الدفع" : "Payment Date",
    method: isAr ? "الطريقة" : "Method",
    ref: isAr ? "المرجع" : "Reference",
    amount: isAr ? "المبلغ" : "Amount",
    thanks: isAr ? "شكراً لزيارتكم" : "Thank you for your visit",
    generated: isAr ? "تم الإنشاء" : "Generated",
  };

  const itemsRows = items.map((it, i) => `
    <tr>
      <td style="text-align:center;width:28px;">${i + 1}</td>
      <td>${wrapText(isAr ? (it.description_ar || it.description_en) : (it.description_en || it.description_ar), { rtl: isAr, arabic: isAr })}</td>
      <td style="text-align:${isAr ? "left" : "right"};width:48px;">${esc(it.quantity)}</td>
      <td style="text-align:${isAr ? "left" : "right"};width:96px;">${esc(money(it.unit_price, lang))}</td>
      <td style="text-align:${isAr ? "left" : "right"};width:96px;">${esc(money(it.total, lang))}</td>
    </tr>`).join("");

  const paymentRows = payments.map((p) => `
    <tr>
      <td>${esc(fmtDate(p.payment_date || p.created_at, lang))}</td>
      <td>${esc(String(p.payment_method).replace("_", " "))}</td>
      <td>${esc(p.reference_number || "—")}</td>
      <td style="text-align:${isAr ? "left" : "right"};">${esc(money(p.amount, lang))}</td>
    </tr>`).join("");

  const html = `
  <div id="__invoice_pdf__" dir="${dir}" lang="${lang}" style="
    width: 794px;
    padding: 0;
    background:#fff;
    color:#111;
    font-family: ${isAr ? `'${INVOICE_ARABIC_FONT_FAMILY}','Noto Naskh Arabic','Cairo','Tajawal','Segoe UI',Tahoma,Arial,sans-serif` : "'Inter','Helvetica Neue',Arial,sans-serif"};
    font-size: 13px;
    line-height: 1.45;
    letter-spacing: 0;
    word-spacing: 0;
    box-sizing: border-box;
  ">
    <div style="background:#3a1a5e;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:14px;">
        ${logoUrl
          ? `<div style="background:#fff;width:48px;height:48px;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${esc(logoUrl)}" crossorigin="anonymous" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`
          : `<div style="background:#fff;color:#3a1a5e;width:44px;height:44px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;">Z</div>`}
        <div>
          <div style="font-size:18px;font-weight:700;">${wrapText(branchName, { rtl: isAr, arabic: isAr })}</div>
          ${branchAddress ? `<div style="font-size:11px;opacity:.9;">${wrapText(branchAddress)}</div>` : ""}
          ${branch?.phone ? `<div style="font-size:11px;opacity:.9;">${wrapText(branch.phone)}</div>` : ""}
        </div>
      </div>
      <div style="text-align:${isAr ? "left" : "right"};">
        <div style="font-size:22px;font-weight:700;letter-spacing:${isAr ? 0 : 1}px;">${L.invoice}</div>
        <div style="font-size:12px;opacity:.9;">${esc(invoice.invoice_number)}</div>
      </div>
    </div>

    <div style="padding:18px 28px 0;display:flex;justify-content:space-between;gap:16px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:${isAr ? 0 : 1}px;">${L.billTo}</div>
        <div style="font-weight:600;margin-top:4px;">${wrapText(patientName, { rtl: isAr, arabic: isAr })}${patient?.patient_code ? `  #${esc(patient.patient_code)}` : ""}</div>
        ${patient?.phone ? `<div style="color:#666;font-size:12px;">${wrapText(patient.phone)}</div>` : ""}
        ${patient?.email ? `<div style="color:#666;font-size:12px;">${wrapText(patient.email)}</div>` : ""}
      </div>
      <div style="text-align:${isAr ? "right" : "left"};">
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:${isAr ? 0 : 1}px;">${L.invoiceDate}</div>
        <div style="margin-top:4px;">${esc(fmtDate(invoice.invoice_date, lang))}</div>
      </div>
      <div style="text-align:${isAr ? "left" : "right"};">
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:${isAr ? 0 : 1}px;">${L.status}</div>
        <div style="margin-top:4px;text-transform:uppercase;">${esc(invoice.status)}</div>
      </div>
    </div>

    <div style="padding:16px 28px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#3a1a5e;color:#fff;">
            <th style="padding:8px;text-align:center;">#</th>
            <th style="padding:8px;text-align:${isAr ? "right" : "left"};">${L.desc}</th>
            <th style="padding:8px;text-align:${isAr ? "left" : "right"};">${L.qty}</th>
            <th style="padding:8px;text-align:${isAr ? "left" : "right"};">${L.unitPrice}</th>
            <th style="padding:8px;text-align:${isAr ? "left" : "right"};">${L.total}</th>
          </tr>
        </thead>
        <tbody style="">
          ${itemsRows.replace(/<tr>/g, '<tr style="border-bottom:1px solid #eee;">').replace(/<td/g, '<td style="padding:8px;"').replace(/style="padding:8px;" style="/g, 'style="padding:8px;')}
        </tbody>
      </table>
    </div>

    <div style="padding:14px 28px 0;display:flex;justify-content:space-between;gap:24px;align-items:flex-start;">
      <div style="flex:1;">
        ${invoice.notes ? `<div style="font-size:10px;font-weight:700;color:#666;letter-spacing:${isAr ? 0 : 1}px;">${L.notes}</div><div style="font-size:12px;color:#333;margin-top:4px;white-space:pre-wrap;direction:${dir};unicode-bidi:plaintext;letter-spacing:0;">${wrapText(invoice.notes, { rtl: isAr, arabic: isAr })}</div>` : ""}
      </div>
      <div style="width:260px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;padding:3px 0;color:#555;"><span>${L.subtotal}</span><span>${esc(money(invoice.subtotal, lang))}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;color:#555;"><span>${L.discount}</span><span>- ${esc(money(invoice.discount, lang))}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;color:#555;"><span>${L.tax}</span><span>+ ${esc(money(invoice.tax, lang))}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd;color:#3a1a5e;font-weight:700;font-size:14px;"><span>${L.TOTAL}</span><span>${esc(money(invoice.total, lang))}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;color:#1f8a3a;"><span>${L.paid}</span><span>${esc(money(invoice.paid_amount, lang))}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;color:#c46a00;font-weight:700;"><span>${L.remaining}</span><span>${esc(money(remaining, lang))}</span></div>
      </div>
    </div>

    ${payments.length > 0 ? `
    <div style="padding:18px 28px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #eee;direction:${dir};unicode-bidi:embed;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:6px;text-align:${isAr ? "right" : "left"};">${L.payDate}</th>
            <th style="padding:6px;text-align:${isAr ? "right" : "left"};">${L.method}</th>
            <th style="padding:6px;text-align:${isAr ? "right" : "left"};">${L.ref}</th>
            <th style="padding:6px;text-align:${isAr ? "left" : "right"};">${L.amount}</th>
          </tr>
        </thead>
        <tbody>${paymentRows.replace(/<td/g, '<td style="padding:6px;border-top:1px solid #eee;"').replace(/style="padding:6px;border-top:1px solid #eee;" style="/g, 'style="padding:6px;border-top:1px solid #eee;')}</tbody>
      </table>
    </div>` : ""}

    <div style="padding:20px 28px 18px;margin-top:14px;border-top:1px solid #e5e5e5;display:flex;justify-content:space-between;font-size:10px;color:#888;">
      <span>${L.generated}: ${esc(new Date().toLocaleString(isAr ? "ar-EG" : "en-GB"))}</span>
      <span style="font-style:italic;">${L.thanks}</span>
      <span>${esc(invoice.invoice_number)}</span>
    </div>
  </div>`;

  // Load Arabic web font if needed and WAIT until it's actually usable
  if (isAr) {
    ensureInvoiceArabicFontFace();
    try {
      const sample = "التجمع الخامس النرجس عمارات أوزون مول الطبي مبنى الدور الأول عيادة ٠١٢٣٤٥٦٧٨٩";
      await Promise.all([
        (document as any).fonts?.load(`400 13px "${INVOICE_ARABIC_FONT_FAMILY}"`, sample),
        (document as any).fonts?.load(`700 14px "${INVOICE_ARABIC_FONT_FAMILY}"`, sample),
      ]);
      await (document as any).fonts?.ready;
    } catch {}
    // tiny extra tick to let layout settle
    await new Promise((r) => setTimeout(r, 300));
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);

  const node = container.firstElementChild as HTMLElement;
  try {
    const targetPixels = 4_000_000;                 // ~4 MP is ample for A4 at print quality
    const estimated = node.scrollWidth * node.scrollHeight;
    const scale = Math.max(1, Math.min(2, Math.sqrt(targetPixels / Math.max(estimated, 1))));

    const canvas = await html2canvas(node, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      letterRendering: true,
      allowTaint: true,
      foreignObjectRendering: false,
    } as any);
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight) {
      doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    } else {
      // Multi-page: slice the source canvas into page-sized bands so each page
      // only embeds the pixels it needs, avoiding both memory blow-up and the
      // stack overflow that comes from re-encoding the full image per page.
      const pageHeightPx = Math.floor((pageHeight / imgHeight) * canvas.height);
      const totalPages = Math.ceil(canvas.height / pageHeightPx);

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        if (pageIndex > 0) doc.addPage();

        const srcY = pageIndex * pageHeightPx;
        const srcH = Math.min(pageHeightPx, canvas.height - srcY);

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = srcH;
        const ctx = pageCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
        const pageImgHeight = (srcH * imgWidth) / canvas.width;
        doc.addImage(pageImgData, "JPEG", 0, 0, imgWidth, pageImgHeight);
      }
    }

    if (mode === "print") {
      doc.autoPrint();
      const pdfBlob = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, "_blank", "noopener,noreferrer");

      if (!printWindow) {
        URL.revokeObjectURL(pdfUrl);
        doc.save(`${invoice.invoice_number}.pdf`);
        return;
      }

      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
      return;
    }

    doc.save(`${invoice.invoice_number}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
