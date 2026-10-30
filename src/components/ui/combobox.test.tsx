import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Combobox, type ComboboxOption } from "./combobox";

// A page the server returned for the phone query "010": the names do not
// contain it, so only the server knows these are the matches.
const PHONE_PAGE: ComboboxOption[] = [
  { value: "p-1", label: "Salma Adel", detail: "0101234567" },
  { value: "p-2", label: "Mostafa Fathy", detail: "0109876543" },
];

function openPicker() {
  fireEvent.click(screen.getByRole("combobox"));
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("Combobox in server-search mode", () => {
  it("asks for the default page as soon as it mounts", () => {
    const onSearch = vi.fn();
    render(<Combobox options={[]} value="" onChange={() => undefined} onSearch={onSearch} />);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("sends one trimmed query per pause, not one per keystroke", async () => {
    const onSearch = vi.fn();
    render(
      <Combobox
        options={[]}
        value=""
        onChange={() => undefined}
        onSearch={onSearch}
        searchPlaceholder="Name or phone number"
        searchDelay={50}
      />,
    );
    openPicker();
    const input = await screen.findByPlaceholderText("Name or phone number");
    typeInto(input, "0");
    typeInto(input, "01");
    typeInto(input, "010");
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("010"));
    expect(onSearch.mock.calls.map((call) => call[0])).toEqual(["", "010"]);
  });

  it("lists what the server matched, even when the name does not contain the term", async () => {
    const onSearch = vi.fn();
    const onChange = vi.fn();
    render(
      <Combobox
        options={PHONE_PAGE}
        value=""
        onChange={onChange}
        onSearch={onSearch}
        searchPlaceholder="Name or phone number"
      />,
    );
    openPicker();
    // cmdk's own filter would have hidden both rows: neither label contains "010".
    expect(await screen.findByText("Salma Adel")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Salma Adel"));
    expect(onChange).toHaveBeenCalledWith("p-1");
  });

  it("will not let the desk pick from the previous page while a search runs", async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={PHONE_PAGE}
        value=""
        onChange={onChange}
        onSearch={vi.fn()}
        searching
        searchingText="Searching…"
        emptyText="No matching patients"
      />,
    );
    openPicker();
    expect(await screen.findByText("Searching…")).toBeInTheDocument();
    expect(screen.queryByText("Mostafa Fathy")).toBeNull();
  });

  it("names the selected patient even when they are not on this page", () => {
    render(
      <Combobox
        options={PHONE_PAGE}
        value="p-9"
        onChange={() => undefined}
        onSearch={vi.fn()}
        placeholder="Select patient"
        selectedLabel="Salma Adel"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Salma Adel");
  });

  it("shows the caller's failure wording instead of an empty clinic", async () => {
    // The widget cannot tell a refused read from a patient-less one; it renders
    // whichever emptyText the caller decided on. That is the whole contract.
    render(
      <Combobox
        options={[]}
        value=""
        onChange={() => undefined}
        onSearch={vi.fn()}
        emptyText="The search failed. Try again."
      />,
    );
    openPicker();
    expect(await screen.findByText("The search failed. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("No matching patients")).toBeNull();
  });

  it("puts the keep-typing hint under the input when the page is full", async () => {
    render(
      <Combobox
        options={PHONE_PAGE}
        value=""
        onChange={() => undefined}
        onSearch={vi.fn()}
        hintText="Showing the first matches only"
      />,
    );
    openPicker();
    expect(await screen.findByText("Showing the first matches only")).toBeInTheDocument();
  });
});

describe("Combobox in its own-list mode", () => {
  function Local() {
    const [value, setValue] = useState("");
    return (
      <Combobox
        options={[
          { value: "d-1", label: "Dr. Amine", keywords: "cardiology" },
          { value: "d-2", label: "Dr. Hala", keywords: "dermatology" },
        ]}
        value={value}
        onChange={setValue}
        searchPlaceholder="Search..."
        emptyText="No results found."
      />
    );
  }

  it("still filters the list it was handed, with keywords", async () => {
    render(<Local />);
    openPicker();
    const input = await screen.findByPlaceholderText("Search...");
    typeInto(input, "derm");
    expect(await screen.findByText("Dr. Hala")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Amine")).toBeNull();
  });

  it("keeps the trigger empty when nothing is selected", () => {
    render(<Local />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Select...");
  });
});
