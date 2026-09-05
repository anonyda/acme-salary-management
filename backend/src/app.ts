import express from "express";

// TODO: mount /api/employees and /api/analytics routers here once implemented.
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
