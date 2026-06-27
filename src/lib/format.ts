export function formatMoney(n: number | string | null | undefined, lang: "en" | "ar", currency = "EGP") {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

export function formatDate(d: string | Date | null | undefined, lang: "en" | "ar") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    year: "numeric", month: "short", day: "2-digit",
  });
}

export function formatDateTime(d: string | Date | null | undefined, lang: "en" | "ar") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Latin (0-9)
export function toLatinDigits(input: string): string {
  if (!input) return input;
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/،/g, ".");
}

export function parseLocaleNumber(input: string): number {
  const n = Number(toLatinDigits(String(input ?? "")).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Arabic-aware plural for an "N invoices" count.
// Handles 0, 1 (مفرد), 2 (مثنى), 3–10 (جمع قلة), 11+ (تمييز مفرد).
export function invoiceCountLabel(n: number, lang: "en" | "ar"): string {
  const count = Number.isFinite(n) ? n : 0;
  if (lang === "ar") {
    if (count === 0) return "لا توجد فواتير";
    if (count === 1) return "فاتورة واحدة";
    if (count === 2) return "فاتورتان";
    if (count >= 3 && count <= 10) return `${count} فواتير`;
    return `${count} فاتورة`;
  }
  return `${count} ${count === 1 ? "invoice" : "invoices"}`;
}