import { afterEach, describe, expect, it, vi } from "vitest";

// C26: the customer PDF printed the stored tokens — `paid` and `bank_transfer` —
// while every other screen in the Arabic app names those values in Arabic. The
// fix may only change the two display strings; the numbers in this document are
// the owner's red line, so the fixture below asserts the totals are untouched.
const captured = vi.hoisted(() => ({ html: "" }));

vi.mock("html2canvas", () => ({
  default: async (node: HTMLElement) => {
    captured.html = node.innerHTML;
    return {
      width: 794,
      height: 1000,
      toDataURL: () => "data:image/jpeg;base64,AA",
    };
  },
}));

vi.mock("jspdf", () => ({
  default: class FakeJsPdf {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    addImage() {}
    addPage() {}
    autoPrint() {}
    output() {
      return new Blob(["pdf"], { type: "application/pdf" });
    }
    save() {}
  },
}));

import { generateInvoicePdf } from "./invoicePdf";

const invoice = {
  invoice_number: "INV-C26-0001",
  invoice_date: "2026-11-01",
  status: "paid",
  subtotal: 100,
  discount: 10,
  tax: 5,
  total: 95,
  paid_amount: 95,
  notes: null,
};
const items = [
  { description_en: "Consultation", description_ar: "كشف", quantity: 1, unit_price: 100, total: 100 },
];
const payments = [
  { payment_date: "2026-11-01", payment_method: "bank_transfer", reference_number: "TRX-1", amount: 95 },
];

async function render(lang: "ar" | "en") {
  captured.html = "";
  await generateInvoicePdf({
    invoice,
    items,
    payments,
    patient: { full_name_en: "Test Patient", full_name_ar: "مريض اختبار" },
    branch: { name_en: "ZMedico Clinic", name_ar: "عيادة زد ميديكو" },
    logoUrl: null,
    lang,
    mode: "download",
    t: (k: string) => k,
  });
  return captured.html;
}

afterEach(() => {
  document.getElementById("__invoice_arabic_font_face__")?.remove();
  vi.useRealTimers();
});

describe("C26: the invoice PDF names the status and payment method it stores", () => {
  it("prints the Arabic words for invoice_status and payment_method", async () => {
    const html = await render("ar");
    expect(html).toContain("مدفوعة");
    expect(html).toContain("تحويل بنكي");
    expect(html).not.toContain("bank_transfer");
    expect(html).not.toMatch(/>\s*paid\s*</i);
  });

  it("keeps the English desk reading a sentence, not a token", async () => {
    const html = await render("en");
    expect(html).toContain("bank transfer");
    expect(html).not.toContain("bank_transfer");
    expect(html).toMatch(/>\s*paid\s*</i);
  });

  it("changes no number in the document", async () => {
    const html = await render("en");
    // subtotal 100, discount 10, tax 5, total 95, paid 95, remaining 0
    for (const amount of ["100.00", "10.00", "5.00", "95.00", "0.00"]) {
      expect(html, `${amount} disappeared from the PDF`).toContain(amount);
    }
  });
});
