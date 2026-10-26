import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportButtons } from "./_shared";

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ lang: "en", t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("report export buttons", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(cleanup);

  it("refuses a second PDF export while the first one is still running", async () => {
    const job = deferred();
    const onPdf = vi.fn(() => job.promise);
    render(<ExportButtons onPdf={onPdf} />);
    const pdf = screen.getByRole("button", { name: /PDF/ });

    fireEvent.click(pdf);
    fireEvent.click(pdf);
    expect(onPdf).toHaveBeenCalledTimes(1);
    expect(pdf).toBeDisabled();
    expect(screen.getByRole("button", { name: /exporting/i })).toBeTruthy();

    await act(async () => { job.resolve(); });
  });

  it("blocks the other format for the whole duration of a running export", async () => {
    const job = deferred();
    const onPdf = vi.fn(() => job.promise);
    const onExcel = vi.fn();
    render(<ExportButtons onPdf={onPdf} onExcel={onExcel} />);

    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    const excel = screen.getByRole("button", { name: /Excel/ });
    expect(excel).toBeDisabled();
    fireEvent.click(excel);
    expect(onExcel).not.toHaveBeenCalled();

    await act(async () => { job.resolve(); });
  });

  it("returns both buttons to their normal labels once the export finishes", async () => {
    const job = deferred();
    const onPdf = vi.fn(() => job.promise);
    const onExcel = vi.fn();
    render(<ExportButtons onPdf={onPdf} onExcel={onExcel} />);

    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    await act(async () => { job.resolve(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /PDF/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: /Excel/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /exporting/i })).toBeNull();
  });

  it("says so when an export fails instead of rejecting silently", async () => {
    const onPdf = vi.fn(() => Promise.reject(new Error("html2canvas blew up")));
    render(<ExportButtons onPdf={onPdf} />);

    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("backupExportFailed"));
    await waitFor(() => expect(screen.getByRole("button", { name: /PDF/ })).toBeEnabled());
  });

  it("leaves out the button whose exporter the page did not provide", () => {
    render(<ExportButtons onExcel={() => {}} />);
    expect(screen.queryByRole("button", { name: /PDF/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Excel/ })).toBeTruthy();
  });
});
