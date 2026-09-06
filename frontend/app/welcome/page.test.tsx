import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The two questions, and the ones it must never ask.
 *
 * <h2>What this flow is not any more</h2>
 *
 * <p>It ended on a third screen — "You are set up" over Record a meeting /
 * Import a recording / Explore Reverie — which is three buttons standing in
 * front of a product whose own default page already offers all three. Those are
 * asserted absent, because an activation step is exactly the kind of thing that
 * comes back when somebody wants somewhere to put a call to action.
 *
 * <h2>And what the flag is for</h2>
 *
 * <p>Completion is recorded explicitly, and skipping records it too — a skip is
 * a decision, and being asked once per sign-in because you declined once is the
 * behaviour this screen is trying not to be. It is never inferred from whether
 * the account has meetings or a name.
 */

const { push, replace, save, completeOnboarding } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  completeOnboarding: vi.fn(),
}));

/** What the identity provider gave us, and whether it owns the name. */
let provider: string | null;
let providerName: string;
let completed: boolean;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    mode: "clerk",
    userId: "usr_1",
    sessionKey: "sess_1",
    isSignedIn: true,
    isLoaded: true,
    onboardingCompleted: completed,
    completeOnboarding,
    deleteIdentity: vi.fn(),
    profile: {
      name: providerName,
      email: "",
      imageUrl: "",
      provider,
      hasPassword: provider === null,
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  useUpdatePreferencesMutation: () => [save],
  useGetLanguagesQuery: () => ({
    data: [
      { code: "en", name: "English", nativeName: "English" },
      { code: "de", name: "German", nativeName: "Deutsch" },
    ],
    isLoading: false,
  }),
}));

// The gate is about tokens, not about this screen.
vi.mock("@/components/auth-gate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import WelcomePage from "@/app/welcome/page";

beforeEach(() => {
  vi.clearAllMocks();
  save.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  completeOnboarding.mockResolvedValue(undefined);
  provider = null;
  providerName = "";
  completed = false;
});

describe("how many steps there are", () => {
  it("asks for a name first where Reverie owns it", async () => {
    render(<WelcomePage />);

    expect(await screen.findByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What should we call you?",
    );
  });

  it("asks only for a language where Google owns the name", async () => {
    provider = "google";
    providerName = "Maya Chen";
    render(<WelcomePage />);

    /*
     * One of one, not "Step 1 of 2" with a step that never comes. Google holds
     * the name; Settings says so and disables the field.
     */
    expect(await screen.findByText("Step 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What language do you usually meet in?",
    );
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("moves from the name to the language, and counts it", async () => {
    render(<WelcomePage />);

    await userEvent.type(await screen.findByLabelText("Name"), "Ada Lovelace");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));

    expect(await screen.findByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What language do you usually meet in?",
    );
  });
});

describe("what it must never show", () => {
  it("has no activation step, on either path", async () => {
    for (const owns of [null, "google"]) {
      provider = owns;
      providerName = owns ? "Maya Chen" : "";
      const { container, unmount } = render(<WelcomePage />);
      await screen.findByRole("heading", { level: 1 });

      for (const gone of [
        /start with your first conversation/i,
        /record a meeting/i,
        /import audio or video/i,
        /explore reverie/i,
        /you are set up/i,
      ]) {
        expect(container.textContent ?? "").not.toMatch(gone);
      }
      unmount();
    }
  });
});

describe("the language step", () => {
  it("defaults to detecting automatically", async () => {
    provider = "google";
    providerName = "Maya Chen";
    render(<WelcomePage />);

    const auto = await screen.findByRole("radio", { name: /Detect automatically/ });
    expect(auto).toHaveAttribute("aria-checked", "true");
  });

  it("sends nothing when the default is kept, and still finishes", async () => {
    provider = "google";
    providerName = "Maya Chen";
    render(<WelcomePage />);

    await userEvent.click(await screen.findByRole("button", { name: /Continue/ }));

    // Auto-detect is the absence of a stored choice, so there is nothing to
    // write — but the flow is still finished and recorded.
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/home");
  });

  it("saves a language that was chosen", async () => {
    provider = "google";
    providerName = "Maya Chen";
    render(<WelcomePage />);

    await userEvent.click(await screen.findByRole("radio", { name: /German/ }));
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ defaultLanguage: "de" }));
    expect(replace).toHaveBeenCalledWith("/home");
  });
});

describe("finishing", () => {
  it("records completion and goes to Now", async () => {
    render(<WelcomePage />);

    await userEvent.type(await screen.findByLabelText("Name"), "Ada");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Continue/ }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ displayName: "Ada" }));
    expect(completeOnboarding).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/home");
  });

  it("treats a skip as finished", async () => {
    render(<WelcomePage />);

    await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    /*
     * A skip is a decision. Recording it is what stops the next sign-in asking
     * again, which is the behaviour this screen exists not to be.
     */
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/home");
  });

  it("does not trap anybody when the preference will not save", async () => {
    save.mockReturnValue({ unwrap: () => Promise.reject(new Error("nope")) });
    render(<WelcomePage />);

    await userEvent.type(await screen.findByLabelText("Name"), "Ada");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Continue/ }));

    /*
     * Both answers have sound defaults and their own page in Settings. Refusing
     * entry to the product because a preference did not save would be the worst
     * possible first minute.
     */
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(completeOnboarding).toHaveBeenCalled();
  });
});

describe("somebody who has already done this", () => {
  it("is sent on rather than asked again", async () => {
    completed = true;
    render(<WelcomePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
  });
});
