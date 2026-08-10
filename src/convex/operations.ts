import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectId } from "./membership";

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export const createBranch = mutation({
  args: {
    name: v.string(),
    nameAr: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db.insert("branches", { projectId, ...args, isActive: true });
  },
});

export const updateBranch = mutation({
  args: {
    id: v.id("branches"),
    name: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Branch not found.");
    await ctx.db.patch(id, patch);
  },
});

export const deleteBranch = mutation({
  args: { id: v.id("branches") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Branch not found.");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const createTable = mutation({
  args: {
    branchId: v.id("branches"),
    name: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const branch = await ctx.db.get(args.branchId);
    if (!branch || branch.projectId !== projectId) throw new Error("Branch not found.");
    const base = (args.slug ?? args.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "table";
    let slug = base;
    let n = 2;
    while (
      await ctx.db
        .query("tables")
        .withIndex("by_slug", (q: any) => q.eq("projectId", projectId).eq("slug", slug))
        .first()
    ) {
      slug = `${base}-${n++}`;
    }
    return await ctx.db.insert("tables", {
      projectId,
      branchId: args.branchId,
      name: args.name,
      slug,
      isActive: true,
    });
  },
});

/**
 * Tables for the workspace with live occupancy derived from active orders
 * (pending / preparing). Reactive: placing or delivering an order flips the
 * status in real time.
 */
export const tablesWithStatus = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await requireProjectId(ctx);
    const [tables, orders] = await Promise.all([
      ctx.db
        .query("tables")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("orders")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect(),
    ]);

    const activeByTable = new Map<string, string[]>();
    for (const o of orders) {
      if (!o.tableId) continue;
      if (o.status === "pending" || o.status === "preparing") {
        const list = activeByTable.get(o.tableId) ?? [];
        list.push(o.orderNumber);
        activeByTable.set(o.tableId, list);
      }
    }

    return tables.map((t) => {
      const activeOrders = activeByTable.get(t._id) ?? [];
      return {
        ...t,
        activeOrders,
        occupied: activeOrders.length > 0,
      };
    });
  },
});

export const updateTable = mutation({
  args: {
    id: v.id("tables"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Table not found.");
    await ctx.db.patch(id, patch);
  },
});

export const deleteTable = mutation({
  args: { id: v.id("tables") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Table not found.");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const getStaffByPin = query({
  args: { pinCode: v.string() },
  handler: async (ctx, { pinCode }) => {
    const projectId = await requireProjectId(ctx);
    const staff = await ctx.db
      .query("staffMembers")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
    return staff.find((s) => s.isActive && s.pinCode === pinCode) ?? null;
  },
});

export const createStaff = mutation({
  args: {
    fullName: v.string(),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("cashier"), v.literal("kitchen")),
    pinCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db.insert("staffMembers", {
      projectId,
      fullName: args.fullName,
      role: args.role,
      pinCode: args.pinCode,
      isActive: true,
    });
  },
});

export const updateStaff = mutation({
  args: {
    id: v.id("staffMembers"),
    fullName: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("owner"), v.literal("manager"), v.literal("cashier"), v.literal("kitchen")),
    ),
    pinCode: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Staff not found.");
    await ctx.db.patch(id, patch);
  },
});
