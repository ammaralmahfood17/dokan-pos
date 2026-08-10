/** Offline order queue using localStorage. */
import { api } from "./api";
import { notifyDataChanged } from "./realtime";

export interface QueuedOrder {
  id: string;
  payload: unknown;
  retryCount: number;
  createdAt: number;
  status: "pending" | "syncing" | "failed";
}

const QUEUE_KEY = "dokan-order-queue";

export function getQueue(): QueuedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addToQueue(payload: unknown): QueuedOrder {
  const queue = getQueue();
  const entry: QueuedOrder = {
    id: crypto.randomUUID(),
    payload,
    retryCount: 0,
    createdAt: Date.now(),
    status: "pending",
  };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return entry;
}

export function updateQueueEntry(id: string, patch: Partial<QueuedOrder>) {
  const queue = getQueue();
  const idx = queue.findIndex((e) => e.id === id);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...patch };
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter((e) => e.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

/** Replay queued orders against the backend. Returns how many flushed. */
export async function flushQueue(): Promise<number> {
  const queue = getQueue().filter((e) => e.status !== "syncing");
  if (queue.length === 0) return 0;

  let flushed = 0;
  for (const entry of queue) {
    updateQueueEntry(entry.id, { status: "syncing" });
    try {
      await api.orders.createOrder(entry.payload as any);
      removeFromQueue(entry.id);
      flushed += 1;
    } catch (err) {
      console.error("[dokan] queued order failed to sync:", err);
      updateQueueEntry(entry.id, {
        status: "pending",
        retryCount: entry.retryCount + 1,
      });
    }
  }
  if (flushed > 0) notifyDataChanged();
  return flushed;
}

export function useOnlineStatus() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
