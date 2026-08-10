import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectId } from "./membership";
import type { Id } from "./_generated/dataModel";

type OrderItemInput = {
  productId?: Id<"products">;
  name: string;
  nameAr?: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  addons?: {
    addonId?: Id<"addons">;
    name: string;
    nameAr?: string;
    price: number;
  }[];
};

type CreateOrderArgs = {
  projectId: Id<"projects">;
  branchId?: Id<"branches">;
  tableId?: Id<"tables">;
  staffId?: Id<"staffMembers">;
  orderType: "dine-in" | "takeaway" | "delivery";
  paymentMethod: "cash" | "benefitpay" | "card";
  paymentStatus?: "pending" | "paid" | "failed" | "refunded";
  customerPhone?: string;
  customerName?: string;
  notes?: string;
  discountAmount?: number;
  idempotencyKey?: string;
  source?: "pos" | "qr-menu";
  items: OrderItemInput[];
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function sumItems(
  items: OrderItemInput[],
): { items: OrderItemInput[]; subtotal: number } {
  let subtotal = 0;
  for (const item of items) {
    let t = item.unitPrice * item.quantity;
    for (const a of item.addons ?? []) {
      t += a.price * item.quantity;
    }
    subtotal += t;
  }
  return { items, subtotal };
}

async function createOrderCore(
  ctx: { db: any },
  args: CreateOrderArgs,
): Promise<string> {
  const { projectId } = args;
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found.");

  const { subtotal } = sumItems(args.items);
  const vatRate = project.vatRate ?? 0.1;
  const discountAmount = args.discountAmount ?? 0;
  const vatAmount = Math.max(0, (subtotal - discountAmount) * vatRate);
  const total = Math.max(0, subtotal - discountAmount + vatAmount);

  const orderNumber = await computeNextOrderNumber(ctx, projectId);

  const orderId = await ctx.db.insert("orders", {
    projectId,
    branchId: args.branchId,
    tableId: args.tableId,
    staffId: args.staffId,
    orderNumber,
    orderType: args.orderType,
    status: "pending",
    subtotal: round3(subtotal),
    vatAmount: round3(vatAmount),
    discountAmount: round3(discountAmount),
    total: round3(total),
    paymentMethod: args.paymentMethod,
    paymentStatus: args.paymentStatus ?? "pending",
    customerPhone: args.customerPhone,
    customerName: args.customerName,
    notes: args.notes,
    idempotencyKey: args.idempotencyKey,
    source: args.source,
  });

  for (const item of args.items) {
    const itemTotal = item.unitPrice * item.quantity;
    const itemId = await ctx.db.insert("orderItems", {
      orderId,
      productId: item.productId,
      productName: item.name,
      productNameAr: item.nameAr,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      totalPrice: round3(itemTotal),
      notes: item.notes,
    });
    for (const a of item.addons ?? []) {
      await ctx.db.insert("orderItemAddons", {
        orderItemId: itemId,
        addonId: a.addonId,
        addonName: a.name,
        addonNameAr: a.nameAr,
        price: a.price,
      });
    }
  }

  // Loyalty: one stamp per paid order with a phone number
  if (args.paymentStatus === "paid" && args.customerPhone) {
    const [program] = await ctx.db
      .query("loyaltyPrograms")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
    if (program) {
      const existing = await ctx.db
        .query("loyaltyStamps")
        .withIndex("by_program", (q: any) => q.eq("programId", program._id).eq("customerPhone", args.customerPhone))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { currentStamps: existing.currentStamps + 1 });
      } else {
        await ctx.db.insert("loyaltyStamps", {
          programId: program._id,
          customerPhone: args.customerPhone,
          currentStamps: 1,
          redeemedCount: 0,
        });
      }
    }
  }

  return orderId;
}

async function computeNextOrderNumber(ctx: { db: any }, projectId: Id<"projects">) {
  const count = await ctx.db
    .query("orders")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  return `#${String(count.length + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// POS order creation
// ---------------------------------------------------------------------------

export const createOrder = mutation({
  args: {
    orderType: v.union(v.literal("dine-in"), v.literal("takeaway"), v.literal("delivery")),
    paymentMethod: v.union(v.literal("cash"), v.literal("benefitpay"), v.literal("card")),
    paymentStatus: v.optional(
      v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("refunded")),
    ),
    branchId: v.optional(v.id("branches")),
    tableId: v.optional(v.id("tables")),
    customerPhone: v.optional(v.string()),
    customerName: v.optional(v.string()),
    notes: v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
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
    const projectId = await requireProjectId(ctx);
    const staff = await ctx.db
      .query("staffMembers")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .first();

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (existing) return existing._id;
    }

    return await createOrderCore(ctx, {
      projectId,
      branchId: args.branchId,
      tableId: args.tableId,
      staffId: staff?._id,
      orderType: args.orderType,
      paymentMethod: args.paymentMethod,
      paymentStatus: args.paymentStatus,
      customerPhone: args.customerPhone,
      customerName: args.customerName,
      notes: args.notes,
      discountAmount: args.discountAmount,
      idempotencyKey: args.idempotencyKey,
      source: "pos",
      items: args.items,
    });
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, { orderId, status }) => {
    const projectId = await requireProjectId(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.projectId !== projectId) throw new Error("Order not found.");
    await ctx.db.patch(orderId, { status });
  },
});

export const payOrder = mutation({
  args: {
    orderId: v.id("orders"),
    paymentMethod: v.optional(
      v.union(v.literal("cash"), v.literal("benefitpay"), v.literal("card")),
    ),
  },
  handler: async (ctx, { orderId, paymentMethod }) => {
    const projectId = await requireProjectId(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.projectId !== projectId) throw new Error("Order not found.");
    await ctx.db.patch(orderId, {
      paymentStatus: "paid",
      ...(paymentMethod ? { paymentMethod } : {}),
    });
  },
});

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const listOrders = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await requireProjectId(ctx);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .order("desc")
      .collect();

    const orderIds = orders.map((o) => o._id);
    const itemsList = await Promise.all(
      orderIds.map((oid: Id<"orders">) =>
        ctx.db
          .query("orderItems")
          .withIndex("by_order", (q: any) => q.eq("orderId", oid))
          .collect(),
      ),
    );
    const addonsList = await Promise.all(
      itemsList.flat().map((it) =>
        ctx.db
          .query("orderItemAddons")
          .withIndex("by_order_item", (q: any) => q.eq("orderItemId", it._id))
          .collect(),
      ),
    );
    const addonMap = new Map<string, typeof addonsList[number]>();
    itemsList.flat().forEach((it, i) => addonMap.set(it._id, addonsList[i]));

    return orders.map((o, i) => ({
      ...o,
      items: itemsList[i].map((it) => ({ ...it, addons: addonMap.get(it._id) ?? [] })),
    }));
  },
});