import { Activity } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, checkHealth } from "@/api/client";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { EmployeeTable } from "@/components/EmployeeTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">Acme</span>
            <span className="hidden text-xs tracking-wide text-muted-foreground sm:inline">Salary Management</span>
          </div>
          <StatusPill state={health.state} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>

        <Card className="mt-4 gap-0 overflow-hidden py-0">
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

        <Tabs defaultValue="employees" className="mt-8">
          <TabsList>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* forceMount + hidden-when-inactive (instead of the default
              unmount) keeps EmployeeTable's search/filter state intact and
              lets AnalyticsDashboard's charts keep a measured width, rather
              than re-fetching and re-measuring from zero every switch. */}
          <TabsContent value="employees" forceMount className="mt-4 data-[state=inactive]:hidden">
            <p className="mb-4 text-sm text-muted-foreground">Search, filter, and browse the salary directory.</p>
            <EmployeeTable />
          </TabsContent>

          <TabsContent value="analytics" forceMount className="mt-4 data-[state=inactive]:hidden">
            <p className="mb-4 text-sm text-muted-foreground">
              Global payroll, headcount, and salary spread — normalized to USD.
            </p>
            <AnalyticsDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
