import { describe, expect, it } from "vitest";
import {
  isLikelyStaleChunkError,
  shouldAttemptStaleChunkReload,
} from "./chunkRecovery";

describe("chunk recovery", () => {
  it("recognizes the production stale dynamic-import failure", () => {
    expect(
      isLikelyStaleChunkError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://zmedico.com/assets/Patients-DIJhp-MZ.js",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    "Importing a module script failed.",
    "ChunkLoadError: Loading chunk 218 failed.",
    "Error loading dynamically imported module: /assets/Queue.js",
    "Unable to preload CSS for /assets/page.css",
  ])("recognizes browser/bundler chunk error: %s", (message) => {
    expect(isLikelyStaleChunkError(message)).toBe(true);
  });

  it("does not treat normal application errors as stale chunks", () => {
    expect(isLikelyStaleChunkError(new Error("Patient not found"))).toBe(false);
  });

  it("allows one recovery attempt and blocks a reload loop for 60 seconds", () => {
    const error = new Error("Failed to fetch dynamically imported module: /assets/Patients-old.js");
    const now = 100_000;

    expect(shouldAttemptStaleChunkReload(error, null, now, true)).toBe(true);
    expect(shouldAttemptStaleChunkReload(error, now - 10_000, now, true)).toBe(false);
    expect(shouldAttemptStaleChunkReload(error, now - 60_000, now, true)).toBe(true);
  });

  it("does not auto-reload while offline", () => {
    const error = new Error("ChunkLoadError: Loading chunk 1 failed.");
    expect(shouldAttemptStaleChunkReload(error, null, Date.now(), false)).toBe(false);
  });
});
