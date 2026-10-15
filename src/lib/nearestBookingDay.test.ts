import { describe, expect, it, vi } from "vitest";
import { nearestBookingDay } from "./nearestBookingDay";
describe("nearestBookingDay", () => {
  it("uses the first available day, excludes unavailable slots", async () => {
    const load = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ available: false }, { available: true }]);
    expect(await nearestBookingDay("2026-10-14", "2026-11-14", null, load, () => true)).toEqual({ day: "2026-10-15", slots: [{ available: true }] });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("caps queries at fourteen days", async () => {
    const load = vi.fn().mockResolvedValue([]);
    expect(await nearestBookingDay("2026-10-14", "2026-11-14", null, load, () => true)).toBeNull();
    expect(load).toHaveBeenCalledTimes(14);
  });
  it("respects the booking horizon", async () => {
    const load = vi.fn().mockResolvedValue([]);
    await nearestBookingDay("2026-10-14", "2026-10-14", null, load, () => true);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("skips closed weekdays", async () => {
    const load = vi.fn().mockResolvedValue([{ available: true }]);
    expect((await nearestBookingDay("2026-10-14", "2026-10-20", [5], load, () => true))?.day).toBe("2026-10-16");
  });
  it("discards an in-flight result after scope changes", async () => {
    let current = true;
    const load = vi.fn(async () => { current = false; return [{ available: true }]; });
    expect(await nearestBookingDay("2026-10-14", "2026-10-20", null, load, () => current)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("does not hide RPC errors as empty availability", async () => {
    await expect(nearestBookingDay("2026-10-14", "2026-10-20", null, async () => { throw Error("offline"); }, () => true)).rejects.toThrow("offline");
  });
});
