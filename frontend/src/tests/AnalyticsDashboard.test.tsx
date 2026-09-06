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
    expect(screen.getByText("$620.0M")).toBeInTheDocument();

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

  it("fetches with all filters undefined on initial load", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);

    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");

    expect(mockedGetAnalyticsSummary).toHaveBeenCalledWith({
      department: undefined,
      country: undefined,
      level: undefined,
    });
  });

  it("re-fetches with the selected department when that filter changes", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");
    mockedGetAnalyticsSummary.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Engineering" }));

    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenCalledWith({
        department: "Engineering",
        country: undefined,
        level: undefined,
      }),
    );
  });

  it("combines country and level filters into a single query once both change", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(mockSummary);
    render(<AnalyticsDashboard />);
    await screen.findByText("Total global payroll");

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Country" }));
    await user.click(await screen.findByRole("option", { name: "US" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: undefined,
        country: "US",
        level: undefined,
      }),
    );

    await user.click(screen.getByRole("combobox", { name: "Level" }));
    await user.click(await screen.findByRole("option", { name: "L2" }));
    await waitFor(() =>
      expect(mockedGetAnalyticsSummary).toHaveBeenLastCalledWith({
        department: undefined,
        country: "US",
        level: "L2",
      }),
    );
  });
});
