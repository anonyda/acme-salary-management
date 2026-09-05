import { describe, expect, it } from "vitest";
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
