import { type CSSProperties, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ApiError,
  type AnalyticsSummary,
  COUNTRIES,
  type Country,
  type CountryBreakdown,
  type CountryDistribution,
  DEPARTMENTS,
  type Department,
  type DepartmentBreakdown,
  getAnalyticsSummary,
  LEVELS,
  type Level,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactUSD, formatUSD } from "@/lib/currency";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";

interface DashboardFilters {
  department: Department[];
  country: Country[];
  level: Level[];
}

const initialFilters: DashboardFilters = { department: [], country: [], level: [] };

type LoadStatus = "loading" | "idle" | "error";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  );
}

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
};

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

function SalaryBarChart({
  data,
  categoryKey,
}: {
  data: (DepartmentBreakdown | CountryBreakdown)[];
  categoryKey: "department" | "country";
}) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No data for the current filters.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data as unknown as Record<string, unknown>[]} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={categoryKey} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCompactUSD(value)}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          contentStyle={tooltipContentStyle}
          labelStyle={{ color: "var(--foreground)", marginBottom: 4 }}
          formatter={(value) => formatUSD(Number(value))}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Bar dataKey="avgSalaryUSD" name="Average" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="medianSalaryUSD" name="Median" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Histogram job (magnitude, not identity) — one hue per panel, no legend,
// per the "nominal categorical, single series" rule. Small multiples (one
// mini chart per country) rather than a 4-series grouped bar, since a
// single flat hue reads correctly here without needing a 4-color
// categorical palette validated for this app.
function DistributionChart({ data }: { data: CountryDistribution[] }) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No data for the current filters.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {data.map((row) => (
        <div key={row.country}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{row.country}</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={row.buckets as unknown as Record<string, unknown>[]}
              margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={38}
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={tooltipContentStyle}
                labelStyle={{ color: "var(--foreground)", marginBottom: 4 }}
                formatter={(value) => [`${value}`, "Employees"]}
              />
              <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsDashboard() {
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getAnalyticsSummary(filters)
      .then((res) => {
        if (cancelled) return;
        setSummary(res);
        setStatus("idle");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof ApiError ? err.message : "Failed to load analytics.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [filters, retryKey]);

  function updateFilter<K extends keyof DashboardFilters>(key: K, values: DashboardFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: values }));
    setStatus("loading");
  }

  const hasActiveFilters =
    filters.department.length > 0 || filters.country.length > 0 || filters.level.length > 0;

  function clearFilters() {
    setFilters(initialFilters);
    setStatus("loading");
  }

  function retry() {
    setStatus("loading");
    setRetryKey((key) => key + 1);
  }

  // First load only — once we have a summary to show, a filter-triggered
  // refetch keeps that render (dimmed) instead of wiping the dashboard,
  // so charts never flash blank or jump layout while reloading.
  if (status === "loading" && !summary) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading analytics…</p>;
  }
  if (status === "error" && !summary) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-sm">
        <p className="text-destructive">{errorMessage}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!summary) return null;

  const { kpis, byDepartment, byCountry, distributionByCountry } = summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Department"
          selected={filters.department}
          options={DEPARTMENTS}
          onChange={(values) => updateFilter("department", values)}
        />
        <MultiSelectFilter
          label="Country"
          selected={filters.country}
          options={COUNTRIES}
          onChange={(values) => updateFilter("country", values)}
        />
        <MultiSelectFilter
          label="Level"
          selected={filters.level}
          options={LEVELS}
          onChange={(values) => updateFilter("level", values)}
        />
        <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasActiveFilters}>
          Clear filters
        </Button>
      </div>

      {status === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{errorMessage}</span>
          <Button variant="outline" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      <div className={status === "loading" ? "flex flex-col gap-6 opacity-60 transition-opacity" : "flex flex-col gap-6"}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total global payroll" value={formatCompactUSD(kpis.totalPayrollUSD)} />
          <StatTile label="Active headcount" value={new Intl.NumberFormat("en-US").format(kpis.activeHeadcount)} />
          <StatTile label="Average salary" value={formatUSD(kpis.avgSalaryUSD)} />
          <StatTile label="Median salary" value={formatUSD(kpis.medianSalaryUSD)} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Salary by department</CardTitle>
              <CardDescription>Average and median, USD-normalized</CardDescription>
            </CardHeader>
            <CardContent>
              <SalaryBarChart data={byDepartment} categoryKey="department" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Salary by country</CardTitle>
              <CardDescription>Average and median, USD-normalized</CardDescription>
            </CardHeader>
            <CardContent>
              <SalaryBarChart data={byCountry} categoryKey="country" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Salary distribution by country</CardTitle>
            <CardDescription>Headcount by USD salary band</CardDescription>
          </CardHeader>
          <CardContent>
            <DistributionChart data={distributionByCountry} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
