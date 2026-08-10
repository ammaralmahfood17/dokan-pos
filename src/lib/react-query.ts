import { useCallback, useEffect, useRef, useState } from "react";
import { notifyDataChanged, subscribeData } from "./realtime";

/**
 * Reactive data hook — drop-in for `useQuery` from "convex/react".
 *
 * - Returns `undefined` while loading or when the fetch fails.
 * - Refetches whenever the serialized args change.
 * - Refetches on `notifyDataChanged()` (after any mutation or a Realtime event).
 */
export function useQuery<T, A = unknown>(
  fn: (args: A) => Promise<T>,
  args?: A,
): T | undefined {
  const [snapshot, setSnapshot] = useState<{ v: T | undefined } | null>(null);

  const fnRef = useRef(fn);
  const argsRef = useRef<A | undefined>(args);

  // Keep the refs fresh outside of render (react-hooks/refs: no ref writes during render).
  useEffect(() => {
    fnRef.current = fn;
    argsRef.current = args;
  });

  const key = JSON.stringify({ f: (fn as { name?: string }).name ?? "", a: args ?? null });

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const v = await fnRef.current(argsRef.current as A);
        if (alive) setSnapshot({ v });
      } catch (err) {
        console.error(`[dokan] query "${key}" failed:`, err);
        if (alive) setSnapshot({ v: undefined });
      }
    };

    load();
    const unsub = subscribeData(load);
    return () => {
      alive = false;
      unsub();
    };
  }, [key]);

  return snapshot === null ? undefined : snapshot.v;
}

/**
 * Mutation hook — drop-in for `useMutation` from "convex/react".
 * Invalidates every mounted query after the mutation resolves.
 */
export function useMutation<T, A = unknown>(fn: (args: A) => Promise<T>) {
  return useCallback(
    async (args?: A) => {
      const result = await fn(args as A);
      notifyDataChanged();
      return result;
    },
    [fn],
  );
}
