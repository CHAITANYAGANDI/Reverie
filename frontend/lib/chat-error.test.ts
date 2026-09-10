import { describe, it, expect } from "vitest";

import { chatError } from "@/lib/chat-error";

/**
 * The helper that exists because a `catch` threw the reason away.
 *
 * <p>Deleting a conversation was reported as failing with "Couldn't delete that
 * conversation." and nothing else — the handler discarded the response, so the
 * only evidence was a sentence that says nothing. These pin what gets shown
 * instead, in both directions: the server's words when it sent any, and the
 * caller's fallback when it did not.
 */
describe("chatError", () => {
  it("prefers the server's own sentence", () => {
    expect(
      chatError({ status: 409, data: { message: "That conversation is already gone." } }, "fallback"),
    ).toBe("That conversation is already gone.");
  });

  it("falls back for every shape that carries no sentence", () => {
    // Each of these is a real RTK Query rejection: a network failure, a body
    // with no message, an empty message, a non-string message, and a thrown
    // Error. None of them has anything worth showing a reader.
    for (const err of [
      { status: "FETCH_ERROR", error: "TypeError: Failed to fetch" },
      { status: 500, data: {} },
      { status: 500, data: { message: "   " } },
      { status: 500, data: { message: 42 } },
      new Error("boom"),
      undefined,
      null,
    ]) {
      expect(chatError(err, "Couldn't delete that conversation.")).toBe(
        "Couldn't delete that conversation.",
      );
    }
  });

  it("never leaks the browser's own phrasing", () => {
    /*
     * `error` is where RTK Query puts "Failed to fetch" and friends. It
     * describes the transport to somebody who was trying to tidy their chat
     * history, so it is deliberately not read — the fallback is a better
     * sentence than a true one nobody can act on.
     */
    const shown = chatError(
      { status: "FETCH_ERROR", error: "TypeError: Failed to fetch" },
      "Couldn't delete that conversation.",
    );

    expect(shown).not.toMatch(/fetch|TypeError|500/i);
  });
});
