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
// The analytics-summary branch is here too in case a future test switches
// tabs — AnalyticsDashboard now mounts (and fetches) lazily on first visit.
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

  it("doesn't show the stale 'OK' detail while a recheck is still in flight", async () => {
    mockFetchWithHealth({ ok: false, status: 500, statusText: "Internal Server Error", body: { error: "boom" } });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("Offline").length).toBeGreaterThan(0));
    expect(screen.getByText("boom")).toBeInTheDocument();

    // Recheck now hangs forever — long enough to assert the in-flight state
    // without racing a real resolution.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    await userEvent.click(screen.getByRole("button", { name: "Recheck" }));

    await waitFor(() => expect(screen.getAllByText("Checking").length).toBeGreaterThan(0));
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("doesn't fetch the analytics summary until the Analytics tab is opened", async () => {
    mockFetchWithHealth({ ok: true, body: { status: "ok" } });

    render(<App />);
    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));

    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/analytics/summary"), expect.anything());

    await userEvent.click(screen.getByRole("tab", { name: "Analytics" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/analytics/summary"), expect.anything()),
    );
  });
});
