import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { createConnection } from "../db/connection.js";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createApp(createConnection(":memory:"));
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("CORS", () => {
  const ORIGINAL_CORS_ORIGIN = process.env.CORS_ORIGIN;

  afterEach(() => {
    process.env.CORS_ORIGIN = ORIGINAL_CORS_ORIGIN;
  });

  // Frontend and backend are separate deployments (Vercel + Railway), so
  // without CORS headers the browser blocks every request outright.
  it("reflects the request origin by default, so a deployed frontend on any origin can call the API", async () => {
    delete process.env.CORS_ORIGIN;
    const app = createApp(createConnection(":memory:"));

    const res = await request(app).get("/health").set("Origin", "https://acme-salary.vercel.app");

    expect(res.headers["access-control-allow-origin"]).toBe("https://acme-salary.vercel.app");
  });

  it("restricts to CORS_ORIGIN when set", async () => {
    process.env.CORS_ORIGIN = "https://acme-salary.vercel.app";
    const app = createApp(createConnection(":memory:"));

    const allowed = await request(app).get("/health").set("Origin", "https://acme-salary.vercel.app");
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://acme-salary.vercel.app");

    // A static (non-reflected) origin config always advertises the same
    // configured value, regardless of the request's actual Origin header —
    // it's the browser, comparing that value against its own page's origin,
    // that actually enforces the restriction. A mismatched requester (here,
    // https://evil.example.com) gets back an allow-origin that isn't its
    // own, which the browser then blocks client-side.
    const other = await request(app).get("/health").set("Origin", "https://evil.example.com");
    expect(other.headers["access-control-allow-origin"]).toBe("https://acme-salary.vercel.app");
    expect(other.headers["access-control-allow-origin"]).not.toBe("https://evil.example.com");
  });
});
