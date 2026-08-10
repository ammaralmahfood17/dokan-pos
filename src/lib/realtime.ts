/**
 * Minimal pub/sub used to make the Supabase data layer reactive.
 *
 * Mutations call `notifyDataChanged()` after they succeed; any mounted
 * `useQuery` subscribed via `subscribeData` refetches. Supabase Realtime
 * (orders channel) also calls `notifyDataChanged()` so the KDS, POS table
 * occupancy and order lists stay live across devices.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDataChanged() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error("[dokan] data listener error:", err);
    }
  });
}
