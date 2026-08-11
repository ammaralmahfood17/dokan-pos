import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/**
 * BenefitPay payment session state machine:
 *
 *   idle → initiating → qr ──(poll 5 s, 5 min cap)──→ success | failed
 *
 * While the QR is showing the caller polls `checkBenefitPayStatus` every
 * 5 seconds for up to 5 minutes. `complete` is the sandbox/gateway-callback
 * confirmation path (see api.payments.completeBenefitPay).
 */
export type BenefitPayStatus =
  | "idle"
  | "initiating"
  | "qr"
  | "success"
  | "failed";

export interface BenefitPayPayload {
  transactionId: string;
  merchantId: string;
  amount: number;
  orderId: string;
  timestamp: number;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const BENEFITPAY_TIMEOUT_SECONDS = POLL_TIMEOUT_MS / 1000;

export function useBenefitPay() {
  const [status, setStatus] = useState<BenefitPayStatus>("idle");
  const [payload, setPayload] = useState<BenefitPayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(BENEFITPAY_TIMEOUT_SECONDS);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const payloadRef = useRef<BenefitPayPayload | null>(null);

  // Keep the ref in sync with state — writing refs during render is a purity
  // violation (react-hooks/purity).
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** Start a new payment session for an order. */
  const start = useCallback(
    async (orderId: string, amount: number) => {
      stopPolling();
      setStatus("initiating");
      setError(null);
      setPayload(null);
      try {
        const p = await api.payments.initiateBenefitPay({ orderId, amount });
        setPayload(p);
        setSecondsLeft(BENEFITPAY_TIMEOUT_SECONDS);
        setStatus("qr");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("failed");
      }
    },
    [stopPolling],
  );

  // Poll while the QR is on screen.
  useEffect(() => {
    if (status !== "qr") return undefined;
    const payload = payloadRef.current;
    if (!payload) return undefined;

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        stopPolling();
        setStatus("failed");
        setError("Payment timed out — please try again.");
        return;
      }
      try {
        const r = await api.payments.checkBenefitPayStatus({
          transactionId: payload.transactionId,
        });
        if (!alive) return;
        if (r.status === "completed") {
          stopPolling();
          setStatus("success");
        } else if (r.status === "failed") {
          stopPolling();
          setStatus("failed");
          setError("Payment failed — please try again.");
        }
      } catch {
        // Transient network error — keep polling.
      }
    };

    void tick();
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      stopPolling();
    };
  }, [status, stopPolling]);

  /** Confirm the payment (sandbox gateway-callback simulator). */
  const complete = useCallback(async () => {
    const payload = payloadRef.current;
    if (!payload) return;
    try {
      await api.payments.completeBenefitPay({ transactionId: payload.transactionId });
      stopPolling();
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("failed");
    }
  }, [stopPolling]);

  /** Back to idle (modal closed). */
  const reset = useCallback(() => {
    stopPolling();
    setStatus("idle");
    setPayload(null);
    setError(null);
  }, [stopPolling]);

  return { status, payload, error, secondsLeft, start, complete, reset };
}