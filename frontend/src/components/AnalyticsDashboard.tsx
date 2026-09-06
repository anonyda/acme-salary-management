import { type CSSProperties, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ApiError,
  type AnalyticsSummary,
  type CountryBreakdown,
  type DepartmentBreakdown,
  getAnalyticsSummary,
} from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactUSD, formatUSD } from "@/lib/currency";

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

export function AnalyticsDashboard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAnalyticsSummary()
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
  }, []);

  if (status === "loading") {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading analytics…</p>;
  }

  if (status === "error" || !summary) {
    return <p className="py-8 text-center text-sm text-destructive">{errorMessage}</p>;
  }

  const { kpis, byDepartment, byCountry } = summary;

  return (
    <div className="flex flex-col gap-6">
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
    </div>
  );
}
