import { describe, expect, it } from "vitest";
import { normalizeSubscriptionRequest, validateSubscriptionRequest } from "./subscriptionRequest";

describe("subscription request helpers", () => {
  it("normalizes contact data before sending it to the RPC", () => {
    expect(normalizeSubscriptionRequest({ clinicName: "  Blitz Physio ", ownerName: " Belal ", email: " BELAL@EXAMPLE.COM ", phone: " 201100000000 ", planId: " plan-1 ", message: " Need a demo " })).toEqual({
      clinic_name: "Blitz Physio",
      owner_name: "Belal",
      email: "belal@example.com",
      phone: "201100000000",
      plan_id: "plan-1",
      message: "Need a demo",
    });
  });

  it("accepts a minimal valid request", () => {
    expect(validateSubscriptionRequest({ clinicName: "Clinic", ownerName: "Owner", email: "owner@example.com" })).toBeNull();
  });

  it.each([
    ["clinic_name", { clinicName: "x", ownerName: "Owner", email: "owner@example.com" }],
    ["owner_name", { clinicName: "Clinic", ownerName: "x", email: "owner@example.com" }],
    ["email", { clinicName: "Clinic", ownerName: "Owner", email: "not-an-email" }],
    ["phone", { clinicName: "Clinic", ownerName: "Owner", email: "owner@example.com", phone: "1".repeat(41) }],
    ["message", { clinicName: "Clinic", ownerName: "Owner", email: "owner@example.com", message: "x".repeat(1001) }],
  ])("rejects invalid %s", (error, draft) => {
    expect(validateSubscriptionRequest(draft)).toBe(error);
  });
});
