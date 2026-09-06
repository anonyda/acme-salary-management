import { type CSSProperties, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ApiError,
  type AnalyticsSummary,
  type Country,
  type CountryBreakdown,
  type CountryDistribution,
  type Department,
  type DepartmentBreakdown,
  getAnalyticsSummary,
  type Level,
} from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCompactUSD, formatUSD } from "@/lib/currency";

const DEPARTMENTS: Department[] = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"];
const COUNTRIES: Country[] = ["US", "UK", "IN", "DE"];
const LEVELS: Level[] = ["L1", "L2", "L3", "L4", "L5"];

// Sentinel for "no filter" — Radix Select doesn't allow an empty-string item value.
const ALL = "all";

interface DashboardFilters {
  department: string;
  country: string;
  level: string;
}

const initialFilters: DashboardFilters = { department: ALL, country: ALL, level: ALL };

type LoadStatus = "loading" | "idle" | "error";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} size="sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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

  useEffect(() => {
    let cancelled = false;

    getAnalyticsSummary({
      department: filters.department === ALL ? undefined : (filters.department as Department),
      country: filters.country === ALL ? undefined : (filters.country as Country),
      level: filters.level === ALL ? undefined : (filters.level as Level),
    })
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
  }, [filters]);

  function updateFilter(key: keyof DashboardFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setStatus("loading");
  }

  // First load only — once we have a summary to show, a filter-triggered
  // refetch keeps that render (dimmed) instead of wiping the dashboard,
  // so charts never flash blank or jump layout while reloading.
  if (status === "loading" && !summary) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading analytics…</p>;
  }
  if (status === "error" && !summary) {
    return <p className="py-8 text-center text-sm text-destructive">{errorMessage}</p>;
  }
  if (!summary) return null;

  const { kpis, byDepartment, byCountry, distributionByCountry } = summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Department"
          value={filters.department}
          options={DEPARTMENTS}
          onChange={(value) => updateFilter("department", value)}
        />
        <FilterSelect
          label="Country"
          value={filters.country}
          options={COUNTRIES}
          onChange={(value) => updateFilter("country", value)}
        />
        <FilterSelect
          label="Level"
          value={filters.level}
          options={LEVELS}
          onChange={(value) => updateFilter("level", value)}
        />
      </div>

      {status === "error" && <p className="text-sm text-destructive">{errorMessage}</p>}

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
