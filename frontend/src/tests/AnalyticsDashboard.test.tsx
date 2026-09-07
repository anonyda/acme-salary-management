import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AnalyticsSummary, getAnalyticsSummary } from "@/api/client";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return { ...actual, getAnalyticsSummary: vi.fn() };
});

const mockedGetAnalyticsSummary = vi.mocked(getAnalyticsSummary);

const mockSummary: AnalyticsSummary = {
  kpis: { totalPayrollUSD: 620_000_000, activeHeadcount: 9622, avgSalaryUSD: 64453, medianSalaryUSD: 64395 },
  byDepartment: [
    { department: "Engineering", headcount: 1629, avgSalaryUSD: 64020, medianSalaryUSD: 63700 },
    { department: "Sales", headcount: 1550, avgSalaryUSD: 63155, medianSalaryUSD: 63500 },
  ],
  byCountry: [
    { country: "DE", avgSalaryUSD: 75250, medianSalaryUSD: 67689, totalPayrollUSD: 107_080_183 },
    { country: "US", avgSalaryUSD: 96336, medianSalaryUSD: 86500, totalPayrollUSD: 330_431_000 },
  ],
  distributionByCountry: [],
};

describe("AnalyticsDashboard", () => {
  beforeEach(() => {
    mockedGetAnalyticsSummary.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the four KPI cards with values formatted from the API response", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);

    render(<AnalyticsDashboard />);

    expect(await screen.findByText("Total global payroll")).toBeInTheDocument();
    // Node's Intl.NumberFormat compact-notation trailing-zero behavior
    // differs by version (Node 22: "$620.0M", Node 24: "$620M") — this
    // assertion matches whichever Node this test suite is currently
    // running under, since it's the runtime formatting behavior under
    // test, not a fixed string this app controls.
    expect(
      screen.getByText(
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(
          620_000_000,
        ),
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Active headcount")).toBeInTheDocument();
    expect(screen.getByText("9,622")).toBeInTheDocument();

    expect(screen.getByText("Average salary")).toBeInTheDocument();
    expect(screen.getByText("$64,453")).toBeInTheDocument();

    expect(screen.getByText("Median salary")).toBeInTheDocument();
    expect(screen.getByText("$64,395")).toBeInTheDocument();
  });

  it("shows a loading state before the API responds", () => {
    mockedGetAnalyticsSummary.mockReturnValue(new Promise(() => {})); // never resolves

    render(<AnalyticsDashboard />);

    expect(screen.getByText(/loading analytics/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    mockedGetAnalyticsSummary.mockRejectedValue(new Error("network down"));

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText("Failed to load analytics.")).toBeInTheDocument());
    expect(screen.queryByText("Total global payroll")).not.toBeInTheDocument();
  });

  it("shows a retry button on a failed first load, and recovers on retry", async () => {
    mockedGetAnalyticsSummary.mockRejectedValueOnce(new Error("network down"));

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText("Failed to load analytics.")).toBeInTheDocument());
    const retryButton = screen.getByRole("button", { name: "Retry" });

    mockedGetAnalyticsSummary.mockResolvedValueOnce(mockSummary);
    await userEvent.click(retryButton);

    expect(await screen.findByText("Total global payroll")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load analytics.")).not.toBeInTheDocument();
  });

  it("keeps showing the last summary (with an error banner and retry) when a reload fails", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");

    mockedGetAnalyticsSummary.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Department" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Engineering" }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByText("Failed to load analytics.")).toBeInTheDocument());
    // The last-known-good summary is still on screen, not replaced by a
    // blank error state.
    expect(screen.getByText("Total global payroll")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("fetches with all filters empty on initial load", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);

    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");

    expect(mockedGetAnalyticsSummary).toHaveBeenCalledWith({ department: [], country: [], level: [] });
  });

  it("re-fetches with the selected department when that filter changes", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");
    mockedGetAnalyticsSummary.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Department" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Engineering" }));

    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenCalledWith({
        department: ["Engineering"],
        country: [],
        level: [],
      }),
    );
  });

  it("supports selecting multiple values in one filter, for side-by-side comparison", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");
    mockedGetAnalyticsSummary.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Department" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Engineering" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: ["Engineering"],
        country: [],
        level: [],
      }),
    );

    // The menu stays open across selections (comparison is the point).
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Sales" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: ["Engineering", "Sales"],
        country: [],
        level: [],
      }),
    );

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Department" })).toHaveTextContent("Department (2)");
  });

  it("combines country and level filters into a single query once both change", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "US" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: [],
        country: ["US"],
        level: [],
      }),
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Level" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "L2" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: [],
        country: ["US"],
        level: ["L2"],
      }),
    );
  });

  it("clears active filters and re-fetches with everything empty", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");

    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Department" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Engineering" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: ["Engineering"],
        country: [],
        level: [],
      }),
    );
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Clear filters" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("button", { name: "Department" })).toHaveTextContent(/all department/i);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: [],
        country: [],
        level: [],
      }),
    );
  });
});
