import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Public menu data for the QR-menu page.
 * No authentication — anyone with the table URL can view the menu.
 */
export const getPublicMenu = query({
  args: { projectSlug: v.string() },
  handler: async (ctx, { projectSlug }) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q: any) => q.eq("slug", projectSlug))
      .first();

    if (!project || !project.isActive) throw new Error("Restaurant not found.");

    const [categories, products, addons] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
        .collect(),
      ctx.db
        .query("products")
        .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
        .collect(),
      ctx.db
        .query("addons")
        .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
        .collect(),
    ]);

    const addonsByProduct = new Map<string, typeof addons>();
    for (const a of addons) {
      if (!a.isActive) continue;
      const list = addonsByProduct.get(a.productId) ?? [];
      list.push(a);
      addonsByProduct.set(a.productId, list);
    }

    return {
      project: {
        _id: project._id,
        name: project.name,
        nameAr: project.nameAr,
        currency: project.currency,
        defaultLanguage: project.defaultLanguage,
      },
      categories: categories
        .filter((c: any) => c.isActive)
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder),
      products: products.filter((p: any) => p.isActive && p.isAvailable),
      addonsByProduct: Object.fromEntries(addonsByProduct),
    };
  },
});

/**
 * Create an order from the public QR menu.
 * No auth required. Returns the order number for confirmation display.
 */
export const createPublicOrder = mutation({
  args: {
    projectSlug: v.string(),
    tableSlug: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        name: v.string(),
        nameAr: v.optional(v.string()),
        unitPrice: v.number(),
        quantity: v.number(),
        notes: v.optional(v.string()),
        addons: v.optional(
          v.array(
            v.object({
              addonId: v.optional(v.id("addons")),
              name: v.string(),
              nameAr: v.optional(v.string()),
              price: v.number(),
            }),
          ),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.projectSlug))
      .first();
    if (!project || !project.isActive) throw new Error("Restaurant not found.");

    const branch = await ctx.db
      .query("branches")
      .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
      .first();
    const table = await ctx.db
      .query("tables")
      .withIndex("by_slug", (q: any) => q.eq("projectId", project._id).eq("slug", args.tableSlug))
      .first();

    const orderNumber = await computeOrderNumber(ctx, project._id);

    // Compute totals
    let subtotal = 0;
    const resolvedItems: any[] = [];
    for (const item of args.items) {
      const product = item.productId ? await ctx.db.get(item.productId) : null;
      const unitPrice = product && "price" in product ? product.price : item.unitPrice;
      let itemTotal = unitPrice * item.quantity;
      const addons = (item.addons ?? []).map((a) => {
        itemTotal += a.price * item.quantity;
        return a;
      });
      subtotal += itemTotal;
      resolvedItems.push({ ...item, unitPrice, addons });
    }

    const vatRate = project.vatRate ?? 0.1;
    const vatAmount = Math.max(0, subtotal * vatRate);
    const total = Math.max(0, subtotal + vatAmount);

    const orderId = await ctx.db.insert("orders", {
      projectId: project._id,
      branchId: branch?._id,
      tableId: table?._id,
      orderNumber,
      orderType: "dine-in",
      status: "pending",
      subtotal: Math.round(subtotal * 1000) / 1000,
      vatAmount: Math.round(vatAmount * 1000) / 1000,
      discountAmount: 0,
      total: Math.round(total * 1000) / 1000,
      paymentMethod: "cash",
      paymentStatus: "pending",
      customerPhone: args.customerPhone,
      customerName: args.customerName,
      notes: args.notes,
      source: "qr-menu",
    });

    for (const item of resolvedItems) {
      const itemId = await ctx.db.insert("orderItems", {
        orderId,
        productId: item.productId,
        productName: item.name,
        productNameAr: item.nameAr,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: Math.round(item.unitPrice * item.quantity * 1000) / 1000,
        notes: item.notes,
      });
      for (const a of item.addons) {
        await ctx.db.insert("orderItemAddons", {
          orderItemId: itemId,
          addonName: a.name,
          addonNameAr: a.nameAr,
          price: a.price,
        });
      }
    }

    return { orderId, orderNumber };
  },
});

async function computeOrderNumber(ctx: { db: any }, projectId: any) {
  const count = await ctx.db
    .query("orders")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  return `#${String(count.length + 1).padStart(4, "0")}`;
}