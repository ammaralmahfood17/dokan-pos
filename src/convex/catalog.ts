import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectId } from "./membership";

// ---------------------------------------------------------------------------
// Catalog queries
// ---------------------------------------------------------------------------

/** Full catalog for the POS: categories, products and addons grouped by product. */
export const posCatalog = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await requireProjectId(ctx);
    const [categories, products, addons] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("products")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("addons")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
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
      categories: categories
        .filter((c) => c.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      products: products.filter((p) => p.isActive),
      addonsByProduct: Object.fromEntries(addonsByProduct),
    };
  },
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategory = mutation({
  args: { name: v.string(), nameAr: v.string(), sortOrder: v.optional(v.number()) },
  handler: async (ctx, { name, nameAr, sortOrder }) => {
    const projectId = await requireProjectId(ctx);
    const max = await ctx.db
      .query("categories")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return await ctx.db.insert("categories", {
      projectId,
      name,
      nameAr,
      sortOrder: sortOrder ?? max.length + 1,
      isActive: true,
    });
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Category not found.");
    await ctx.db.patch(id, patch);
  },
});

export const deleteCategory = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Category not found.");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const createProduct = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
    categoryId: v.optional(v.id("categories")),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    price: v.number(),
    costPrice: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    allergens: v.optional(v.array(v.string())),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    return await ctx.db.insert("products", {
      projectId,
      categoryId: args.categoryId,
      name: args.name,
      nameAr: args.nameAr,
      description: args.description,
      descriptionAr: args.descriptionAr,
      price: args.price,
      costPrice: args.costPrice ?? Math.round(args.price * 0.5 * 1000) / 1000,
      imageUrl: args.imageUrl,
      allergens: args.allergens ?? [],
      isAvailable: args.isAvailable ?? true,
      isActive: true,
    });
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    price: v.optional(v.number()),
    costPrice: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    allergens: v.optional(v.array(v.string())),
    isAvailable: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Product not found.");
    await ctx.db.patch(id, patch);
  },
});

export const deleteProduct = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Product not found.");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Addons
// ---------------------------------------------------------------------------

export const createAddon = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    nameAr: v.string(),
    price: v.number(),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product || product.projectId !== projectId) throw new Error("Product not found.");
    return await ctx.db.insert("addons", { projectId, ...args, isActive: true });
  },
});

export const updateAddon = mutation({
  args: {
    id: v.id("addons"),
    name: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    price: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const { id, ...patch } = args;
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Addon not found.");
    await ctx.db.patch(id, patch);
  },
});

export const deleteAddon = mutation({
  args: { id: v.id("addons") },
  handler: async (ctx, { id }) => {
    const projectId = await requireProjectId(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.projectId !== projectId) throw new Error("Addon not found.");
    await ctx.db.delete(id);
  },
});
