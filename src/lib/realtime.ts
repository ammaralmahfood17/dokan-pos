/**
 * Minimal pub/sub used to make the Supabase data layer reactive.
 *
 * Mutations call `notifyDataChanged()` after they succeed; any mounted
 * `useQuery` subscribed via `subscribeData` refetches. Supabase Realtime
 * (orders channel) calls the debounced variant so rapid-fire events (a busy
 * KDS bumping several orders at once) don't trigger a refetch storm.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Optional keys arg is accepted for call-site compatibility (the pub/sub is
// table-agnostic — every listener refetches whatever it queries).
export function notifyDataChanged(_keys?: string[]) {
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error("[dokan] data listener error:", err);
    }
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesce bursts of events into a single refetch (trailing edge). */
export function notifyDataChangedDebounced(delayMs = 300) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    notifyDataChanged();
  }, delayMs);
}
