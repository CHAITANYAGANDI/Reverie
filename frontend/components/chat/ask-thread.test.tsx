import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AskThread, exchangesOf } from "@/components/chat/ask-thread";

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg_1",
    conversationId: "cnv_1",
    role: "user",
    content: "What is still open?",
    citations: [],
    createdAt: "2026-08-15T09:00:00Z",
    ...over,
  };
}

const q = (id: string) => msg({ id, role: "user", content: `Q ${id}` });
const a = (id: string) => msg({ id, role: "assistant", content: `A ${id}` });

/**
 * The pairing, and the reason it is a function with its own tests.
 *
 * <p>An exchange spans two entries of a flat array, and the obvious way to
 * build one — take them two at a time — is wrong the first time the array is
 * ragged. A question whose answer failed is a real state: the request 500s, the
 * question is persisted, nothing comes back. Index arithmetic would attach
 * every answer below that point to the question before it, so the evidence
 * under an answer would belong to a different question — which is the worst
 * failure this redesign could have, because it looks like a working citation.
 */
describe("exchangesOf", () => {
  it("pairs each answer with the question above it", () => {
    const exchanges = exchangesOf([q("1"), a("2"), q("3"), a("4")]);

    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].question?.id).toBe("1");
    expect(exchanges[0].answer?.id).toBe("2");
    expect(exchanges[1].question?.id).toBe("3");
    expect(exchanges[1].answer?.id).toBe("4");
  });

  it("does not shift the thread when a question was never answered", () => {
    const exchanges = exchangesOf([q("1"), q("2"), a("3")]);

    // The first question stands alone. Two-at-a-time would have paired
    // `q1`+`q2` and then left `a3` orphaned, and every exchange after it would
    // have been off by one for the rest of the conversation.
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].question?.id).toBe("1");
    expect(exchanges[0].answer).toBeNull();
    expect(exchanges[1].question?.id).toBe("2");
    expect(exchanges[1].answer?.id).toBe("3");
  });

  it("gives an answer with no question of its own an exchange of its own", () => {
    const exchanges = exchangesOf([a("1"), q("2"), a("3")]);

    expect(exchanges[0].question).toBeNull();
    expect(exchanges[0].answer?.id).toBe("1");
    expect(exchanges[1].question?.id).toBe("2");
    expect(exchanges[1].answer?.id).toBe("3");
  });

  it("does not attach a second answer to a question that already has one", () => {
    const exchanges = exchangesOf([q("1"), a("2"), a("3")]);

    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].answer?.id).toBe("2");
    expect(exchanges[1].answer?.id).toBe("3");
  });

  it("has nothing to say about an empty thread", () => {
    expect(exchangesOf([])).toEqual([]);
    expect(exchangesOf(undefined)).toEqual([]);
  });
});

describe("AskThread", () => {
  it("puts each answer's evidence with that answer and no other", () => {
    render(
      <AskThread
        messages={[q("1"), a("2"), q("3"), a("4")]}
        evidence={(answer) => <p>built on {answer.id}</p>}
      />,
    );

    // One rail per answer, named after the answer it belongs to. The render
    // prop is called with the *answer*, not the exchange, so a caller cannot
    // accidentally read the question's citations — there are none on a question.
    const turns = screen.getAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveTextContent("built on 2");
    expect(turns[1]).toHaveTextContent("built on 4");
  });

  it("draws no rail for a question still waiting on its answer", () => {
    render(
      <AskThread messages={[q("1")]} evidence={() => <p>built on something</p>} />,
    );

    expect(screen.queryByText(/built on/)).not.toBeInTheDocument();
  });

  it("shows the question being asked right now under everything said already", () => {
    render(
      <AskThread
        messages={[q("1"), a("2")]}
        pending={{ id: "pending:1", question: "And the budget?", status: "asking" }}
      />,
    );

    // Last, because it is the newest thing said. It cannot be in the message
    // list: the server has not heard of it yet.
    const said = screen.getAllByText(/Q 1|A 2|And the budget\?/).map((n) => n.textContent);
    expect(said).toEqual(["Q 1", "A 2", "And the budget?"]);
    expect(screen.getByRole("status")).toHaveTextContent(/thinking/i);
  });

  it("offers the bin on the question and never on the answer", () => {
    render(<AskThread messages={[q("1"), a("2")]} onDelete={vi.fn()} />);

    // The server pairs from either half and there is no endpoint that deletes
    // an answer, so a bin under one would be a control that cannot do what it
    // says. See components/chat-message.
    expect(screen.getAllByRole("button", { name: /delete this exchange/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Copy answer" })).toBeInTheDocument();
  });

  it("shows two bars and no thread while the history is still coming", () => {
    const { container } = render(<AskThread messages={undefined} loading />);

    // `loading` is "nothing to show and something coming", which is not the
    // same as a request being in flight — a refetch after an answer must not
    // replace the conversation with skeletons.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("keeps the question on screen while the new thread's history loads", () => {
    /*
     * A REGRESSION TEST FOR A TWO-SECOND FLICKER, reported from a screenshot.
     *
     * <p>Ask the first question of a new conversation and the question bubble
     * and `Thinking…` appeared, vanished for about two seconds, and came back.
     *
     * <p>The cause is a real state this component is handed and had no answer
     * for. Asking that first question moves `conversationId` from null to an
     * id, which starts the messages query on a key with nothing cached under
     * it; both surfaces compute `isLoading = isFetching && !messages`, so for
     * the length of that fetch `loading` is true *with a turn already on
     * screen*. The skeleton branch took precedence and replaced it.
     *
     * <p>So `loading` and `pending` arrive together, which sounds
     * contradictory and is not: `loading` means "nothing persisted to show and
     * something coming", and the pending turn is not persisted. When both are
     * true the turn wins, because it is the only evidence the click did
     * anything and a placeholder is not worth taking it off the screen for.
     */
    render(
      <AskThread
        messages={undefined}
        loading
        pending={{ id: "pending:1", question: "What changed recently?", status: "asking" }}
      />,
    );

    expect(screen.getByText("What changed recently?")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/thinking/i);
  });

  it("still shows the bars when there is genuinely nothing to show", () => {
    // The other half of the pair above: the guard is `loading && !pending`, so
    // a first load with no turn in flight is unaffected.
    const { container } = render(<AskThread messages={undefined} loading pending={null} />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("keeps the question on screen instead of the resting identity too", () => {
    // The same rule, on the branch that already had it. An empty thread with a
    // question in flight is not an empty panel.
    render(
      <AskThread
        messages={[]}
        pending={{ id: "pending:1", question: "What changed recently?", status: "asking" }}
        resting={<p>Ask about your conversations</p>}
      />,
    );

    expect(screen.getByText("What changed recently?")).toBeInTheDocument();
    expect(screen.queryByText("Ask about your conversations")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty thread rather than a wall of chips", () => {
    const { container } = render(<AskThread messages={[]} />);

    // The starter prompts sit above the composer, so the panel reads bottom-up
    // rather than opening with chips where the first answer is about to appear.
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });
});
