import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type EmployeeWithSalary, getEmployee, updateEmployee, updateSalary } from "@/api/client";
import { EmployeeDetailModal, type EmployeeDetailMode } from "@/components/EmployeeDetailModal";
import { validateSalaryForm } from "@/lib/salaryValidation";
import { validateUpdateEmployeeForm, type UpdateEmployeeFormValues } from "@/lib/updateEmployeeValidation";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return { ...actual, getEmployee: vi.fn(), updateSalary: vi.fn(), updateEmployee: vi.fn() };
});

const mockedGetEmployee = vi.mocked(getEmployee);
const mockedUpdateSalary = vi.mocked(updateSalary);
const mockedUpdateEmployee = vi.mocked(updateEmployee);

const validProfileForm: UpdateEmployeeFormValues = {
  fullName: "Alice Johnson",
  email: "alice.johnson@acme.test",
  gender: "Female",
  title: "Software Engineer",
  department: "Engineering",
  country: "US",
  level: "L2",
  hireDate: "2022-01-01",
  managerId: "",
};

const sampleEmployee: EmployeeWithSalary = {
  id: 1,
  full_name: "Alice Johnson",
  email: "alice.johnson@acme.test",
  gender: "Female",
  department: "Engineering",
  title: "Software Engineer",
  level: "L2",
  country: "US",
  manager_id: null,
  hire_date: "2022-01-01",
  status: "active",
  created_at: "2022-01-01",
  updated_at: "2022-01-01",
  salary: { amount: 90000, currency: "USD", effective_date: "2022-01-01" },
};

describe("validateSalaryForm", () => {
  it("rejects an empty amount", () => {
    expect(validateSalaryForm("", "USD")).toMatch(/enter a salary amount/i);
  });

  it("rejects a non-numeric amount", () => {
    expect(validateSalaryForm("abc", "USD")).toMatch(/must be a number/i);
  });

  it("rejects a zero or negative amount", () => {
    expect(validateSalaryForm("0", "USD")).toMatch(/must be positive/i);
    expect(validateSalaryForm("-500", "USD")).toMatch(/must be positive/i);
  });

  it("rejects an unsupported currency", () => {
    expect(validateSalaryForm("90000", "XXX")).toMatch(/valid currency/i);
  });

  it("accepts a positive amount with a supported currency", () => {
    expect(validateSalaryForm("90000", "USD")).toBeNull();
  });
});

describe("validateUpdateEmployeeForm", () => {
  it("rejects a blank full name", () => {
    expect(validateUpdateEmployeeForm({ ...validProfileForm, fullName: " " }).fullName).toMatch(/required/i);
  });

  it("rejects an invalid email", () => {
    expect(validateUpdateEmployeeForm({ ...validProfileForm, email: "not-an-email" }).email).toMatch(/valid email/i);
  });

  it("rejects a non-numeric manager id", () => {
    expect(validateUpdateEmployeeForm({ ...validProfileForm, managerId: "abc" }).managerId).toMatch(/whole number/i);
  });

  it("accepts an empty manager id (no manager)", () => {
    expect(validateUpdateEmployeeForm({ ...validProfileForm, managerId: "" }).managerId).toBeUndefined();
  });

  it("accepts a fully valid form", () => {
    expect(validateUpdateEmployeeForm(validProfileForm)).toEqual({});
  });
});

describe("EmployeeDetailModal", () => {
  beforeEach(() => {
    mockedGetEmployee.mockReset();
    mockedUpdateSalary.mockReset();
    mockedUpdateEmployee.mockReset();
    mockedGetEmployee.mockResolvedValue(sampleEmployee);
  });

  async function renderOpen(mode: EmployeeDetailMode = "edit", onEmployeeUpdated = vi.fn()) {
    render(<EmployeeDetailModal employeeId={1} mode={mode} onClose={vi.fn()} onEmployeeUpdated={onEmployeeUpdated} />);
    await screen.findByRole("heading", { name: "Alice Johnson" });
    return onEmployeeUpdated;
  }

  it("shows the employee's full info and current salary in native currency", async () => {
    await renderOpen("view");

    expect(screen.getByText("alice.johnson@acme.test")).toBeInTheDocument();
    expect(screen.getByText("$90,000")).toBeInTheDocument();
  });

  it("hides the edit-profile and edit-salary forms in view mode", async () => {
    await renderOpen("view");

    expect(screen.queryByText("Update salary")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("shows the edit-salary form in edit mode", async () => {
    await renderOpen("edit");

    expect(screen.getByText("Update salary")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });

  it("shows the edit-profile form pre-filled with the employee's current values, in edit mode", async () => {
    await renderOpen("edit");

    expect(screen.getByLabelText("Full name")).toHaveValue("Alice Johnson");
    expect(screen.getByLabelText("Email")).toHaveValue("alice.johnson@acme.test");
    expect(screen.getByLabelText("Title")).toHaveValue("Software Engineer");
    expect(screen.getByLabelText("Hire date")).toHaveValue("2022-01-01");
  });

  it("keeps Save profile disabled until a profile field actually changes", async () => {
    await renderOpen();
    const user = userEvent.setup();

    const saveProfileButton = screen.getByRole("button", { name: "Save profile" });
    expect(saveProfileButton).toBeDisabled();

    const titleInput = screen.getByLabelText("Title");
    await user.type(titleInput, "II");
    expect(saveProfileButton).not.toBeDisabled();
  });

  it("rejects a blank full name without calling the API", async () => {
    await renderOpen();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("Full name"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText(/full name is required/i)).toBeInTheDocument();
    expect(mockedUpdateEmployee).not.toHaveBeenCalled();
  });

  it("submits valid profile changes, then reports the update", async () => {
    const updated = { ...sampleEmployee, title: "Senior Software Engineer" };
    mockedUpdateEmployee.mockResolvedValue(updated);
    const onEmployeeUpdated = await renderOpen();
    const user = userEvent.setup();

    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Senior Software Engineer");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mockedUpdateEmployee).toHaveBeenCalledWith(1, {
        full_name: "Alice Johnson",
        email: "alice.johnson@acme.test",
        gender: "Female",
        title: "Senior Software Engineer",
        department: "Engineering",
        level: "L2",
        country: "US",
        hire_date: "2022-01-01",
        manager_id: null,
      }),
    );
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
    expect(onEmployeeUpdated).toHaveBeenCalledWith(updated);
  });

  it("keeps Save disabled until the amount or currency actually changes", async () => {
    await renderOpen();
    const user = userEvent.setup();

    const saveButton = screen.getByRole("button", { name: "Save salary" });
    expect(saveButton).toBeDisabled();

    const amountInput = screen.getByLabelText("Amount");
    await user.type(amountInput, "1");
    expect(saveButton).not.toBeDisabled();

    // Back to the original value — no real change, so disabled again.
    await user.type(amountInput, "{backspace}");
    expect(saveButton).toBeDisabled();
  });

  it("disables Save again after a successful save", async () => {
    const updated = { ...sampleEmployee, salary: { amount: 100000, currency: "USD" as const, effective_date: "2026-09-06" } };
    mockedUpdateSalary.mockResolvedValue(updated);
    await renderOpen();
    const user = userEvent.setup();

    const amountInput = screen.getByLabelText("Amount");
    await user.clear(amountInput);
    await user.type(amountInput, "100000");
    const saveButton = screen.getByRole("button", { name: "Save salary" });
    await user.click(saveButton);

    await screen.findByText(/salary updated/i);
    expect(saveButton).toBeDisabled();
  });

  it("rejects a non-positive amount without calling the API", async () => {
    await renderOpen();
    const user = userEvent.setup();

    const amountInput = screen.getByLabelText("Amount");
    await user.clear(amountInput);
    await user.type(amountInput, "-100");
    await user.click(screen.getByRole("button", { name: "Save salary" }));

    expect(await screen.findByText(/must be positive/i)).toBeInTheDocument();
    expect(mockedUpdateSalary).not.toHaveBeenCalled();
  });

  it("rejects an empty amount without calling the API", async () => {
    await renderOpen();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("Amount"));
    await user.click(screen.getByRole("button", { name: "Save salary" }));

    expect(await screen.findByText(/enter a salary amount/i)).toBeInTheDocument();
    expect(mockedUpdateSalary).not.toHaveBeenCalled();
  });

  it("submits a valid amount and currency, then reports the update", async () => {
    const updated = { ...sampleEmployee, salary: { amount: 100000, currency: "USD" as const, effective_date: "2026-09-06" } };
    mockedUpdateSalary.mockResolvedValue(updated);
    const onEmployeeUpdated = await renderOpen();
    const user = userEvent.setup();

    const amountInput = screen.getByLabelText("Amount");
    await user.clear(amountInput);
    await user.type(amountInput, "100000");
    await user.click(screen.getByRole("button", { name: "Save salary" }));

    await waitFor(() => expect(mockedUpdateSalary).toHaveBeenCalledWith(1, { amount: 100000, currency: "USD" }));
    expect(await screen.findByText(/salary updated/i)).toBeInTheDocument();
    expect(onEmployeeUpdated).toHaveBeenCalledWith(updated);
  });
});
