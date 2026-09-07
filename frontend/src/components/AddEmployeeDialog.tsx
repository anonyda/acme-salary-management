import { type FormEvent, useState } from "react";
import {
  ApiError,
  COUNTRIES,
  type Country,
  createEmployee,
  type Currency,
  DEPARTMENTS,
  type Department,
  type Employee,
  type Gender,
  LEVELS,
  type Level,
  SUPPORTED_CURRENCIES,
  SUPPORTED_GENDERS,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EnumSelect, Field } from "@/components/EmployeeFormFields";
import {
  type CreateEmployeeFormValues,
  emptyCreateEmployeeForm,
  validateCreateEmployeeForm,
} from "@/lib/createEmployeeValidation";

interface AddEmployeeDialogProps {
  onCreated: (employee: Employee) => void;
}

export function AddEmployeeDialog({ onCreated }: AddEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CreateEmployeeFormValues>(emptyCreateEmployeeForm);
  const [errors, setErrors] = useState<ReturnType<typeof validateCreateEmployeeForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateField<K extends keyof CreateEmployeeFormValues>(key: K, value: CreateEmployeeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues(emptyCreateEmployeeForm);
      setErrors({});
      setSubmitError(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationErrors = validateCreateEmployeeForm(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createEmployee({
        full_name: values.fullName.trim(),
        email: values.email.trim(),
        gender: values.gender as Gender,
        title: values.title.trim(),
        department: values.department as Department,
        level: values.level as Level,
        country: values.country as Country,
        hire_date: values.hireDate,
        salary: { amount: Number(values.salaryAmount), currency: values.salaryCurrency as Currency },
      });
      onCreated(created);
      handleOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to create employee.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Add employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>Creates a new employee record with an initial salary.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field id="employee-full-name" label="Full name" error={errors.fullName}>
            <Input
              id="employee-full-name"
              value={values.fullName}
              onChange={(e) => updateField("fullName", e.target.value)}
              aria-invalid={!!errors.fullName}
            />
          </Field>

          <Field id="employee-email" label="Email" error={errors.email}>
            <Input
              id="employee-email"
              type="email"
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              aria-invalid={!!errors.email}
            />
          </Field>

          <Field id="employee-gender" label="Gender" error={errors.gender}>
            <EnumSelect
              id="employee-gender"
              value={values.gender}
              options={SUPPORTED_GENDERS}
              onChange={(v) => updateField("gender", v)}
              invalid={!!errors.gender}
            />
          </Field>

          <Field id="employee-title" label="Title" error={errors.title}>
            <Input
              id="employee-title"
              value={values.title}
              onChange={(e) => updateField("title", e.target.value)}
              aria-invalid={!!errors.title}
            />
          </Field>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field id="employee-department" label="Department" error={errors.department}>
              <EnumSelect
                id="employee-department"
                value={values.department}
                options={DEPARTMENTS}
                onChange={(v) => updateField("department", v)}
                invalid={!!errors.department}
              />
            </Field>
            <Field id="employee-country" label="Country" error={errors.country}>
              <EnumSelect
                id="employee-country"
                value={values.country}
                options={COUNTRIES}
                onChange={(v) => updateField("country", v)}
                invalid={!!errors.country}
              />
            </Field>
            <Field id="employee-level" label="Level" error={errors.level}>
              <EnumSelect
                id="employee-level"
                value={values.level}
                options={LEVELS}
                onChange={(v) => updateField("level", v)}
                invalid={!!errors.level}
              />
            </Field>
          </div>

          <Field id="employee-hire-date" label="Hire date" error={errors.hireDate}>
            <Input
              id="employee-hire-date"
              type="date"
              value={values.hireDate}
              onChange={(e) => updateField("hireDate", e.target.value)}
              aria-invalid={!!errors.hireDate}
            />
          </Field>

          <div className="flex gap-2">
            <div className="flex-1">
              <Field id="employee-salary-amount" label="Initial salary" error={errors.salaryAmount}>
                <Input
                  id="employee-salary-amount"
                  inputMode="decimal"
                  value={values.salaryAmount}
                  onChange={(e) => updateField("salaryAmount", e.target.value)}
                  aria-invalid={!!errors.salaryAmount}
                />
              </Field>
            </div>
            <div className="w-28">
              <Field id="employee-salary-currency" label="Currency" error={errors.salaryCurrency}>
                <EnumSelect
                  id="employee-salary-currency"
                  value={values.salaryCurrency}
                  options={SUPPORTED_CURRENCIES}
                  onChange={(v) => updateField("salaryCurrency", v)}
                  invalid={!!errors.salaryCurrency}
                />
              </Field>
            </div>
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
