import { beforeEach, expect, it, vi } from "vitest";
const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/reportError", () => ({ reportClientError: report }));
import { reportAuthFailure } from "./authFailureTelemetry";
beforeEach(() => report.mockReset());
it("reports a known structural Auth code without private diagnostics", () => {
  reportAuthFailure("update-password", "rejected", { code: "weak_password", message: "private password", stack: "private stack", context: "private response" });
  expect(report).toHaveBeenCalledWith({ kind: "error", component: "AuthRecovery", message: "auth.update-password.rejected:weak_password" });
});
it.each([null, new Error("private diagnostic"), { code: "private-email@example.invalid" }, { code: { secret: "private" } }])("does not include unrecognized diagnostic data %#", error => {
  reportAuthFailure("send-recovery-link", "transport", error);
  expect(report).toHaveBeenCalledWith({ kind: "error", component: "AuthRecovery", message: "auth.send-recovery-link.transport:unknown" });
});
