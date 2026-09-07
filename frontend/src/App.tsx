import { useEffect, useState } from "react";
import { checkHealth } from "@/api/client";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { EmployeeTable } from "@/components/EmployeeTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ConnectionState = "checking" | "connected" | "error";

// A lighter version of the old health-check hook — just the state a status
// pill needs (no latency/message/recheck), now that the detailed connection
// card that used those is gone.
function useHealthCheck(): ConnectionState {
  const [state, setState] = useState<ConnectionState>("checking");

  useEffect(() => {
    checkHealth()
      .then(() => setState("connected"))
      .catch(() => setState("error"));
  }, []);

  return state;
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

type TabValue = "employees" | "analytics";
const DEFAULT_TAB: TabValue = "employees";

export default function App() {
  const health = useHealthCheck();
  // Tracks which tabs have ever been activated, so each tab's content (and
  // the fetch it triggers) mounts lazily on first visit instead of both
  // firing immediately on page load — but once visited, stays mounted
  // (forceMount) so switching away and back doesn't lose state or re-fetch.
  const [visitedTabs, setVisitedTabs] = useState<Set<TabValue>>(() => new Set([DEFAULT_TAB]));

  function handleTabChange(value: string) {
    setVisitedTabs((prev) => (prev.has(value as TabValue) ? prev : new Set(prev).add(value as TabValue)));
  }

  return (
    <div className="min-h-svh bg-background">
      {/* Tabs wraps both header (TabsList) and main (TabsContent) — Radix
          only requires them to share a Tabs.Root ancestor, not be direct
          siblings, so the trigger list can live in the header while the
          panels live in the page body below it. Forced back to `block`
          (overriding the component's default `flex flex-col`): as a flex
          item, <main>'s `mx-auto` would switch it from block's "always
          fill the container width" sizing to shrink-to-fit — capped by
          max-w-7xl, but no longer forced up to it — so Employees' wide
          table and Analytics' narrower cards would render at different
          widths instead of both consistently filling max-w-7xl. */}
      <Tabs defaultValue={DEFAULT_TAB} className="block" onValueChange={handleTabChange}>
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight">Acme</span>
              <span className="hidden text-xs tracking-wide text-muted-foreground sm:inline">Salary Management</span>
            </div>
            <TabsList>
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>
            <StatusPill state={health} />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>

          {/* forceMount + hidden-when-inactive (instead of the default
              unmount), once a tab has been visited, keeps EmployeeTable's
              search/filter state intact and lets AnalyticsDashboard's charts
              keep a measured width, rather than re-fetching and
              re-measuring from zero every switch. Before that first visit,
              forceMount is left off so the tab's content — and the fetch it
              triggers — doesn't mount until the user actually opens it. */}
          <TabsContent
            value="employees"
            forceMount={visitedTabs.has("employees") || undefined}
            className="mt-4 data-[state=inactive]:hidden"
          >
            <p className="mb-4 text-sm text-muted-foreground">Search, filter, and browse the salary directory.</p>
            {visitedTabs.has("employees") && <EmployeeTable />}
          </TabsContent>

          <TabsContent
            value="analytics"
            forceMount={visitedTabs.has("analytics") || undefined}
            className="mt-4 data-[state=inactive]:hidden"
          >
            <p className="mb-4 text-sm text-muted-foreground">
              Global payroll, headcount, and salary spread — normalized to USD.
            </p>
            {visitedTabs.has("analytics") && <AnalyticsDashboard />}
          </TabsContent>
        </main>
      </Tabs>
    </div>
  );
}
