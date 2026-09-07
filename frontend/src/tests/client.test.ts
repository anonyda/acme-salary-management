import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHealth, listEmployees } from "@/api/client";

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => body,
      }),
    ),
  );
}

describe("api client base URL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses a bare relative path when VITE_API_BASE_URL is unset (dev proxy handles routing)", async () => {
    mockFetchOk({ status: "ok" });

    await checkHealth();

    expect(fetch).toHaveBeenCalledWith("/health", expect.anything());
  });

  it("prefixes every request with VITE_API_BASE_URL when set, for a deployed frontend hitting a separately-deployed backend", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://backend.example.com");
    mockFetchOk({ status: "ok" });

    await checkHealth();

    expect(fetch).toHaveBeenCalledWith("https://backend.example.com/health", expect.anything());
  });

  it("prefixes a request that already has its own query string", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://backend.example.com");
    mockFetchOk({ data: [], page: 1, limit: 25, total: 0 });

    await listEmployees({ page: 2 });

    expect(fetch).toHaveBeenCalledWith("https://backend.example.com/api/employees?page=2", expect.anything());
  });
});
