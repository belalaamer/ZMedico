import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({ lang: "en" }),
}));

import { TablePager } from "./TablePager";

describe("TablePager", () => {
  it("clamps an out-of-range page after the total shrinks", async () => {
    const onPageChange = vi.fn();

    render(
      <TablePager
        page={2}
        pageSize={50}
        total={75}
        onPageChange={onPageChange}
      />,
    );

    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(1));
  });

  it("resets a stale page to zero when the result set becomes empty", async () => {
    const onPageChange = vi.fn();

    const { container } = render(
      <TablePager
        page={3}
        pageSize={50}
        total={0}
        onPageChange={onPageChange}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(0));
  });

  it("does not move a valid page", async () => {
    const onPageChange = vi.fn();

    render(
      <TablePager
        page={1}
        pageSize={50}
        total={120}
        onPageChange={onPageChange}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
