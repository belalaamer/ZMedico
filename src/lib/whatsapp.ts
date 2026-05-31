/**
 * WhatsApp deep-link helper.
 * Builds wa.me URLs to open a chat with a pre-filled message.
 */

function normalizePhone(raw: string): string {
  // Strip everything except digits; wa.me uses international format without "+"
  return (raw || "").replace(/[^\d]/g, "");
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const num = normalizePhone(phone);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(phone: string, message: string): boolean {
  const url = buildWhatsAppLink(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function invoiceWhatsAppMessage(opts: {
  patientName: string;
  invoiceNumber: string;
  total: number | string;
  remaining: number | string;
  lang: "ar" | "en";
  link?: string;
}): string {
  const { patientName, invoiceNumber, total, remaining, lang, link } = opts;
  if (lang === "ar") {
    return [
      `مرحبًا ${patientName}،`,
      `فاتورة رقم ${invoiceNumber}`,
      `الإجمالي: ${total}`,
      `المتبقي: ${remaining}`,
      link ? `الرابط: ${link}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `Hello ${patientName},`,
    `Invoice #${invoiceNumber}`,
    `Total: ${total}`,
    `Remaining: ${remaining}`,
    link ? `Link: ${link}` : "",
  ].filter(Boolean).join("\n");
}

export function prescriptionWhatsAppMessage(opts: {
  patientName: string;
  date: string;
  lang: "ar" | "en";
  link?: string;
}): string {
  const { patientName, date, lang, link } = opts;
  if (lang === "ar") {
    return [
      `مرحبًا ${patientName}،`,
      `روشتتك بتاريخ ${date}`,
      link ? `الرابط: ${link}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `Hello ${patientName},`,
    `Your prescription dated ${date}`,
    link ? `Link: ${link}` : "",
  ].filter(Boolean).join("\n");
}