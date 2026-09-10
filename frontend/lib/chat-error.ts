/**
 * What went wrong, in the server's words where it sent any.
 *
 * <h2>Why this exists</h2>
 *
 * <p>Because a `catch` that discards the error is how a bug becomes
 * undiagnosable. Deleting a conversation was reported as failing with a toast
 * on `/ask`, and the handler read:
 *
 *     } catch {
 *       toast.error("Couldn't delete that conversation.");
 *     }
 *
 * <p>Both chat surfaces call the same mutation, with the same scope, on the
 * same endpoint — so whatever refused it said so in a response that the
 * interface then threw away. The sentence a reader saw was the only evidence,
 * and it says nothing.
 *
 * <p>`settingsError` in components/settings/shared does the same job for the
 * settings tabs and is not reused here on purpose: it hard-codes "Couldn't save
 * that." as its fallback, which is the wrong sentence for a delete and the
 * wrong sentence for a rename. The fallback belongs to the caller, which knows
 * what it was trying to do.
 *
 * <h2>What it will and will not show</h2>
 *
 * <p>Only `data.message`, which is the field this API's error bodies carry and
 * the one place a human sentence is written. Never a status code, never a URL,
 * never `error` — RTK Query puts the browser's own phrasing there ("Failed to
 * fetch", "TypeError") and none of it means anything to somebody who was trying
 * to tidy their chat history.
 */
export function chatError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "data" in err) {
    const data = (err as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  }
  return fallback;
}
