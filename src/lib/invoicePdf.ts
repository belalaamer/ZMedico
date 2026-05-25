import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Lang = "en" | "ar";

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

export async function generateInvoicePdf(opts: {
  invoice: any;
  items: any[];
  payments: any[];
  patient: any;
  branch?: { name_en?: string; name_ar?: string; address?: string; phone?: string } | null;
  lang: Lang;
  mode?: "download" | "print";
  t: (k: string) => string;
}) {
  const { invoice, items, payments, patient, branch, lang, mode = "download", t } = opts;

  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const remaining = +(Number(invoice.total) - Number(invoice.paid_amount)).toFixed(2);
  const patientName = isAr
    ? `${patient?.first_name_ar ?? patient?.first_name_en ?? ""} ${patient?.last_name_ar ?? patient?.last_name_en ?? ""}`.trim()
    : `${patient?.first_name_en ?? ""} ${patient?.last_name_en ?? ""}`.trim();
  const branchName = (isAr ? branch?.name_ar : branch?.name_en) || branch?.name_en || branch?.name_ar || "ZMedico Clinic";

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
      <td>${esc(isAr ? (it.description_ar || it.description_en) : (it.description_en || it.description_ar))}</td>
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
    font-family: ${isAr ? "'Cairo','Tajawal','Noto Naskh Arabic','Segoe UI',Tahoma,Arial,sans-serif" : "'Inter','Helvetica Neue',Arial,sans-serif"};
    font-size: 13px;
    line-height: 1.45;
    box-sizing: border-box;
  ">
    <div style="background:#3a1a5e;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="background:#fff;color:#3a1a5e;width:44px;height:44px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;">Z</div>
        <div>
          <div style="font-size:18px;font-weight:700;">${esc(branchName)}</div>
          ${branch?.address ? `<div style="font-size:11px;opacity:.9;">${esc(branch.address)}</div>` : ""}
          ${branch?.phone ? `<div style="font-size:11px;opacity:.9;">${esc(branch.phone)}</div>` : ""}
        </div>
      </div>
      <div style="text-align:${isAr ? "left" : "right"};">
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">${L.invoice}</div>
        <div style="font-size:12px;opacity:.9;">${esc(invoice.invoice_number)}</div>
      </div>
    </div>

    <div style="padding:18px 28px 0;display:flex;justify-content:space-between;gap:16px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.billTo}</div>
        <div style="font-weight:600;margin-top:4px;">${esc(patientName)}${patient?.patient_code ? `  #${esc(patient.patient_code)}` : ""}</div>
        ${patient?.phone ? `<div style="color:#666;font-size:12px;">${esc(patient.phone)}</div>` : ""}
        ${patient?.email ? `<div style="color:#666;font-size:12px;">${esc(patient.email)}</div>` : ""}
      </div>
      <div style="text-align:${isAr ? "right" : "left"};">
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.invoiceDate}</div>
        <div style="margin-top:4px;">${esc(fmtDate(invoice.invoice_date, lang))}</div>
      </div>
      <div style="text-align:${isAr ? "left" : "right"};">
        <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.status}</div>
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
        ${invoice.notes ? `<div style="font-size:10px;font-weight:700;color:#666;letter-spacing:1px;">${L.notes}</div><div style="font-size:12px;color:#333;margin-top:4px;white-space:pre-wrap;">${esc(invoice.notes)}</div>` : ""}
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
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #eee;">
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

  // Load Arabic web font if needed
  if (isAr && !document.getElementById("__cairo_font__")) {
    const link = document.createElement("link");
    link.id = "__cairo_font__";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap";
    document.head.appendChild(link);
    // give the font a moment to load
    await new Promise((r) => setTimeout(r, 600));
    try { await (document as any).fonts?.ready; } catch {}
  }

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
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight) {
      doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    } else {
      // Multi-page: slice the canvas
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