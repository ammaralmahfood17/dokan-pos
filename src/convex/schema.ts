import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ---------------------------------------------------------------------------
// Dokan — multi-tenant POS & QR-menu for restaurants in Bahrain & the Gulf
// ---------------------------------------------------------------------------

export const STAFF_ROLES = {
  OWNER: "owner",
  MANAGER: "manager",
  CASHIER: "cashier",
  KITCHEN: "kitchen",
} as const;

export const staffRoleValidator = v.union(
  v.literal(STAFF_ROLES.OWNER),
  v.literal(STAFF_ROLES.MANAGER),
  v.literal(STAFF_ROLES.CASHIER),
  v.literal(STAFF_ROLES.KITCHEN),
);
export type StaffRole = Infer<typeof staffRoleValidator>;

export const ORDER_TYPES = {
  DINE_IN: "dine-in",
  TAKEAWAY: "takeaway",
  DELIVERY: "delivery",
} as const;
export const orderTypeValidator = v.union(
  v.literal(ORDER_TYPES.DINE_IN),
  v.literal(ORDER_TYPES.TAKEAWAY),
  v.literal(ORDER_TYPES.DELIVERY),
);
export type OrderType = Infer<typeof orderTypeValidator>;

export const ORDER_STATUSES = {
  PENDING: "pending",
  PREPARING: "preparing",
  READY: "ready",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;
export const orderStatusValidator = v.union(
  v.literal(ORDER_STATUSES.PENDING),
  v.literal(ORDER_STATUSES.PREPARING),
  v.literal(ORDER_STATUSES.READY),
  v.literal(ORDER_STATUSES.DELIVERED),
  v.literal(ORDER_STATUSES.CANCELLED),
);
export type OrderStatus = Infer<typeof orderStatusValidator>;

export const PAYMENT_METHODS = {
  CASH: "cash",
  BENEFITPAY: "benefitpay",
  CARD: "card",
} as const;
export const paymentMethodValidator = v.union(
  v.literal(PAYMENT_METHODS.CASH),
  v.literal(PAYMENT_METHODS.BENEFITPAY),
  v.literal(PAYMENT_METHODS.CARD),
);
export type PaymentMethod = Infer<typeof paymentMethodValidator>;

export const PAYMENT_STATUSES = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;
export const paymentStatusValidator = v.union(
  v.literal(PAYMENT_STATUSES.PENDING),
  v.literal(PAYMENT_STATUSES.PAID),
  v.literal(PAYMENT_STATUSES.FAILED),
  v.literal(PAYMENT_STATUSES.REFUNDED),
);
export type PaymentStatus = Infer<typeof paymentStatusValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // -----------------------------------------------------------------------
    // Tenants — one "project" is one restaurant / café / food truck
    // -----------------------------------------------------------------------

    projects: defineTable({
      slug: v.string(),
      name: v.string(),
      nameAr: v.optional(v.string()),
      currency: v.string(), // e.g. "BHD"
      vatNumber: v.optional(v.string()), // TRN
      vatRate: v.number(), // e.g. 0.10
      logoUrl: v.optional(v.string()),
      isActive: v.boolean(),
      subscriptionStatus: v.string(), // trial / active
      defaultLanguage: v.optional(v.union(v.literal("en"), v.literal("ar"))),
    })
      .index("by_slug", ["slug"])
      .index("by_owner", ["isActive"]),

    staffMembers: defineTable({
      projectId: v.id("projects"),
      userId: v.optional(v.id("users")), // linked auth user (owner) — optional for demo staff
      fullName: v.string(),
      role: staffRoleValidator,
      pinCode: v.optional(v.string()), // 4-digit quick login
      isActive: v.boolean(),
    })
      .index("by_project", ["projectId"])
      .index("by_user", ["userId"]),

    branches: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      nameAr: v.optional(v.string()),
      address: v.optional(v.string()),
      phone: v.optional(v.string()),
      isActive: v.boolean(),
    }).index("by_project", ["projectId"]),

    tables: defineTable({
      projectId: v.id("projects"),
      branchId: v.id("branches"),
      name: v.string(),
      slug: v.string(), // url-safe, unique per project
      isActive: v.boolean(),
    })
      .index("by_project", ["projectId"])
      .index("by_branch", ["branchId"])
      .index("by_slug", ["projectId", "slug"]),

    // -----------------------------------------------------------------------
    // Catalog
    // -----------------------------------------------------------------------

    categories: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      nameAr: v.string(),
      sortOrder: v.number(),
      isActive: v.boolean(),
    }).index("by_project", ["projectId"]),

    products: defineTable({
      projectId: v.id("projects"),
      categoryId: v.optional(v.id("categories")),
      name: v.string(),
      nameAr: v.string(),
      description: v.optional(v.string()),
      descriptionAr: v.optional(v.string()),
      price: v.number(),
      costPrice: v.optional(v.number()),
      imageUrl: v.optional(v.string()),
      allergens: v.array(v.string()), // dairy, gluten, nuts, eggs, spicy
      isAvailable: v.boolean(),
      isActive: v.boolean(),
    })
      .index("by_project", ["projectId"])
      .index("by_category", ["categoryId"]),

    addons: defineTable({
      projectId: v.id("projects"),
      productId: v.id("products"),
      name: v.string(),
      nameAr: v.string(),
      price: v.number(),
      isActive: v.boolean(),
    })
      .index("by_project", ["projectId"])
      .index("by_product", ["productId"]),

    // -----------------------------------------------------------------------
    // Orders
    // -----------------------------------------------------------------------

    orders: defineTable({
      projectId: v.id("projects"),
      branchId: v.optional(v.id("branches")),
      tableId: v.optional(v.id("tables")),
      staffId: v.optional(v.id("staffMembers")),
      orderNumber: v.string(), // "#0001"
      orderType: orderTypeValidator,
      status: orderStatusValidator,
      subtotal: v.number(),
      vatAmount: v.number(),
      discountAmount: v.number(),
      total: v.number(),
      paymentMethod: paymentMethodValidator,
      paymentStatus: paymentStatusValidator,
      customerPhone: v.optional(v.string()),
      customerName: v.optional(v.string()),
      notes: v.optional(v.string()),
      idempotencyKey: v.optional(v.string()),
      source: v.optional(v.union(v.literal("pos"), v.literal("qr-menu"))),
    })
      .index("by_project", ["projectId"])
      .index("by_project_status", ["projectId", "status"])
      .index("by_idempotency", ["idempotencyKey"]),

    orderItems: defineTable({
      orderId: v.id("orders"),
      productId: v.optional(v.id("products")),
      productName: v.string(),
      productNameAr: v.optional(v.string()),
      unitPrice: v.number(),
      quantity: v.number(),
      totalPrice: v.number(),
      notes: v.optional(v.string()),
    }).index("by_order", ["orderId"]),

    orderItemAddons: defineTable({
      orderItemId: v.id("orderItems"),
      addonId: v.optional(v.id("addons")),
      addonName: v.string(),
      addonNameAr: v.optional(v.string()),
      price: v.number(),
    }).index("by_order_item", ["orderItemId"]),

    // -----------------------------------------------------------------------
    // Loyalty & Promotions
    // -----------------------------------------------------------------------

    loyaltyPrograms: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      nameAr: v.optional(v.string()),
      stampTarget: v.number(), // e.g. 9
      rewardName: v.optional(v.string()),
      rewardNameAr: v.optional(v.string()),
      active: v.boolean(),
    }).index("by_project", ["projectId"]),

    loyaltyStamps: defineTable({
      programId: v.id("loyaltyPrograms"),
      customerPhone: v.string(),
      currentStamps: v.number(),
      redeemedCount: v.number(),
    }).index("by_program", ["programId", "customerPhone"]),

    promotions: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      nameAr: v.optional(v.string()),
      type: v.union(v.literal("percentage"), v.literal("fixed"), v.literal("bogo")),
      value: v.optional(v.number()),
      minOrderAmount: v.optional(v.number()),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      active: v.boolean(),
    }).index("by_project", ["projectId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
