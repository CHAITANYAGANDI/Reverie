import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Project } from "@/lib/types";

/**
 * /folders is a page again.
 *
 * <h2>Why this file is one assertion and a shape</h2>
 *
 * <p>The route was `redirect(LIBRARY)`. It is a real page now — folders came
 * out of the document and into the Library margin, and the margin is a glance
 * with a door rather than a management surface, so the full list needs
 * somewhere to be: `design-demo/final/16-folders.html`.
 *
 * <p>Everything the list does is pinned in `components/folder-list.test.tsx` —
 * the count in the title, the two groups, the sort, rename, delete and the
 * four-way loading/error/empty/ready rule. What is left for this file is the
 * thing that would regress silently: somebody restoring the redirect, or
 * wrapping the list in a second layout. So it asserts the route renders the
 * list and nothing else.
 *
 * <p>The band is not tested here. Which destination stays lit on this URL is
 * `placeFor` in lib/places.ts, tested in lib/chrome.test.ts, where the rule
 * lives for all three routes at once.
 */

let folders: Project[] | undefined;

vi.mock("@/lib/api", () => ({
  useGetProjectsQuery: () => ({
    data: folders,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: folders !== undefined,
    isUninitialized: false,
    refetch: vi.fn(),
  }),
  useUpdateProjectMutation: () => [() => ({ unwrap: () => Promise.resolve({}) }), {}],
  useDeleteProjectMutation: () => [() => ({ unwrap: () => Promise.resolve({}) }), {}],
  useCreateProjectMutation: () => [() => ({ unwrap: () => Promise.resolve({}) }), {}],
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import FoldersPage from "@/app/(app)/folders/page";

describe("the route", () => {
  it("renders the folders rather than redirecting away from them", () => {
    /*
     * The regression this guards: `redirect(LIBRARY)` throws during render, so
     * a reinstated redirect fails here rather than quietly sending everybody to
     * a page that no longer holds the list.
     */
    folders = [
      {
        id: "prj_1",
        name: "Beta Launch",
        description: "",
        color: "",
        favorite: false,
        meetingCount: 9,
        createdAt: "2026-07-01T09:00:00Z",
        updatedAt: "2026-08-01T09:00:00Z",
      },
    ];

    render(<FoldersPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1 folder");
    expect(screen.getByRole("link", { name: /Beta Launch/ })).toHaveAttribute(
      "href",
      "/folder/prj_1",
    );
  });

  it("offers the way back to Library rather than a fourth destination", () => {
    folders = [];
    render(<FoldersPage />);

    // The band still has three places in it. This page is inside Library, and
    // says so.
    expect(screen.getByText("Library · folders")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute("href", "/library");
  });
});
