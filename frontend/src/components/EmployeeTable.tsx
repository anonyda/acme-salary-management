import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ApiError,
  COUNTRIES,
  type Country,
  DEPARTMENTS,
  type Department,
  type Employee,
  type EmployeeWithSalary,
  LEVELS,
  type Level,
  listEmployees,
} from "@/api/client";
import { AddEmployeeDialog } from "@/components/AddEmployeeDialog";
import { EmployeeDetailModal, type EmployeeDetailMode } from "@/components/EmployeeDetailModal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency } from "@/lib/currency";

// Sentinel for "no filter" — Radix Select doesn't allow an empty-string item value.
const ALL = "all";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface EmployeeQuery {
  page: number;
  search: string;
  department: string;
  country: string;
  level: string;
}

const initialQuery: EmployeeQuery = { page: 1, search: "", department: ALL, country: ALL, level: ALL };

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

export function EmployeeTable() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearchImmediately] = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  const [query, setQuery] = useState<EmployeeQuery>(initialQuery);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [detailMode, setDetailMode] = useState<EmployeeDetailMode>("view");
  const [refreshKey, setRefreshKey] = useState(0);

  function openDetail(employeeId: number, mode: EmployeeDetailMode) {
    setSelectedEmployeeId(employeeId);
    setDetailMode(mode);
  }

  // Bridges the debounced search text into `query` (resetting to page 1)
  // as a render-phase state adjustment rather than an effect — React's
  // recommended pattern for "reset state when a derived value changes"
  // (see "You Might Not Need an Effect"). This keeps every setState call
  // outside of an effect body, so the fetch effect below never fires an
  // extra, stale-page request the way a second effect would. Comparing
  // directly against `query.search` (not a separate tracker) means there's
  // only one "last applied" value to keep in sync.
  if (debouncedSearch !== query.search) {
    setQuery((prev) => ({ ...prev, search: debouncedSearch, page: 1 }));
    setStatus("loading");
  }

  useEffect(() => {
    let cancelled = false;

    listEmployees({
      page: query.page,
      limit: PAGE_SIZE,
      search: query.search || undefined,
      department: query.department === ALL ? undefined : (query.department as Department),
      country: query.country === ALL ? undefined : (query.country as Country),
      level: query.level === ALL ? undefined : (query.level as Level),
    })
      .then((res) => {
        if (cancelled) return;
        setEmployees(res.data);
        setTotal(res.total);
        setStatus("idle");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof ApiError ? err.message : "Failed to load employees.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [query, refreshKey]);

  function updateFilter(key: "department" | "country" | "level", value: string) {
    setQuery((prev) => ({ ...prev, [key]: value, page: 1 }));
    setStatus("loading");
  }

  function goToPage(page: number) {
    setQuery((prev) => ({ ...prev, page }));
    setStatus("loading");
  }

  const hasActiveFilters =
    searchInput !== "" || query.department !== ALL || query.country !== ALL || query.level !== ALL;

  function clearFilters() {
    setSearchInput("");
    setDebouncedSearchImmediately(""); // bypasses the pending debounce timer, not just downstream state
    setQuery(initialQuery);
    setStatus("loading");
  }

  function handleSalaryUpdated(updated: EmployeeWithSalary) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? { ...e, salary: updated.salary } : e)));
  }

  function handleEmployeeCreated() {
    setRefreshKey((key) => key + 1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(query.page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or email…"
          className="max-w-xs"
          aria-label="Search employees"
        />
        <FilterSelect
          label="Department"
          value={query.department}
          options={DEPARTMENTS}
          onChange={(value) => updateFilter("department", value)}
        />
        <FilterSelect
          label="Country"
          value={query.country}
          options={COUNTRIES}
          onChange={(value) => updateFilter("country", value)}
        />
        <FilterSelect
          label="Level"
          value={query.level}
          options={LEVELS}
          onChange={(value) => updateFilter("level", value)}
        />
        <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasActiveFilters}>
          Clear filters
        </Button>
        <div className="ml-auto">
          <AddEmployeeDialog onCreated={handleEmployeeCreated} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status === "loading" && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Loading employees…
                </TableCell>
              </TableRow>
            )}
            {status === "error" && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-destructive">
                  {errorMessage}
                </TableCell>
              </TableRow>
            )}
            {status === "idle" && employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
            {status === "idle" &&
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="hover:underline focus-visible:underline focus-visible:outline-none"
                      onClick={() => openDetail(employee.id, "view")}
                    >
                      {employee.full_name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell className="font-mono">{employee.level}</TableCell>
                  <TableCell>{employee.country}</TableCell>
                  <TableCell className="font-mono">
                    {employee.salary ? formatCurrency(employee.salary.amount, employee.salary.currency) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        employee.status === "active" ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
                      }
                    >
                      {employee.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit salary for ${employee.full_name}`}
                      onClick={() => openDetail(employee.id, "edit")}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <EmployeeDetailModal
        employeeId={selectedEmployeeId}
        mode={detailMode}
        onClose={() => setSelectedEmployeeId(null)}
        onSalaryUpdated={handleSalaryUpdated}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-mono text-xs">
          {total === 0 ? "0 results" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(query.page - 1)}
            disabled={query.page <= 1 || status === "loading"}
          >
            Previous
          </Button>
          <span className="font-mono text-xs">
            Page {query.page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(query.page + 1)}
            disabled={query.page >= totalPages || status === "loading"}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
