/**
 * Thermal-printer helpers.
 *
 * Browser path: the printable receipt lives permanently in the DOM (hidden
 * on screen via the `.receipt-print` base rule) and `window.print()` prints
 * exactly the scoped element — the existing 80mm `@media print` CSS handles
 * the rest.
 *
 * Native path (future): when the app runs under Capacitor, swap
 * `printNode` for `@capacitor-community/bluetooth-le` — the API surface
 * (printReceipt / printKitchenTicket) stays the same.
 */

export interface ReceiptItem {
  name: string;
  nameAr?: string;
  quantity: number;
  unitPrice: number;
  addons?: { name: string; nameAr?: string; price: number }[];
}

export interface ReceiptData {
  orderNumber: string;
  createdAt: number;
  tableName?: string;
  customerName?: string;
  paymentMethod: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

/**
 * Print exactly one DOM node. All `.receipt-print` elements are always in
 * the DOM (invisible on screen); this scopes the print to `id` and restores
 * the others afterwards.
 */
export function printNode(id: string): Promise<void> {
  return new Promise((resolve) => {
    const target = document.getElementById(id);
    if (!target) {
      resolve();
      return;
    }
    const others = Array.from(document.querySelectorAll<HTMLElement>(".receipt-print")).filter(
      (el) => el !== target,
    );
    others.forEach((el) => el.classList.remove("receipt-print"));
    target.classList.add("receipt-print");

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      others.forEach((el) => el.classList.add("receipt-print"));
      window.removeEventListener("afterprint", finish);
      resolve();
    };
    window.addEventListener("afterprint", finish);
    // Safari does not always fire afterprint — fall back.
    setTimeout(finish, 1200);
    window.print();
  });
}

export async function printReceipt(): Promise<void> {
  await printNode("dokan-receipt");
}

export async function printKitchenTicket(): Promise<void> {
  await printNode("dokan-kitchen-ticket");
}