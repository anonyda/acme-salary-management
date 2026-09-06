import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const emptyAnalyticsSummary = {
  kpis: { totalPayrollUSD: 0, activeHeadcount: 0, avgSalaryUSD: 0, medianSalaryUSD: 0 },
  byDepartment: [],
  byCountry: [],
  distributionByCountry: [],
};

// EmployeeTable and AnalyticsDashboard also fetch on mount, so the
// health-check mock needs to respond per-path rather than one fixed body.
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
});
