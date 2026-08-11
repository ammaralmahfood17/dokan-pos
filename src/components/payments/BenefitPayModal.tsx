import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { formatBHD } from "@/lib/format";
import { useBenefitPay } from "@/hooks/use-benefitpay";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface BenefitPayModalProps {
  open: boolean;
  /** Order id the payment is attached to. */
  orderId: string;
  /** Amount to collect (order total, BHD, 3 decimals). */
  amount: number;
  /** Parent clears the cart / closes the flow when payment succeeds. */
  onSuccess: () => void;
  onClose: () => void;
}

/** Format minutes:seconds for the polling countdown. */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * BenefitPay POS payment modal — shows a scannable QR (≥240px, gold border)
 * and polls the transaction status every 5 s for up to 5 minutes.
 */
export function BenefitPayModal({ open, orderId, amount, onSuccess, onClose }: BenefitPayModalProps) {
  const { t, lang } = useI18n();
  const { status, payload, error, secondsLeft, start, complete, reset } = useBenefitPay();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Start the payment session as soon as the modal opens (idle guard keeps
  // StrictMode double-mounts from creating two transactions for one order).
  // Deferred so we never setState synchronously inside the effect.
  useEffect(() => {
    if (open && status === "idle") {
      const t = window.setTimeout(() => void start(orderId, amount), 0);
      return () => window.clearTimeout(t);
    }
  }, [open, orderId, amount, start, status]);

  // Render the QR once the payload is available.
  useEffect(() => {
    if (!payload) {
      const t = window.setTimeout(() => setQrDataUrl(null), 0);
      return () => window.clearTimeout(t);
    }
    let alive = true;
    QRCode.toDataURL(
      JSON.stringify({
        // Keep a stable key order so identical sessions scan identically.
        transactionId: payload.transactionId,
        merchantId: payload.merchantId,
        amount: payload.amount,
        orderId: payload.orderId,
        timestamp: payload.timestamp,
      }),
      { width: 280, margin: 1, errorCorrectionLevel: "M" },
    )
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {
        if (alive) setQrDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [payload]);

  // Notify the parent exactly once when the payment completes.
  useEffect(() => {
    if (status === "success") onSuccess();
  }, [status, onSuccess]);

  const notConfigured = error?.includes("benefitpay_not_configured") || error?.includes("BenefitPay merchant");

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : (reset(), onClose()))}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("benefitPay.title")}</DialogTitle>
        </DialogHeader>

        {status === "initiating" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </div>
        )}

        {(status === "qr" || status === "success" || status === "failed") && payload && (
          <div className="space-y-4">
            {/* Amount — always LTR, 3 decimals, end-aligned */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t("benefitPay.amount")}</p>
              <p
                dir="ltr"
                inputMode="decimal"
                className="numeric mt-0.5 text-center text-2xl font-bold font-mono tracking-tight"
              >
                {formatBHD(payload.amount, lang)}
              </p>
            </div>

            {status === "qr" && (
              <>
                <div className="flex justify-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={lang === "ar" ? "رمز الاستجابة السريعة للدفع" : "Payment QR code"}
                      aria-label={lang === "ar" ? "رمز الاستجابة السريعة للدفع" : "Payment QR code"}
                      className="size-[17.5rem] min-w-[240px] rounded-md border-2 border-gold bg-white p-2"
                      width={280}
                      height={280}
                    />
                  ) : (
                    <div className="flex size-[17.5rem] min-w-[240px] items-center justify-center rounded-md border-2 border-gold bg-muted">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">{t("benefitPay.scanHint")}</p>
                <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                  <span>{t("benefitPay.waiting")}</span>
                  <span className="font-mono" dir="ltr">
                    {t("benefitPay.expiresIn")} {formatCountdown(secondsLeft)}
                  </span>
                </div>
                {/* Sandbox only: until live merchant credentials exist this is how a
                    staff member confirms a test payment (the gateway webhook would
                    call the same server RPC). */}
                <Button variant="outline" className="w-full gap-2 min-h-[44px]" onClick={() => void complete()}>
                  <CheckCircle2 className="size-3.5 text-gold" />
                  {t("benefitPay.simulate")}
                </Button>
              </>
            )}

            {status === "success" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="size-12 text-emerald-500" />
                <p className="text-sm font-semibold">{t("benefitPay.success")}</p>
                <Button className="w-full min-h-[44px]" onClick={() => (reset(), onClose())}>
                  {t("common.confirm")}
                </Button>
              </div>
            )}

            {status === "failed" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-sm border border-red-500/40 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <XCircle className="size-4 shrink-0" />
                  <span>{notConfigured ? t("benefitPay.notConfigured") : t("benefitPay.failed")}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => (reset(), onClose())}>
                    {t("common.close")}
                  </Button>
                  {!notConfigured && (
                    <Button className="flex-1 min-h-[44px] gap-1.5" onClick={() => void start(orderId, amount)}>
                      <RefreshCw className="size-3.5" />
                      {t("common.retry")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}