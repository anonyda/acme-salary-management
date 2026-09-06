import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Employee, listEmployees, type ListEmployeesResponse } from "@/api/client";
import { EmployeeTable } from "@/components/EmployeeTable";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return { ...actual, listEmployees: vi.fn() };
});

const mockedListEmployees = vi.mocked(listEmployees);

const sampleEmployee: Employee = {
  id: 1,
  full_name: "Alice Johnson",
  email: "alice.johnson@acme.test",
  department: "Engineering",
  title: "Software Engineer",
  level: "L2",
  country: "US",
  manager_id: null,
  hire_date: "2022-01-01",
  status: "active",
  created_at: "2022-01-01",
  updated_at: "2022-01-01",
  salary: { amount: 90000, currency: "USD", effective_date: "2022-01-01" },
};

function makeResponse(overrides: Partial<ListEmployeesResponse> = {}): ListEmployeesResponse {
  return { data: [sampleEmployee], page: 1, limit: 25, total: 1, ...overrides };
}

describe("EmployeeTable", () => {
  beforeEach(() => {
    mockedListEmployees.mockReset();
    mockedListEmployees.mockResolvedValue(makeResponse());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders employees returned by the API", async () => {
    render(<EmployeeTable />);
    expect(await screen.findByText("Alice Johnson")).toBeInTheDocument();
  });

  it("debounces search input, firing one request after typing settles", async () => {
    render(<EmployeeTable />);
    await waitFor(() => expect(mockedListEmployees).toHaveBeenCalledTimes(1));
    mockedListEmployees.mockClear();

    vi.useFakeTimers();

    const searchInput = screen.getByLabelText("Search employees");
    fireEvent.change(searchInput, { target: { value: "ali" } });

    // Still inside the 300ms debounce window — no request yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(mockedListEmployees).not.toHaveBeenCalled();

    // Past the debounce window — exactly one request, with page reset to 1.
    // Two React state-update hops happen after the timer fires (debounced
    // value -> query.search -> fetch effect), so the timer advance needs to
    // run inside act() for React to flush both synchronously.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(mockedListEmployees).toHaveBeenCalledTimes(1);
    expect(mockedListEmployees).toHaveBeenCalledWith(expect.objectContaining({ search: "ali", page: 1 }));

    // Clearing resets the input immediately and re-fetches with defaults.
    mockedListEmployees.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(searchInput).toHaveValue("");
    expect(mockedListEmployees).toHaveBeenCalledTimes(1);
    expect(mockedListEmployees).toHaveBeenCalledWith(expect.objectContaining({ search: undefined, page: 1 }));

    // The debounce hook's timer for "ali" was still pending in the
    // background — it must not fire a second, redundant fetch once it
    // eventually settles, now that clearing also reset settledSearch.
    mockedListEmployees.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mockedListEmployees).not.toHaveBeenCalled();
  });

  it("resets to page 1 and re-fetches once when a filter changes", async () => {
    mockedListEmployees.mockResolvedValue(makeResponse({ total: 100 }));
    render(<EmployeeTable />);
    await waitFor(() => expect(mockedListEmployees).toHaveBeenCalledTimes(1));
    mockedListEmployees.mockClear();

    const user = userEvent.setup();

    // Move off page 1 first, so the filter's page reset is actually exercised.
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mockedListEmployees).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    mockedListEmployees.mockClear();

    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Engineering" }));

    await waitFor(() => expect(mockedListEmployees).toHaveBeenCalledTimes(1));
    expect(mockedListEmployees).toHaveBeenCalledWith(expect.objectContaining({ department: "Engineering", page: 1 }));
  });

  it("clears an active filter and re-fetches with defaults", async () => {
    render(<EmployeeTable />);
    await waitFor(() => expect(mockedListEmployees).toHaveBeenCalledTimes(1));
    mockedListEmployees.mockClear();

    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Engineering" }));
    await waitFor(() =>
      expect(mockedListEmployees).toHaveBeenCalledWith(expect.objectContaining({ department: "Engineering" })),
    );
    mockedListEmployees.mockClear();

    expect(screen.getByRole("button", { name: "Clear filters" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("combobox", { name: "Department" })).toHaveTextContent(/all department/i);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    await waitFor(() => expect(mockedListEmployees).toHaveBeenCalledTimes(1));
    expect(mockedListEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        search: undefined,
        department: undefined,
        country: undefined,
        level: undefined,
      }),
    );
  });
});
