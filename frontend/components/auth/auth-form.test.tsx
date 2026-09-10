import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field } from "@/components/auth/auth-form";

/**
 * The password box, and the eye on it.
 *
 * <p>The reveal exists for the reason the change-password dialog already gives:
 * the alternative is people choosing a password they can type blind, which is a
 * shorter one. It was missing from the sign-in and sign-up boxes because this
 * field was built with a leading icon slot and no trailing one, and because no
 * browser fills the gap — Chrome and Safari draw no native reveal at all.
 *
 * <p>What is asserted is the behaviour a person gets: that the characters
 * actually become readable, that the control says which state it is in, and
 * that pressing it does not submit the form it sits in. The last one is the
 * failure worth guarding: a bare `<button>` inside a `<form>` defaults to
 * `type="submit"`, so getting it wrong turns "let me check what I typed" into
 * an attempted sign-in.
 */
describe("a password field", () => {
  it("shows the characters, and puts them back", async () => {
    render(<Field label="Password" type="password" autoComplete="current-password" />);

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("says which state it is in", async () => {
    render(<Field label="Password" type="password" autoComplete="current-password" />);

    const eye = screen.getByRole("button", { name: "Show password" });
    expect(eye).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(eye);
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("is named for its own field, because a reset screen has two of them", () => {
    render(
      <>
        <Field label="Password" type="password" autoComplete="current-password" />
        <Field label="New password" type="password" autoComplete="new-password" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show new password" })).toBeInTheDocument();
  });

  it("does not submit the form it sits in", async () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <Field label="Password" type="password" autoComplete="current-password" />
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(submit).not.toHaveBeenCalled();
  });

  it("leaves fields that are not secrets alone", () => {
    render(<Field label="Email" type="email" autoComplete="email" />);

    // No eye on an address: there is nothing hidden to reveal.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the reveal reachable from the keyboard", async () => {
    render(
      <form>
        <Field label="Password" type="password" autoComplete="current-password" />
      </form>,
    );

    // Tabbing from the field must reach it. A reveal only a mouse can press is
    // a reveal half the people who need it cannot use.
    screen.getByLabelText("Password").focus();
    await userEvent.tab();

    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
  });
});
