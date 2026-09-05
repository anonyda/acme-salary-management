import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Connected once the health check succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      }),
    );

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
    expect(fetch).toHaveBeenCalledWith("/health", expect.anything());
  });

  it("shows Offline if the health check fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "boom" }),
      }),
    );

    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Offline").length).toBeGreaterThan(0));
  });
});
