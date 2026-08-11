/**
 * Offline order queue — IndexedDB via Dexie (async, no 5MB localStorage cap,
 * does not block the main thread).
 */
import Dexie, { type Table } from "dexie";
import { api, type CreateOrderArgs } from "./api";
import { notifyDataChanged } from "./realtime";

export interface QueuedOrder {
  id: string;
  payload: unknown;
  retryCount: number;
  createdAt: number;
  status: "pending" | "syncing" | "failed";
}

class DokanDB extends Dexie {
  queuedOrders!: Table<QueuedOrder, string>;

  constructor() {
    super("DokanOfflineDB");
    this.version(1).stores({
      queuedOrders: "id, status, createdAt",
    });
  }
}

export const offlineDB = new DokanDB();

export async function getQueue(): Promise<QueuedOrder[]> {
  return offlineDB.queuedOrders.toArray();
}

export async function addToQueue(payload: unknown): Promise<QueuedOrder> {
  const entry: QueuedOrder = {
    id: crypto.randomUUID(),
    payload,
    retryCount: 0,
    createdAt: Date.now(),
    status: "pending",
  };
  await offlineDB.queuedOrders.add(entry);
  return entry;
}

export async function updateQueueEntry(id: string, patch: Partial<QueuedOrder>) {
  await offlineDB.queuedOrders.update(id, patch);
}

export async function removeFromQueue(id: string) {
  await offlineDB.queuedOrders.delete(id);
}

export async function clearQueue() {
  await offlineDB.queuedOrders.clear();
}

/** Replay queued orders against the backend. Returns how many flushed. */
export async function flushQueue(): Promise<number> {
  const queue = await offlineDB.queuedOrders.where("status").notEqual("syncing").toArray();
  if (queue.length === 0) return 0;

  let flushed = 0;
  for (const entry of queue) {
    await updateQueueEntry(entry.id, { status: "syncing" });
    try {
      await api.orders.createOrder(entry.payload as CreateOrderArgs);
      await removeFromQueue(entry.id);
      flushed += 1;
    } catch (err) {
      console.error("[dokan] queued order failed to sync:", err);
      await updateQueueEntry(entry.id, {
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