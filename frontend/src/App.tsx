import { Activity, BarChart3 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, checkHealth } from "@/api/client";
import { EmployeeTable } from "@/components/EmployeeTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ConnectionState = "checking" | "connected" | "error";

interface HealthCheckResult {
  state: ConnectionState;
  latencyMs: number | null;
  message: string | null;
  checkedAt: Date | null;
}

function useHealthCheck() {
  const [result, setResult] = useState<HealthCheckResult>({
    state: "checking",
    latencyMs: null,
    message: null,
    checkedAt: null,
  });

  const performCheck = useCallback(() => {
    const start = performance.now();

    checkHealth()
      .then(() => {
        setResult({
          state: "connected",
          latencyMs: Math.round(performance.now() - start),
          message: null,
          checkedAt: new Date(),
        });
      })
      .catch((err: unknown) => {
        setResult({
          state: "error",
          latencyMs: null,
          message: err instanceof ApiError ? err.message : "Could not reach the backend",
          checkedAt: new Date(),
        });
      });
  }, []);

  // Runs once on mount — initial state is already "checking", so the
  // effect only needs to kick off the fetch, not reset state itself.
  useEffect(() => {
    performCheck();
  }, [performCheck]);

  // User-triggered recheck: safe to reset state synchronously here since
  // this runs from an event handler, not inside the effect above.
  const recheck = useCallback(() => {
    setResult((prev) => ({ ...prev, state: "checking" }));
    performCheck();
  }, [performCheck]);

  return { ...result, recheck };
}

const STATE_COLOR: Record<ConnectionState, string> = {
  connected: "bg-success",
  error: "bg-destructive",
  checking: "bg-muted-foreground",
};

const STATE_LABEL: Record<ConnectionState, string> = {
  connected: "Connected",
  error: "Offline",
  checking: "Checking",
};

function StatusDot({ state }: { state: ConnectionState }) {
  return (
    <span className="relative flex size-2.5">
      {state === "checking" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground opacity-75" />
      )}
      <span className={`relative inline-flex size-2.5 rounded-full ${STATE_COLOR[state]}`} />
    </span>
  );
}

function StatusPill({ state }: { state: ConnectionState }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5">
      <StatusDot state={state} />
      <span className="font-mono text-[11px] uppercase tracking-wide">{STATE_LABEL[state]}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function App() {
  const health = useHealthCheck();

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">Acme</span>
            <span className="hidden text-xs tracking-wide text-muted-foreground sm:inline">Salary Management</span>
          </div>
          <StatusPill state={health.state} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wide text-primary">Backend v0.1</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            One system of record for every salary at Acme.
          </h1>
          <p className="mt-4 text-pretty text-base text-muted-foreground">
            Replacing the spreadsheet with a searchable system of record and a straight answer to "what do we
            actually pay people?" — by department, by country, in real time.
          </p>
        </div>

        <Card className="mt-10 gap-0 overflow-hidden py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-muted-foreground" />
                Backend connection
              </CardTitle>
              <CardDescription className="mt-1 font-mono text-xs">GET /health</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={health.recheck} disabled={health.state === "checking"}>
              Recheck
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6 py-5 sm:grid-cols-4">
            <Field label="Status">
              <StatusPill state={health.state} />
            </Field>
            <Field label="Latency">
              <span className="font-mono text-sm">{health.latencyMs !== null ? `${health.latencyMs} ms` : "—"}</span>
            </Field>
            <Field label="Checked">
              <span className="font-mono text-sm">
                {health.checkedAt ? health.checkedAt.toLocaleTimeString() : "—"}
              </span>
            </Field>
            <Field label="Detail">
              <span className="truncate font-mono text-sm text-muted-foreground">
                {health.state === "error" ? health.message : "OK"}
              </span>
            </Field>
          </CardContent>
        </Card>

        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Employees</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search, filter, and browse the salary directory.</p>
          <div className="mt-4">
            <EmployeeTable />
          </div>
        </section>

        <Card className="mt-6 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="size-4 text-muted-foreground" />
              Pay analytics
            </CardTitle>
            <CardDescription>Average salary and payroll cost by department and country.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
