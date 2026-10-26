import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const paymentDialog = readFileSync("src/pages/payments/RecordPaymentDialog.tsx", "utf8");
const referrerPicker = readFileSync("src/pages/patients/ReferrerPicker.tsx", "utf8");
const invoiceDialog = readFileSync("src/pages/invoices/CreateInvoiceDialog.tsx", "utf8");
const dictionary = readFileSync("src/lib/i18n.ts", "utf8");

it("gives the payment pickers a search hint in the language the screen is using", () => {
  expect(paymentDialog).toContain('searchPlaceholder={lang === "ar" ? "ابحث عن مريض..." : "Search patient..."}');
  expect(paymentDialog).toContain('searchPlaceholder={lang === "ar" ? "ابحث عن فاتورة..." : "Search invoice..."}');
  expect(paymentDialog).not.toMatch(/searchPlaceholder="/);
});

it("localizes the referrer picker fallback instead of stranding English in an Arabic form", () => {
  expect(referrerPicker).toContain('searchPlaceholder ?? (lang === "ar" ? "ابحث عن مريض..." : "Search patient...")');
  expect(referrerPicker).not.toMatch(/searchPlaceholder \?\? "/);
});

it("sends the empty-invoice guard through the dictionary instead of a bare English literal", () => {
  expect(invoiceDialog).toContain('toast.error(t("addAtLeastOneItem"))');
  expect(invoiceDialog).not.toContain('toast.error("Add at least one item")');
});

it("carries the copy these screens now show in both language halves of the dictionary", () => {
  expect(dictionary.match(/addAtLeastOneItem:/g)).toHaveLength(2);
  expect(dictionary).toContain('addAtLeastOneItem: "أضف بندًا واحدًا على الأقل"');
  expect(dictionary.match(/exporting:/g)).toHaveLength(2);
  expect(dictionary).toContain('exporting: "جارٍ التصدير…"');
});
