import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectId } from "./membership";

// ---------------------------------------------------------------------------
// Loyalty Programs
// ---------------------------------------------------------------------------

export const listLoyaltyPrograms = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db
      .query("loyaltyPrograms")        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
  },
});

export const createLoyaltyProgram = mutation({
  args: {
    name: v.string(),
    nameAr: v.optional(v.string()),
    stampTarget: v.number(),
    rewardName: v.optional(v.string()),
    rewardNameAr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db.insert("loyaltyPrograms", { projectId, ...args, active: true });
  },
});

export const deleteLoyaltyProgram = mutation({
  args: { id: v.id("loyaltyPrograms") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Program not found.");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Stamps (read-only for now — stamps are awarded on paid orders automatically)
// ---------------------------------------------------------------------------

export const listLoyaltyStamps = query({
  args: { programId: v.id("loyaltyPrograms") },
  handler: async (ctx, { programId }) => {
    return await ctx.db
      .query("loyaltyStamps")
      .withIndex("by_program", (q) => q.eq("programId", programId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export const listPromotions = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db
      .query("promotions")        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
  },
});

export const createPromotion = mutation({
  args: {
    name: v.string(),
    nameAr: v.optional(v.string()),
    type: v.union(v.literal("percentage"), v.literal("fixed"), v.literal("bogo")),
    value: v.optional(v.number()),
    minOrderAmount: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db.insert("promotions", { projectId, ...args, active: true });
  },
});

export const updatePromotion = mutation({
  args: {
    id: v.id("promotions"),
    name: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    type: v.optional(v.union(v.literal("percentage"), v.literal("fixed"), v.literal("bogo"))),
    value: v.optional(v.number()),
    minOrderAmount: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Promotion not found.");
    await ctx.db.patch(id, patch);
  },
});

export const deletePromotion = mutation({
  args: { id: v.id("promotions") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Promotion not found.");
    await ctx.db.delete(id);
  },
});