import { describe, expect, it } from "vitest";
import { appointmentWhatsAppMessage, buildWhatsAppLink, invoiceWhatsAppMessage } from "./whatsapp";

describe("WhatsApp helpers", () => {
  it("builds an international wa.me link without exposing a plus sign in the path", () => {
    expect(buildWhatsAppLink("+20 111 444 0993", "Hello there")).toBe(
      "https://wa.me/201114440993?text=Hello%20there",
    );
  });

  it("creates localized appointment messages", () => {
    expect(appointmentWhatsAppMessage({
      patientName: "Mohamed",
      appointmentDate: "08/26/2026, 10:30 AM",
      branchName: "Blitz Physio",
      lang: "en",
    })).toContain("Your appointment at Blitz Physio is confirmed");
    expect(appointmentWhatsAppMessage({
      patientName: "محمد",
      appointmentDate: "26/08/2026 10:30",
      branchName: "بليتز فيزيو",
      lang: "ar",
    })).toContain("تأكيد موعدك");
  });

  it("creates invoice messages with the remaining balance", () => {
    expect(invoiceWhatsAppMessage({
      patientName: "Mohamed",
      invoiceNumber: "INV-10",
      total: 500,
      remaining: 200,
      lang: "en",
    })).toContain("Remaining: 200");
  });
});
