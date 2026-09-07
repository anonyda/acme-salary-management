import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const emptyAnalyticsSummary = {
  kpis: { totalPayrollUSD: 0, activeHeadcount: 0, avgSalaryUSD: 0, medianSalaryUSD: 0 },
  byDepartment: [],
  byCountry: [],
  distributionByCountry: [],
};

// EmployeeTable (the default active tab) also fetches on mount, so the
// health-check mock needs to respond per-path rather than one fixed body.
// The analytics-summary branch is here too in case a test switches tabs —
// AnalyticsDashboard mounts (and fetches) lazily on first visit.
function mockFetchWithHealth(health: { ok: boolean; status?: number; statusText?: string; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/health")) {
        return Promise.resolve({
          ok: health.ok,
          status: health.status ?? 200,
          statusText: health.statusText ?? "OK",
          json: async () => health.body,
        });
      }
      if (url.startsWith("/api/analytics/summary")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: async () => emptyAnalyticsSummary });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: [], page: 1, limit: 25, total: 0 }),
      });
    }),
  );
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Connected once the health check succeeds", async () => {
    mockFetchWithHealth({ ok: true, body: { status: "ok" } });

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
    expect(fetch).toHaveBeenCalledWith("/health", expect.anything());
  });

  it("shows Offline if the health check fails", async () => {
    mockFetchWithHealth({ ok: false, status: 500, statusText: "Internal Server Error", body: { error: "boom" } });

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Offline").length).toBeGreaterThan(0));
  });

  it("shows the Employees tab's content by default, on page load", async () => {
    mockFetchWithHealth({ ok: true, body: { status: "ok" } });

    render(<App />);

    expect(await screen.findByText("No employees found.")).toBeInTheDocument();
  });

  it("puts the Employees/Analytics tab switcher and the status pill in the header", async () => {
    mockFetchWithHealth({ ok: true, body: { status: "ok" } });
    render(<App />);
    await screen.findByText("No employees found.");

    expect(screen.getByRole("tab", { name: "Employees" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Analytics" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
  });

  it("doesn't fetch the analytics summary until the Analytics tab is opened", async () => {
    mockFetchWithHealth({ ok: true, body: { status: "ok" } });

    render(<App />);
    await screen.findByText("No employees found.");

    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/analytics/summary"), expect.anything());

    await userEvent.click(screen.getByRole("tab", { name: "Analytics" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/analytics/summary"), expect.anything()),
    );
  });
});
