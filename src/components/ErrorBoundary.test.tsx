import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";

const reportClientError = vi.hoisted(() => vi.fn());
const recoverFromStaleChunk = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/lib/observability/reportError", () => ({
  reportClientError: reportClientError,
}));
vi.mock("@/lib/chunkRecovery", () => ({
  recoverFromStaleChunk: recoverFromStaleChunk,
}));

import { ErrorBoundary } from "./ErrorBoundary";

// Mirrors tests/playwright/core-routes.admin.spec.ts:32. The core-routes audit
// fails a page if its body text matches this, so the Arabic half of the card
// has to stay inside it too — otherwise an Arabic session crashes silently and
// the E2E reports the route as healthy. deskCopy.test.ts diffs this literal
// against the real spec file so the two cannot drift.
const FATAL_TEXT =
  /Something went wrong|The app hit an unexpected error|تعذّر تحميل الصفحة|حدث خطأ غير متوقع/i;

const MESSAGE = "boom: cannot read properties of undefined";

let shouldThrow = true;

function Boom() {
  if (shouldThrow) throw new Error(MESSAGE);
  return <div>child content</div>;
}

function renderBoundary() {
  return render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
}

beforeEach(() => {
  shouldThrow = true;
  reportClientError.mockClear();
  recoverFromStaleChunk.mockClear();
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("passes children through when nothing throws", () => {
    shouldThrow = false;
    const { getByText, queryByRole } = renderBoundary();
    expect(getByText("child content")).toBeInTheDocument();
    expect(queryByRole("alert")).toBeNull();
  });

  it("shows the English card by default", () => {
    const { getByRole, getByText, container } = renderBoundary();
    expect(getByRole("alert").textContent).toContain("Something went wrong");
    expect(
      getByText(
        "The app hit an unexpected error while rendering. You can try again or reload the page.",
      ),
    ).toBeInTheDocument();
    expect(getByText("Try again")).toBeInTheDocument();
    expect(getByText("Reload")).toBeInTheDocument();
    expect(
      (container.firstElementChild as HTMLElement).getAttribute("dir"),
    ).toBe("ltr");
  });

  it("shows the Arabic card, right-to-left, when the stored language is ar", () => {
    window.localStorage.setItem("zmedico.lang", "ar");
    const { getByRole, getByText, container } = renderBoundary();
    expect(getByRole("alert").textContent).toContain("حدث خطأ غير متوقع");
    expect(getByText("إعادة المحاولة")).toBeInTheDocument();
    expect(getByText("تحديث الصفحة")).toBeInTheDocument();
    expect(
      (container.firstElementChild as HTMLElement).getAttribute("dir"),
    ).toBe("rtl");
    // No English leftovers on the Arabic card.
    expect(getByRole("alert").textContent).not.toContain("Something went wrong");
    expect(getByRole("alert").textContent).not.toContain("Reload");
  });

  it("ignores a stored language the app does not support", () => {
    window.localStorage.setItem("zmedico.lang", "fr");
    const { getByRole, container } = renderBoundary();
    expect(getByRole("alert").textContent).toContain("Something went wrong");
    expect(
      (container.firstElementChild as HTMLElement).getAttribute("dir"),
    ).toBe("ltr");
  });

  it("collapses the raw message into a technical-details disclosure", () => {
    window.localStorage.setItem("zmedico.lang", "ar");
    const { container } = renderBoundary();
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("تفاصيل تقنية");
    expect(details?.textContent).toContain(MESSAGE);
    // The stack-trace-ish text belongs in the disclosure, not on the face of
    // the card the patient-facing desk is looking at.
    const heading = container.querySelector("h1");
    const body = container.querySelector("h1 + p");
    expect(heading?.textContent).not.toContain(MESSAGE);
    expect(body?.textContent).not.toContain(MESSAGE);
  });

  it("keeps both card languages inside the Playwright crash detector", () => {
    const english = renderBoundary();
    expect(FATAL_TEXT.test(english.getByRole("alert").textContent ?? "")).toBe(
      true,
    );
    english.unmount();

    window.localStorage.setItem("zmedico.lang", "ar");
    const arabic = renderBoundary();
    expect(FATAL_TEXT.test(arabic.getByRole("alert").textContent ?? "")).toBe(
      true,
    );
  });

  it("re-renders the subtree from Try again once the fault is gone", () => {
    const { getByText, queryByText } = renderBoundary();
    expect(queryByText("child content")).toBeNull();
    shouldThrow = false;
    fireEvent.click(getByText("Try again"));
    expect(getByText("child content")).toBeInTheDocument();
  });

  it("reloads from the second button", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...original, reload },
    });
    try {
      const { getByText } = renderBoundary();
      fireEvent.click(getByText("Reload"));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it("still reports the crash and checks for a stale chunk", () => {
    window.localStorage.setItem("zmedico.lang", "ar");
    renderBoundary();
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "boundary", message: MESSAGE }),
    );
    expect(reportClientError.mock.calls[0][0]).toHaveProperty("component");
    expect(recoverFromStaleChunk).toHaveBeenCalled();
  });
});
