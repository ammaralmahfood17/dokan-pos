import { query } from "./_generated/server";
import { requireProjectId } from "./membership";

export const todayStats = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await requireProjectId(ctx);

    const startOfDay = Date.now() - (Date.now() % 86400000); // midnight UTC — good enough for demo
    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();

    const today = allOrders.filter((o) => o._creationTime >= startOfDay);
    const paidToday = today.filter((o) => o.paymentStatus === "paid");

    const revenue = paidToday.reduce((s, o) => s + o.total, 0);
    const orderCount = today.length;
    const paidCount = paidToday.length;

    // Top items: fetch order items from today's orders
    const todayOrderIds = today.map((o) => o._id);
    const allItems = (
      await Promise.all(
        todayOrderIds.map((oid) =>
          ctx.db.query("orderItems").withIndex("by_order", (q) => q.eq("orderId", oid)).collect(),
        ),
      )
    ).flat();

    const itemCount = new Map<string, { name: string; nameAr: string; qty: number; revenue: number }>();
    for (const it of allItems) {
      const key = it.productName;
      const cur = itemCount.get(key) ?? { name: it.productName, nameAr: it.productNameAr ?? "", qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.totalPrice;
      itemCount.set(key, cur);
    }
    const topItems = [...itemCount.entries()]
      .map(([_, v]) => v)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const statusCounts: Record<string, number> = {};
    for (const o of allOrders) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    }

    return { revenue, orderCount, paidCount, topItems, statusCounts };
  },
});