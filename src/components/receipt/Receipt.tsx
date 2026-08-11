import { useI18n } from "@/lib/i18n";
import { formatBHD, formatDate, formatTime } from "@/lib/format";
import type { ReceiptData } from "@/lib/printer";

/**
 * 80mm printable receipt / kitchen ticket. Both variants live permanently
 * in the DOM (invisible on screen); `printer.ts` scopes `window.print()` to
 * the requested one. Keep this pure HTML/text — no icons (they look broken
 * on thermal printers).
 */
export function Receipt({ data, variant }: { data: ReceiptData; variant: "receipt" | "kitchen" }) {
  const { t, lang } = useI18n();
  const id = variant === "receipt" ? "dokan-receipt" : "dokan-kitchen-ticket";

  return (
    <div id={id} className="receipt-print" data-receipt>
      {variant === "receipt" ? (
        <>
          <div className="receipt-header">
            <div className="font-bold">{t("pos.receiptTitle")}</div>
            <div>{t("pos.order")} #{data.orderNumber}</div>
            <div>
              {formatDate(data.createdAt, lang)} {formatTime(data.createdAt, lang)}
            </div>
            {data.tableName && (
              <div>
                {t("menu.table")}: {data.tableName}
              </div>
            )}
            {data.customerName && <div>{data.customerName}</div>}
          </div>
          <div className="receipt-divider" />
          {data.items.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between">
                <span>
                  {item.quantity}× {lang === "ar" && item.nameAr ? item.nameAr : item.name}
                </span>
                <span>{formatBHD(item.unitPrice * item.quantity, lang)}</span>
              </div>
              {item.addons && item.addons.length > 0 && (
                <div className="ps-3 text-[8px]">
                  +{item.addons.map((a) => (lang === "ar" && a.nameAr ? a.nameAr : a.name)).join(", ")}
                </div>
              )}
            </div>
          ))}
          <div className="receipt-divider" />
          <div className="flex justify-between">
            <span>{t("pos.subtotal")}</span>
            <span>{formatBHD(data.subtotal, lang)}</span>
          </div>
          {data.discount > 0 && (
            <div className="flex justify-between">
              <span>{t("pos.discount")}</span>
              <span>-{formatBHD(data.discount, lang)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t("pos.vat")}</span>
            <span>{formatBHD(data.vat, lang)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>{t("pos.total")}</span>
            <span>{formatBHD(data.total, lang)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("pos.paymentMethod")}</span>
            <span>{t(`order.payment.${data.paymentMethod}`)}</span>
          </div>
          <div className="receipt-footer">{t("pos.thankYou")}</div>
        </>
      ) : (
        <>
          <div className="receipt-header">
            <div className="font-bold">{t("pos.kitchenTitle")}</div>
            <div>
              {t("pos.order")} #{data.orderNumber}
            </div>
            {data.tableName && (
              <div>
                {t("menu.table")}: {data.tableName}
              </div>
            )}
            <div>
              {formatDate(data.createdAt, lang)} {formatTime(data.createdAt, lang)}
            </div>
          </div>
          <div className="receipt-divider" />
          {data.items.map((item, i) => (
            <div key={i} className="mb-1">
              <div className="font-bold">
                {item.quantity}× {item.name}
              </div>
              {item.addons && item.addons.length > 0 && (
                <div className="ps-3 text-[8px]">+{item.addons.map((a) => a.name).join(", ")}</div>
              )}
            </div>
          ))}
          <div className="receipt-divider" />
          <div className="receipt-footer">{data.orderNumber}</div>
        </>
      )}
    </div>
  );
}