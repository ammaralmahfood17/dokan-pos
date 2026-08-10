import { useCallback, useEffect, useRef, useState } from "react";
import { notifyDataChanged, subscribeData } from "./realtime";

type QueryFn = (args?: any) => Promise<any>;

/**
 * Reactive data hook — drop-in for `useQuery` from "convex/react".
 *
 * - Returns `undefined` while loading or when the fetch fails.
 * - Refetches whenever the serialized args change.
 * - Refetches on `notifyDataChanged()` (after any mutation or a Realtime event).
 */
export function useQuery<T>(fn: (args?: any) => Promise<T>, args?: any): T | undefined {
  const [snapshot, setSnapshot] = useState<{ v: any } | null>(null);

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const argsRef = useRef(args);
  argsRef.current = args;

  const key = JSON.stringify({ f: (fn as { name?: string }).name ?? "", a: args ?? null });

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const v = await fnRef.current(argsRef.current);
        if (alive) setSnapshot({ v });
      } catch (err) {
        console.error(`[dokan] query "${key}" failed:`, err);
        if (alive) setSnapshot({ v: undefined });
      }
    };

    load();
    return subscribeData(load);
  }, [key]);

  return snapshot === null ? undefined : snapshot.v;
}

/**
 * Mutation hook — drop-in for `useMutation` from "convex/react".
 * Invalidates every mounted query after the mutation resolves.
 */
export function useMutation(fn: QueryFn) {
  return useCallback(
    async (args?: any) => {
      const result = await fn(args);
      notifyDataChanged();
      return result;
    },
    [fn],
  );
}
