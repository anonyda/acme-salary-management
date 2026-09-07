import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployee, type Employee } from "@/api/client";
import { AddEmployeeDialog } from "@/components/AddEmployeeDialog";
import { validateCreateEmployeeForm } from "@/lib/createEmployeeValidation";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return { ...actual, createEmployee: vi.fn() };
});

const mockedCreateEmployee = vi.mocked(createEmployee);

const createdEmployee: Employee = {
  id: 42,
  full_name: "Priya Rao",
  email: "priya.rao@acme.test",
  gender: "Female",
  department: "Engineering",
  title: "Software Engineer",
  level: "L2",
  country: "US",
  manager_id: null,
  hire_date: "2026-09-06",
  status: "active",
  created_at: "2026-09-06",
  updated_at: "2026-09-06",
  salary: { amount: 95000, currency: "USD", effective_date: "2026-09-06" },
};

describe("validateCreateEmployeeForm", () => {
  const validValues = {
    fullName: "Priya Rao",
    email: "priya.rao@acme.test",
    gender: "Female",
    title: "Software Engineer",
    department: "Engineering",
    country: "US",
    level: "L2",
    hireDate: "2026-09-06",
    salaryAmount: "95000",
    salaryCurrency: "USD",
  };

  it("returns no errors for a fully valid form", () => {
    expect(validateCreateEmployeeForm(validValues)).toEqual({});
  });

  it("flags every required field when the form is empty", () => {
    const errors = validateCreateEmployeeForm({
      fullName: "",
      email: "",
      gender: "",
      title: "",
      department: "",
      country: "",
      level: "",
      hireDate: "",
      salaryAmount: "",
      salaryCurrency: "",
    });

    expect(Object.keys(errors).sort()).toEqual(
      ["fullName", "email", "gender", "title", "department", "country", "level", "hireDate", "salaryAmount", "salaryCurrency"].sort(),
    );
  });

  it("rejects a malformed email", () => {
    expect(validateCreateEmployeeForm({ ...validValues, email: "not-an-email" })).toHaveProperty(
      "email",
      expect.stringMatching(/valid email/i),
    );
  });

  it("rejects a non-positive salary amount", () => {
    expect(validateCreateEmployeeForm({ ...validValues, salaryAmount: "-500" })).toHaveProperty(
      "salaryAmount",
      expect.stringMatching(/must be positive/i),
    );
  });
});

describe("AddEmployeeDialog", () => {
  beforeEach(() => {
    mockedCreateEmployee.mockReset();
  });

  async function openDialog(onCreated = vi.fn()) {
    const user = userEvent.setup();
    render(<AddEmployeeDialog onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: "Add employee" }));
    await screen.findByRole("heading", { name: "Add employee" });
    return { user, onCreated };
  }

  it("shows an error for every required field and does not call the API", async () => {
    const { user } = await openDialog();

    await user.click(screen.getByRole("button", { name: "Create employee" }));

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Select a gender.")).toBeInTheDocument();
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Select a department.")).toBeInTheDocument();
    expect(screen.getByText("Select a country.")).toBeInTheDocument();
    expect(screen.getByText("Select a level.")).toBeInTheDocument();
    expect(screen.getByText("Hire date is required.")).toBeInTheDocument();
    expect(screen.getByText("Select a currency.")).toBeInTheDocument();
    expect(mockedCreateEmployee).not.toHaveBeenCalled();
  });

  // Five sequential dropdown interactions via user-event push this past the
  // 5000ms default on a slower machine — not a hang, just a genuinely
  // longer interaction sequence now that Gender is part of the form.
  it("submits with the entered values once all required fields are filled", async () => {
    mockedCreateEmployee.mockResolvedValue(createdEmployee);
    const { user, onCreated } = await openDialog();

    await user.type(screen.getByLabelText("Full name"), "Priya Rao");
    await user.type(screen.getByLabelText("Email"), "priya.rao@acme.test");
    await user.type(screen.getByLabelText("Title"), "Software Engineer");

    await user.click(screen.getByLabelText("Gender"));
    await user.click(await screen.findByRole("option", { name: "Female" }));
    await user.click(screen.getByLabelText("Department"));
    await user.click(await screen.findByRole("option", { name: "Engineering" }));
    await user.click(screen.getByLabelText("Country"));
    await user.click(await screen.findByRole("option", { name: "US" }));
    await user.click(screen.getByLabelText("Level"));
    await user.click(await screen.findByRole("option", { name: "L2" }));
    await user.click(screen.getByLabelText("Currency"));
    await user.click(await screen.findByRole("option", { name: "USD" }));

    fireEvent.change(screen.getByLabelText("Hire date"), { target: { value: "2026-09-06" } });
    await user.type(screen.getByLabelText("Initial salary"), "95000");

    await user.click(screen.getByRole("button", { name: "Create employee" }));

    await waitFor(() =>
      expect(mockedCreateEmployee).toHaveBeenCalledWith({
        full_name: "Priya Rao",
        email: "priya.rao@acme.test",
        gender: "Female",
        title: "Software Engineer",
        department: "Engineering",
        level: "L2",
        country: "US",
        hire_date: "2026-09-06",
        salary: { amount: 95000, currency: "USD" },
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(createdEmployee);
  }, 10000);
});
