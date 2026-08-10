import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getProjectIdForUser, requireProjectId } from "./membership";
import { getCurrentUser } from "./users";

/** Latin/BH-friendly slugifier with collision-safe suffix support. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "cafe";
}

// ---------------------------------------------------------------------------
// Workspace queries
// ---------------------------------------------------------------------------

/** The signed-in user's workspace (project + staff + branches + tables). */
export const myWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const projectId = await getProjectIdForUser(ctx);
    if (projectId === null) return null;

    const [project, staff, branches, tables] = await Promise.all([
      ctx.db.get(projectId),
      ctx.db
        .query("staffMembers")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("branches")        .withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("tables")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect(),
    ]);

    if (!project) return null;
    return { project, staff, branches, tables };
  },
});

/** Public project lookup by slug (used by the QR menu). */
export const getProjectBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();
  },
});

// ---------------------------------------------------------------------------
// Onboarding — create the tenant in one shot
// ---------------------------------------------------------------------------

/**
 * Creates the tenant: project + owner staff record + first branch + tables +
 * a seeded demo menu + a default loyalty program. Returns the project id.
 */
export const createProject = mutation({
  args: {
    name: v.string(),
    nameAr: v.optional(v.string()),
    vatRate: v.optional(v.number()),
    vatNumber: v.optional(v.string()),
    branchName: v.string(),
    branchNameAr: v.optional(v.string()),
    tableNames: v.array(v.string()),
    seedDemoData: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { name, nameAr, vatRate, vatNumber, branchName, branchNameAr, tableNames, seedDemoData },
  ) => {
    const user = await getCurrentUser(ctx);
    if (user === null) throw new Error("You must be signed in to create a project.");

    // Ensure slug uniqueness with a numeric suffix on collision.
    const base = slugify(name);
    let slug = base;
    let n = 2;
    while (await ctx.db.query("projects").withIndex("by_slug", (q: any) => q.eq("slug", slug)).first()) {
      slug = `${base}-${n++}`;
    }

    const projectId = await ctx.db.insert("projects", {
      slug,
      name,
      nameAr,
      currency: "BHD",
      vatNumber: vatNumber ?? undefined,
      vatRate: vatRate ?? 0.1,
      isActive: true,
      subscriptionStatus: "trial",
      defaultLanguage: "en",
    });

    await ctx.db.insert("staffMembers", {
      projectId,
      userId: user._id,
      fullName: user.name ?? "Owner",
      role: "owner",
      isActive: true,
    });

    const branchId = await ctx.db.insert("branches", {
      projectId,
      name: branchName,
      nameAr: branchNameAr ?? undefined,
      isActive: true,
    });

    for (const t of tableNames) {
      if (!t.trim()) continue;
      await ctx.db.insert("tables", {
        projectId,
        branchId,
        name: t.trim(),
        slug: slugify(t),
        isActive: true,
      });
    }

    if (seedDemoData ?? true) {
      await seedMenu(ctx, projectId);
    }

    await ctx.db.insert("loyaltyPrograms", {
      projectId,
      name: "Stamps",
      nameAr: "طوابع",
      stampTarget: 9,
      rewardName: "Free drink",
      rewardNameAr: "مشروب مجاني",
      active: true,
    });

    return projectId;
  },
});

export const updateProject = mutation({
  args: {
    name: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    vatRate: v.optional(v.number()),
    vatNumber: v.optional(v.string()),
    currency: v.optional(v.string()),
    defaultLanguage: v.optional(v.union(v.literal("en"), v.literal("ar"))),
  },
  handler: async (ctx, args) => {
    const projectId = await requireProjectId(ctx);
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(projectId, patch);
    }
    return await ctx.db.get(projectId);
  },
});

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

// The mutation handler ctx — typed loosely so the seed helper stays decoupled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SeedCtx = { db: any };

async function seedMenu(ctx: SeedCtx, projectId: any) {
  const categories: { name: string; nameAr: string; sortOrder: number }[] = [
    { name: "Hot Drinks", nameAr: "مشروبات ساخنة", sortOrder: 1 },
    { name: "Cold Drinks", nameAr: "مشروبات باردة", sortOrder: 2 },
    { name: "Breakfast", nameAr: "فطور", sortOrder: 3 },
    { name: "Grills", nameAr: "مشويات", sortOrder: 4 },
    { name: "Desserts", nameAr: "حلويات", sortOrder: 5 },
  ];
  const catIds: string[] = [];
  for (const c of categories) {
    catIds.push(
      await ctx.db.insert("categories", { projectId, ...c, isActive: true }),
    );
  }

  type SeedProduct = {
    category: number;
    name: string;
    nameAr: string;
    description?: string;
    descriptionAr?: string;
    price: number;
    allergens?: string[];
    addons?: { name: string; nameAr: string; price: number }[];
  };

  const products: SeedProduct[] = [
    {
      category: 0,
      name: "Arabic Coffee (Gahwa)",
      nameAr: "قهوة عربية",
      description: "Cardamom-spiced coffee, served with dates.",
      descriptionAr: "قهوة بالهيل تقدم مع التمر",
      price: 0.75,
      addons: [{ name: "Extra cardamom", nameAr: "هيل إضافي", price: 0.15 }],
    },
    {
      category: 0,
      name: "Karak Chai",
      nameAr: "شاي كرك",
      description: "Strong spiced milk tea, Gulf style.",
      descriptionAr: "شاي بالحليب والبهارات على الطريقة الخليجية",
      price: 0.5,
      allergens: ["dairy"],
      addons: [
        { name: "Extra sugar", nameAr: "سكر إضافي", price: 0.1 },
        { name: "Saffron", nameAr: "زعفران", price: 0.3 },
      ],
    },
    {
      category: 0,
      name: "Cappuccino",
      nameAr: "كابتشينو",
      description: "Espresso with silky steamed milk.",
      descriptionAr: "إسبريسو مع حليب مبخر",
      price: 1.2,
      allergens: ["dairy"],
      addons: [
        { name: "Extra shot", nameAr: "شوت إضافي", price: 0.4 },
        { name: "Oat milk", nameAr: "حليب شوفان", price: 0.5 },
        { name: "Vanilla syrup", nameAr: "شراب فانيليا", price: 0.25 },
      ],
    },
    {
      category: 1,
      name: "Lemon Mint",
      nameAr: "ليمون نعناع",
      description: "Fresh lemon with mint, lightly sweetened.",
      descriptionAr: "ليمون طازج بالنعناع",
      price: 0.9,
    },
    {
      category: 1,
      name: "Fresh Orange Juice",
      nameAr: "عصير برتقال طازج",
      description: "Cold-pressed Valencia oranges.",
      descriptionAr: "برتقال فالنسيا معصور طازجاً",
      price: 1.1,
    },
    {
      category: 1,
      name: "Pomegranate Juice",
      nameAr: "عصير رمان",
      description: "100% pomegranate, no added sugar.",
      descriptionAr: "رمان طبيعي بدون سكر مضاف",
      price: 1.5,
    },
    {
      category: 2,
      name: "Balaleet",
      nameAr: "بلاليط",
      description: "Sweet saffron noodles with a crispy omelette.",
      descriptionAr: "شعيرية بالزعفران مع عجة ذهبية",
      price: 1.8,
      allergens: ["eggs", "gluten"],
    },
    {
      category: 2,
      name: "Cheese Regag",
      nameAr: "رقاق بالجبن",
      description: "Crispy layered bread with molten cheese.",
      descriptionAr: "رقاق هش بالجبن الذائب",
      price: 1.2,
      allergens: ["dairy", "gluten"],
    },
    {
      category: 3,
      name: "Chicken Shawarma",
      nameAr: "شاورما دجاج",
      description: "Marinated chicken, garlic sauce, pickles.",
      descriptionAr: "دجاج متبل مع ثومية ومخلل",
      price: 1.25,
      allergens: ["gluten"],
      addons: [
        { name: "Extra garlic", nameAr: "ثومية إضافية", price: 0.2 },
        { name: "Cheese", nameAr: "جبن", price: 0.4 },
        { name: "Extra fries", nameAr: "بطاطس إضافية", price: 0.5 },
      ],
    },
    {
      category: 3,
      name: "Mixed Grill Platter",
      nameAr: "مشويات مشكلة",
      description: "Kebab, tikka and shish taouk with rice.",
      descriptionAr: "كباب وتكة وشيش طاووق مع رز",
      price: 4.5,
      allergens: ["gluten"],
    },
    {
      category: 4,
      name: "Kunafa Nabulsi",
      nameAr: "كنافة نابلسية",
      description: "Golden cheese kunafa, sugar syrup, pistachio.",
      descriptionAr: "كنافة بالجبن مع قطر وفستق",
      price: 1.6,
      allergens: ["dairy", "gluten", "nuts"],
    },
    {
      category: 4,
      name: "Lugaimat",
      nameAr: "لقيمات",
      description: "Crispy dumplings with date syrup & sesame.",
      descriptionAr: "لقيمات مقرمشة بدبس التمر والسمسم",
      price: 1.0,
      allergens: ["gluten"],
    },
  ];

  for (const p of products) {
    const productId = await ctx.db.insert("products", {
      projectId,
      categoryId: catIds[p.category],
      name: p.name,
      nameAr: p.nameAr,
      description: p.description,
      descriptionAr: p.descriptionAr,
      price: p.price,
      costPrice: Math.round(p.price * 0.5 * 1000) / 1000,
      allergens: p.allergens ?? [],
      isAvailable: true,
      isActive: true,
    });
    for (const a of p.addons ?? []) {
      await ctx.db.insert("addons", {
        projectId,
        productId,
        name: a.name,
        nameAr: a.nameAr,
        price: a.price,
        isActive: true,
      });
    }
  }
}
