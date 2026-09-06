import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  ApiError,
  type Currency,
  type EmployeeWithSalary,
  getEmployee,
  SUPPORTED_CURRENCIES,
  updateSalary,
} from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import { validateSalaryForm } from "@/lib/salaryValidation";

function DetailField({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="font-mono text-sm">{children ?? value}</dd>
    </div>
  );
}

export type EmployeeDetailMode = "view" | "edit";

interface EmployeeDetailModalProps {
  employeeId: number | null;
  mode: EmployeeDetailMode;
  onClose: () => void;
  onSalaryUpdated: (employee: EmployeeWithSalary) => void;
}

type LoadState = "loading" | "idle" | "error";

export function EmployeeDetailModal({ employeeId, mode, onClose, onSalaryUpdated }: EmployeeDetailModalProps) {
  const [employee, setEmployee] = useState<EmployeeWithSalary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amountInput, setAmountInput] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  // Tracks the last-persisted values (from load, or after a successful
  // save) so the submit button can stay disabled until the form actually
  // differs from what's saved.
  const [savedAmount, setSavedAmount] = useState("");
  const [savedCurrency, setSavedCurrency] = useState<Currency>("USD");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resets per-open state as a render-phase adjustment (not inside the
  // fetch effect below) — see EmployeeTable's debounce bridge for the same
  // pattern. Keeps the effect's only setState calls in its async .then/
  // .catch, so React never has to run a second render pass to reset state
  // before the fetch even starts.
  const [loadedForId, setLoadedForId] = useState<number | null>(null);
  if (employeeId !== loadedForId) {
    setLoadedForId(employeeId);
    setLoadState("loading");
    setFormError(null);
    setSubmitError(null);
    setSuccessMessage(null);
  }

  useEffect(() => {
    if (employeeId === null) return;

    let cancelled = false;

    getEmployee(employeeId)
      .then((res) => {
        if (cancelled) return;
        setEmployee(res);
        const loadedAmount = res.salary ? String(res.salary.amount) : "";
        const loadedCurrency = res.salary?.currency ?? "USD";
        setAmountInput(loadedAmount);
        setCurrency(loadedCurrency);
        setSavedAmount(loadedAmount);
        setSavedCurrency(loadedCurrency);
        setLoadState("idle");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load employee.");
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  function handleOpenChange(open: boolean) {
    if (open) return;
    onClose();
    setEmployee(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationError = validateSalaryForm(amountInput, currency);
    setFormError(validationError);
    if (validationError || employeeId === null) return;

    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const updated = await updateSalary(employeeId, { amount: Number(amountInput), currency });
      setEmployee(updated);
      setSavedAmount(updated.salary ? String(updated.salary.amount) : "");
      setSavedCurrency(updated.salary?.currency ?? currency);
      setSuccessMessage("Salary updated.");
      onSalaryUpdated(updated);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to update salary.");
    } finally {
      setSubmitting(false);
    }
  }

  const isUnchanged = amountInput === savedAmount && currency === savedCurrency;

  return (
    <Dialog open={employeeId !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        {loadState === "loading" && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {loadState === "error" && <p className="py-8 text-center text-sm text-destructive">{loadError}</p>}
        {loadState === "idle" && employee && (
          <>
            <DialogHeader>
              <DialogTitle>{employee.full_name}</DialogTitle>
              <DialogDescription>
                {employee.title} · {employee.department}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <DetailField label="Email" value={employee.email} />
              <DetailField label="Gender" value={employee.gender} />
              <DetailField label="Level" value={employee.level} />
              <DetailField label="Country" value={employee.country} />
              <DetailField label="Hire date" value={employee.hire_date} />
              <DetailField label="Status">
                <Badge
                  variant="outline"
                  className={
                    employee.status === "active" ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
                  }
                >
                  {employee.status}
                </Badge>
              </DetailField>
              <DetailField
                label="Current salary"
                value={employee.salary ? formatCurrency(employee.salary.amount, employee.salary.currency) : "—"}
              />
            </dl>

            {mode === "edit" && (
              <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
                <h3 className="text-sm font-medium">Update salary</h3>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="salary-amount" className="mb-1.5">
                      Amount
                    </Label>
                    <Input
                      id="salary-amount"
                      inputMode="decimal"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      aria-invalid={formError !== null}
                    />
                  </div>
                  <div className="w-28">
                    <Label htmlFor="salary-currency" className="mb-1.5">
                      Currency
                    </Label>
                    <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
                      <SelectTrigger id="salary-currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formError && <p className="text-sm text-destructive">{formError}</p>}
                {submitError && <p className="text-sm text-destructive">{submitError}</p>}
                {successMessage && <p className="text-sm text-success">{successMessage}</p>}

                <DialogFooter>
                  <Button type="submit" disabled={submitting || isUnchanged}>
                    {submitting ? "Saving…" : "Save salary"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
