/** Offline order queue using localStorage. */

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

export function useOnlineStatus() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}