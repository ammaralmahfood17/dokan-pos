/**
 * Dokan data layer — Supabase.
 *
 * Every function in this module maps a Convex-style API the UI already
 * consumes (`api.catalog.posCatalog`, `api.orders.createOrder`, ...) onto
 * Supabase (Postgres + RLS + Realtime). Row mappers convert snake_case
 * columns to the camelCase shapes the pages expect (`_id`, `nameAr`, ...).
 *
 * RLS in `supabase/migrations/0000_init.sql` scopes every query to the
 * signed-in user's project, so project_id is derived here from the user's
 * staff membership rather than passed from the client.
 */
import { supabase } from "./supabase";
import { notifyDataChanged } from "./realtime";

// ─── Types (mirrors the old Convex data model) ─────────────────────────────

export type Id<T extends string = string> = string;

export interface Project {
  _id: Id<"projects">;
  slug: string;
  name: string;
  nameAr?: string;
  currency: string;
  vatNumber?: string;
  vatRate: number;
  logoUrl?: string;
  isActive: boolean;
  defaultLanguage: string;
  _creationTime: number;
}

export interface Branch {
  _id: Id<"branches">;
  projectId: Id<"projects">;
  name: string;
  nameAr?: string;
  address?: string;
  phone?: string;
  isActive: boolean;
}

export interface TableRow {
  _id: Id<"tables">;
  branchId: Id<"branches">;
  projectId: Id<"projects">;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface Category {
  _id: Id<"categories">;
  projectId: Id<"projects">;
  name: string;
  nameAr: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  _id: Id<"products">;
  projectId: Id<"projects">;
  categoryId?: Id<"categories">;
  name: string;
  nameAr: string;
  description?: string;
  descriptionAr?: string;
  price: number;
  costPrice?: number;
  imageUrl?: string;
  allergens: string[];
  isAvailable: boolean;
  isActive: boolean;
}

export interface Addon {
  _id: Id<"addons">;
  projectId: Id<"projects">;
  productId: Id<"products">;
  name: string;
  nameAr: string;
  price: number;
  isActive: boolean;
}

export interface StaffMember {
  _id: Id<"staffMembers">;
  projectId: Id<"projects">;
  userId?: string;
  fullName: string;
  role: string;
  pinCode?: string;
  isActive: boolean;
}

export interface OrderItemAddon {
  _id: Id<"orderItemAddons">;
  orderItemId: Id<"orderItems">;
  addonId?: Id<"addons">;
  addonName: string;
  addonNameAr?: string;
  price: number;
}

export interface OrderItem {
  _id: Id<"orderItems">;
  orderId: Id<"orders">;
  productId?: Id<"products">;
  productName: string;
  productNameAr?: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  notes?: string;
  addons?: OrderItemAddon[];
}

export interface Order {
  _id: Id<"orders">;
  projectId: Id<"projects">;
  branchId?: Id<"branches">;
  tableId?: Id<"tables">;
  staffId?: Id<"staffMembers">;
  orderNumber: string;
  orderType: "dine-in" | "takeaway" | "delivery";
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  total: number;
  paymentMethod: "cash" | "benefitpay" | "card";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  customerPhone?: string;
  customerName?: string;
  notes?: string;
  source?: "pos" | "qr-menu";
  tableName?: string;
  items: OrderItem[];
  _creationTime: number;
}

export interface LoyaltyProgram {
  _id: Id<"loyaltyPrograms">;
  projectId: Id<"projects">;
  name: string;
  nameAr?: string;
  stampTarget: number;
  rewardName?: string;
  rewardNameAr?: string;
  active: boolean;
}

export interface LoyaltyStamp {
  _id: Id<"loyaltyStamps">;
  programId: Id<"loyaltyPrograms">;
  customerPhone: string;
  currentStamps: number;
  redeemedCount: number;
}

export interface Promotion {
  _id: Id<"promotions">;
  projectId: Id<"projects">;
  name: string;
  nameAr?: string;
  type: "percentage" | "fixed" | "bogo";
  value?: number;
  minOrderAmount?: number;
  active: boolean;
}

export interface Workspace {
  project: Project;
  branches: Branch[];
  tables: TableRow[];
  staff: StaffMember[];
}

export interface PosCatalog {
  categories: Category[];
  products: Product[];
  addonsByProduct: Record<string, Addon[]>;
}

export interface TodayStats {
  revenue: number;
  orderCount: number;
  paidCount: number;
  statusCounts: Record<string, number>;
  topItems: { name: string; qty: number; revenue: number }[];
}

export interface PublicMenu {
  project: Project;
  categories: Category[];
  products: Product[];
  addonsByProduct: Record<string, Addon[]>;
  /** Resolved table name for the QR table, when a tableSlug was provided. */
  tableName?: string;
}

// ─── Row helpers ───────────────────────────────────────────────────────────

const num = (v: unknown): number =>
  v == null ? 0 : typeof v === "number" ? v : Number(v);

const ts = (v: string | null | undefined): number => (v ? Date.parse(v) : 0);

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "dokan";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 2;
  for (;;) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${slugify(base)}-${n++}`;
  }
}

function mapProject(r: any): Project {
  return {
    _id: r.id,
    slug: r.slug,
    name: r.name,
    nameAr: r.name_ar ?? undefined,
    currency: r.currency ?? "BHD",
    vatNumber: r.vat_number ?? undefined,
    vatRate: num(r.vat_rate) || 0.1,
    logoUrl: r.logo_url ?? undefined,
    isActive: r.is_active,
    defaultLanguage: r.default_language ?? "en",
    _creationTime: ts(r.created_at),
  };
}

function mapBranch(r: any): Branch {
  return {
    _id: r.id,
    projectId: r.project_id,
    name: r.name,
    nameAr: r.name_ar ?? undefined,
    address: r.address ?? undefined,
    phone: r.phone ?? undefined,
    isActive: r.is_active,
  };
}

function mapTable(r: any): TableRow {
  return {
    _id: r.id,
    branchId: r.branch_id,
    projectId: r.project_id,
    name: r.name,
    slug: r.slug,
    isActive: r.is_active,
  };
}

function mapCategory(r: any): Category {
  return {
    _id: r.id,
    projectId: r.project_id,
    name: r.name,
    nameAr: r.name_ar,
    sortOrder: num(r.sort_order),
    isActive: r.is_active,
  };
}

function mapProduct(r: any): Product {
  return {
    _id: r.id,
    projectId: r.project_id,
    categoryId: r.category_id ?? undefined,
    name: r.name,
    nameAr: r.name_ar,
    description: r.description ?? undefined,
    descriptionAr: r.description_ar ?? undefined,
    price: num(r.price),
    costPrice: r.cost_price == null ? undefined : num(r.cost_price),
    imageUrl: r.image_url ?? undefined,
    allergens: r.allergens ?? [],
    isAvailable: r.is_available,
    isActive: r.is_active,
  };
}

function mapAddon(r: any): Addon {
  return {
    _id: r.id,
    projectId: r.project_id,
    productId: r.product_id,
    name: r.name,
    nameAr: r.name_ar,
    price: num(r.price),
    isActive: r.is_active,
  };
}

function mapStaff(r: any): StaffMember {
  return {
    _id: r.id,
    projectId: r.project_id,
    userId: r.user_id ?? undefined,
    fullName: r.full_name,
    role: r.role,
    pinCode: r.pin_code ?? undefined,
    isActive: r.is_active,
  };
}

function mapOrder(r: any): Order {
  return {
    _id: r.id,
    projectId: r.project_id,
    branchId: r.branch_id ?? undefined,
    tableId: r.table_id ?? undefined,
    staffId: r.staff_id ?? undefined,
    orderNumber: r.order_number,
    orderType: r.order_type,
    status: r.status,
    subtotal: num(r.subtotal),
    vatAmount: num(r.vat_amount),
    discountAmount: num(r.discount_amount),
    total: num(r.total),
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    customerPhone: r.customer_phone ?? undefined,
    customerName: r.customer_name ?? undefined,
    notes: r.notes ?? undefined,
    source: r.source ?? undefined,
    items: [],
    _creationTime: ts(r.created_at),
  };
}

function mapOrderItem(r: any, addons: OrderItemAddon[]): OrderItem {
  return {
    _id: r.id,
    orderId: r.order_id,
    productId: r.product_id ?? undefined,
    productName: r.product_name,
    productNameAr: r.product_name_ar ?? undefined,
    unitPrice: num(r.unit_price),
    quantity: num(r.quantity),
    totalPrice: num(r.total_price),
    notes: r.notes ?? undefined,
    addons,
  };
}

function mapItemAddon(r: any): OrderItemAddon {
  return {
    _id: r.id,
    orderItemId: r.order_item_id,
    addonId: r.addon_id ?? undefined,
    addonName: r.addon_name,
    addonNameAr: r.addon_name_ar ?? undefined,
    price: num(r.price),
  };
}

function mapProgram(r: any): LoyaltyProgram {
  return {
    _id: r.id,
    projectId: r.project_id,
    name: r.name,
    nameAr: r.name_ar ?? undefined,
    stampTarget: num(r.stamp_target) || 9,
    rewardName: r.reward_name ?? undefined,
    rewardNameAr: r.reward_name_ar ?? undefined,
    active: r.active,
  };
}

function mapStamp(r: any): LoyaltyStamp {
  return {
    _id: r.id,
    programId: r.program_id,
    customerPhone: r.customer_phone,
    currentStamps: num(r.current_stamps),
    redeemedCount: num(r.redeemed_count),
  };
}

function mapPromotion(r: any): Promotion {
  return {
    _id: r.id,
    projectId: r.project_id,
    name: r.name,
    nameAr: r.name_ar ?? undefined,
    type: r.type,
    value: r.value == null ? undefined : num(r.value),
    minOrderAmount: r.min_order_amount == null ? undefined : num(r.min_order_amount),
    active: r.active,
  };
}

// ─── Auth / membership helpers ─────────────────────────────────────────────

/** Project id for the signed-in user (their first active staff membership). */
async function getMyProjectId(): Promise<Id<"projects"> | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const membership = await supabase
    .from("staff_members")
    .select("project_id")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership.error) throw membership.error;
  return membership.data?.project_id ?? null;
}

async function getMyProjectIdRequired(): Promise<Id<"projects">> {
  const id = await getMyProjectId();
  if (!id) throw new Error("No workspace found — finish onboarding first.");
  return id;
}

async function fetchProject(projectId: Id<"projects">): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return mapProject(data);
}

// ─── Seed menu (ported from the Convex seedMenu) ───────────────────────────

const SEED_CATEGORIES: [string, string, number][] = [
  ["Coffee", "قهوة", 1],
  ["Breakfast", "فطور", 2],
  ["Mains", "أطباق رئيسية", 3],
  ["Desserts", "حلويات", 4],
  ["Drinks", "مشروبات", 5],
];

const SEED_PRODUCTS: {
  cat: number;
  name: string;
  nameAr: string;
  desc: string;
  descAr: string;
  price: number;
  allergens: string[];
  addons?: [string, string, number][];
}[] = [
  { cat: 0, name: "Arabic Coffee", nameAr: "قهوة عربية", desc: "Served with dates", descAr: "تقدم مع التمر", price: 0.8, allergens: [], addons: [["Cardamom extra", "هيل إضافي", 0.15]] },
  { cat: 0, name: "Karak Chai", nameAr: "كرك", desc: "Sweet spiced milk tea", descAr: "شاي حليب بالبهارات", price: 0.5, allergens: ["dairy"], addons: [["Oat milk", "حليب الشوفان", 0.3], ["Extra sugar", "سكر إضافي", 0.05]] },
  { cat: 0, name: "Espresso", nameAr: "إسبريسو", desc: "Double shot", descAr: "دبل شوت", price: 0.7, allergens: [] },
  { cat: 0, name: "Latte", nameAr: "لاتيه", desc: "With milk foam", descAr: "مع رغوة الحليب", price: 1.2, allergens: ["dairy"], addons: [["Oat milk", "حليب الشوفان", 0.3], ["Extra shot", "شوت إضافي", 0.4]] },
  { cat: 1, name: "Cheese Manakish", nameAr: "مناقيش جبنة", desc: "Flatbread with Akkawi cheese", descAr: "خبز بالجبنة العكاوي", price: 1.5, allergens: ["gluten", "dairy"] },
  { cat: 1, name: "Falafel Wrap", nameAr: "ساندويتش فلافل", desc: "With tahini & salad", descAr: "مع طحينة وسلطة", price: 1.0, allergens: ["gluten"] },
  { cat: 2, name: "Chicken Shawarma", nameAr: "شاورما دجاج", desc: "Garlic sauce, pickles", descAr: "ثوم ومخلل", price: 1.25, allergens: ["gluten"], addons: [["Extra garlic", "ثوم إضافي", 0.15], ["Cheese", "جبنة", 0.25]] },
  { cat: 2, name: "Mixed Grill", nameAr: "مشاوي مشكلة", desc: "Kebab & tikka with rice", descAr: "كباب وتكة مع رز", price: 4.5, allergens: [] },
  { cat: 2, name: "Seafood Machboos", nameAr: "مجبوس بحري", desc: "Spiced rice with shrimp", descAr: "رز مبهّر مع روبيان", price: 4.0, allergens: ["spicy"] },
  { cat: 3, name: "Kunafa", nameAr: "كنافة", desc: "Crispy pastry with cheese", descAr: "عجينة مقرمشة مع الجبنة", price: 1.75, allergens: ["gluten", "dairy"] },
  { cat: 3, name: "Umm Ali", nameAr: "أم علي", desc: "Warm bread pudding", descAr: "حلوى الخبز الدافئة", price: 1.5, allergens: ["gluten", "dairy", "nuts"] },
  { cat: 4, name: "Fresh Orange Juice", nameAr: "عصير برتقال طازج", desc: "No added sugar", descAr: "بدون سكر مضاف", price: 1.0, allergens: [] },
  { cat: 4, name: "Saffron Milk", nameAr: "حليب زعفران", desc: "Warm, lightly sweetened", descAr: "دافئ محلى بخفة", price: 1.1, allergens: ["dairy"] },
];

async function seedMenu(projectId: Id<"projects">): Promise<void> {
  const categoryIds: string[] = [];
  for (const [name, nameAr, order] of SEED_CATEGORIES) {
    const { data, error } = await supabase
      .from("categories")
      .insert({ project_id: projectId, name, name_ar: nameAr, sort_order: order })
      .select("id")
      .single();
    if (error) throw error;
    categoryIds.push(data.id);
  }

  for (const p of SEED_PRODUCTS) {
    const { data: product, error } = await supabase
      .from("products")
      .insert({
        project_id: projectId,
        category_id: categoryIds[p.cat],
        name: p.name,
        name_ar: p.nameAr,
        description: p.desc,
        description_ar: p.descAr,
        price: p.price,
        allergens: p.allergens,
        is_available: true,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw error;

    for (const [addonName, addonNameAr, addonPrice] of p.addons ?? []) {
      const { error: aErr } = await supabase.from("addons").insert({
        project_id: projectId,
        product_id: product.id,
        name: addonName,
        name_ar: addonNameAr,
        price: addonPrice,
        is_active: true,
      });
      if (aErr) throw aErr;
    }
  }
}

// ─── The API surface (mirrors the old Convex `api`) ────────────────────────

export const api = {
  projects: {
    /** The signed-in user's workspace, `null` when they have no project yet. */
    myWorkspace: async (): Promise<Workspace | null> => {
      const projectId = await getMyProjectId();
      if (!projectId) return null;
      const { data: project, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      if (!project) return null;

      const [branches, tables, staff] = await Promise.all([
        supabase.from("branches").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("tables").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("staff_members").select("*").eq("project_id", projectId).order("created_at"),
      ]);
      if (branches.error) throw branches.error;
      if (tables.error) throw tables.error;
      if (staff.error) throw staff.error;

      return {
        project: mapProject(project),
        branches: (branches.data ?? []).map(mapBranch),
        tables: (tables.data ?? []).map(mapTable),
        staff: (staff.data ?? []).map(mapStaff),
      };
    },

    /** Create the tenant project + owner staff row + first branch + tables (+ demo menu). */
    createProject: async (args: {
      name: string;
      nameAr?: string;
      branchName?: string;
      branchNameAr?: string;
      tableNames?: string[];
      seedDemoData?: boolean;
    }): Promise<Project> => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Not signed in.");

      const projectId = crypto.randomUUID();
      const { error: pErr } = await supabase.from("projects").insert({
        id: projectId,
        slug: await uniqueSlug(args.name),
        name: args.name,
        name_ar: args.nameAr ?? null,
        currency: "BHD",
        vat_rate: 0.1,
        default_language: "en",
      });
      if (pErr) throw pErr;

      const { error: sErr } = await supabase.from("staff_members").insert({
        project_id: projectId,
        user_id: authData.user.id,
        full_name: authData.user.email ?? "Owner",
        role: "owner",
        is_active: true,
      });
      if (sErr) throw sErr;

      const branchId = crypto.randomUUID();
      const { error: bErr } = await supabase.from("branches").insert({
        id: branchId,
        project_id: projectId,
        name: args.branchName || "Main Branch",
        name_ar: args.branchNameAr ?? null,
      });
      if (bErr) throw bErr;

      const tableRows = (args.tableNames ?? [])
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name, i) => ({
          id: crypto.randomUUID(),
          project_id: projectId,
          branch_id: branchId,
          name,
          slug: `${slugify(name)}-${i + 1}`,
        }));
      if (tableRows.length > 0) {
        const { error: tErr } = await supabase.from("tables").insert(tableRows);
        if (tErr) throw tErr;
      }

      if (args.seedDemoData) await seedMenu(projectId);

      notifyDataChanged();
      return fetchProject(projectId);
    },

    updateProject: async (args: {
      name?: string;
      nameAr?: string;
      vatRate?: number;
      vatNumber?: string;
      currency?: string;
    }): Promise<void> => {
      const projectId = await getMyProjectIdRequired();
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.nameAr !== undefined) patch.name_ar = args.nameAr;
      if (args.vatRate !== undefined) patch.vat_rate = args.vatRate;
      if (args.vatNumber !== undefined) patch.vat_number = args.vatNumber;
      if (args.currency !== undefined) patch.currency = args.currency;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
      if (error) throw error;
      notifyDataChanged();
    },
  },

  catalog: {
    posCatalog: async (): Promise<PosCatalog> => {
      const projectId = await getMyProjectId();
      if (!projectId) return { categories: [], products: [], addonsByProduct: {} };

      const [categories, products, addons] = await Promise.all([
        supabase.from("categories").select("*").eq("project_id", projectId).order("sort_order"),
        supabase.from("products").select("*").eq("project_id", projectId).order("name"),
        supabase.from("addons").select("*").eq("project_id", projectId),
      ]);
      if (categories.error) throw categories.error;
      if (products.error) throw products.error;
      if (addons.error) throw addons.error;

      const addonsByProduct: Record<string, Addon[]> = {};
      for (const a of (addons.data ?? []).map(mapAddon)) {
        if (!a.isActive) continue;
        (addonsByProduct[a.productId] ??= []).push(a);
      }

      return {
        categories: (categories.data ?? [])
          .map(mapCategory)
          .filter((c) => c.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder),
        products: (products.data ?? []).map(mapProduct).filter((p) => p.isActive),
        addonsByProduct,
      };
    },

    createCategory: async (args: { name: string; nameAr: string; sortOrder?: number }) => {
      const projectId = await getMyProjectIdRequired();
      const { error } = await supabase.from("categories").insert({
        project_id: projectId,
        name: args.name,
        name_ar: args.nameAr,
        sort_order: num(args.sortOrder),
        is_active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    updateCategory: async (args: { id: Id<"categories">; name?: string; nameAr?: string; sortOrder?: number }) => {
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.nameAr !== undefined) patch.name_ar = args.nameAr;
      if (args.sortOrder !== undefined) patch.sort_order = args.sortOrder;
      const { error } = await supabase.from("categories").update(patch).eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    deleteCategory: async (args: { id: Id<"categories"> }) => {
      const { error } = await supabase.from("categories").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    createProduct: async (args: any) => {
      const projectId = await getMyProjectIdRequired();
      const { error } = await supabase.from("products").insert({
        project_id: projectId,
        category_id: args.categoryId || null,
        name: args.name,
        name_ar: args.nameAr,
        description: args.description ?? null,
        description_ar: args.descriptionAr ?? null,
        price: num(args.price),
        allergens: args.allergens ?? [],
        is_available: args.isAvailable ?? true,
        is_active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    updateProduct: async (args: any) => {
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.nameAr !== undefined) patch.name_ar = args.nameAr;
      if (args.categoryId !== undefined) patch.category_id = args.categoryId || null;
      if (args.description !== undefined) patch.description = args.description;
      if (args.descriptionAr !== undefined) patch.description_ar = args.descriptionAr;
      if (args.price !== undefined) patch.price = num(args.price);
      if (args.allergens !== undefined) patch.allergens = args.allergens;
      if (args.isAvailable !== undefined) patch.is_available = args.isAvailable;
      const { error } = await supabase.from("products").update(patch).eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    deleteProduct: async (args: { id: Id<"products"> }) => {
      const { error } = await supabase.from("products").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },
  },

  operations: {
    createBranch: async (args: { name: string; nameAr?: string; address?: string; phone?: string }) => {
      const projectId = await getMyProjectIdRequired();
      const { error } = await supabase.from("branches").insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        name: args.name,
        name_ar: args.nameAr ?? null,
        address: args.address ?? null,
        phone: args.phone ?? null,
        is_active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    deleteBranch: async (args: { id: Id<"branches"> }) => {
      const { error } = await supabase.from("branches").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    createTable: async (args: { branchId: Id<"branches">; name: string }) => {
      const projectId = await getMyProjectIdRequired();
      const { data: existing } = await supabase
        .from("tables")
        .select("slug")
        .eq("branch_id", args.branchId)
        .order("created_at", { ascending: false })
        .limit(1);
      const n = (existing?.length ?? 0) + 1;
      const { error } = await supabase.from("tables").insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        branch_id: args.branchId,
        name: args.name,
        slug: `${slugify(args.name)}-${n}`,
        is_active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    deleteTable: async (args: { id: Id<"tables"> }) => {
      const { error } = await supabase.from("tables").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    /** Tables with live occupancy — driven by open (pending/preparing) orders. */
    tablesWithStatus: async () => {
      const projectId = await getMyProjectId();
      if (!projectId) return [];

      const [tables, open] = await Promise.all([
        supabase.from("tables").select("*").eq("project_id", projectId).order("name"),
        supabase
          .from("orders")
          .select("table_id, order_number, total")
          .eq("project_id", projectId)
          .in("status", ["pending", "preparing"])
          .not("table_id", "is", null),
      ]);
      if (tables.error) throw tables.error;
      if (open.error) throw open.error;

      const byTable = new Map<string, { activeOrders: string[]; activeTotal: number }>();
      for (const o of open.data ?? []) {
        const cur = byTable.get(o.table_id) ?? { activeOrders: [], activeTotal: 0 };
        cur.activeOrders.push(o.order_number);
        cur.activeTotal += num(o.total);
        byTable.set(o.table_id, cur);
      }

      return (tables.data ?? []).map((t) => {
        const s = byTable.get(t.id);
        return {
          _id: t.id,
          branchId: t.branch_id,
          name: t.name,
          slug: t.slug,
          isActive: t.is_active,
          occupied: Boolean(s),
          activeOrders: s?.activeOrders ?? [],
          activeTotal: s?.activeTotal ?? 0,
        };
      });
    },

    /** Find an active staff member by 4-digit PIN within the workspace. */
    getStaffByPin: async (args: { pinCode: string }): Promise<StaffMember | null> => {
      const projectId = await getMyProjectId();
      if (!projectId || !args?.pinCode) return null;
      const { data, error } = await supabase
        .from("staff_members")
        .select("*")
        .eq("project_id", projectId)
        .eq("pin_code", String(args.pinCode))
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStaff(data) : null;
    },

    createStaff: async (args: { fullName: string; role: string; pinCode?: string }) => {
      const projectId = await getMyProjectIdRequired();
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase.from("staff_members").insert({
        project_id: projectId,
        user_id: args.role === "owner" ? authData.user?.id ?? null : null,
        full_name: args.fullName,
        role: args.role,
        pin_code: args.pinCode || null,
        is_active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },
  },

  orders: {
    listOrders: async (): Promise<Order[]> => {
      const projectId = await getMyProjectId();
      if (!projectId) return [];

      const { data: rows, error } = await supabase
        .from("orders")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const orders = rows ?? [];
      if (orders.length === 0) return [];

      // Table names
      const tableIds = [...new Set(orders.map((o) => o.table_id).filter(Boolean))] as string[];
      const tablesById = new Map<string, string>();
      if (tableIds.length > 0) {
        const { data: trows } = await supabase.from("tables").select("id, name").in("id", tableIds);
        (trows ?? []).forEach((t) => tablesById.set(t.id, t.name));
      }

      // Items + addons
      const orderIds = orders.map((o) => o.id);
      const itemsByOrder = new Map<string, OrderItem[]>();
      const { data: irows } = await supabase.from("order_items").select("*").in("order_id", orderIds);
      const itemIds = (irows ?? []).map((i) => i.id);
      const addonsByItem = new Map<string, OrderItemAddon[]>();
      if (itemIds.length > 0) {
        const { data: arows } = await supabase
          .from("order_item_addons")
          .select("*")
          .in("order_item_id", itemIds);
        (arows ?? []).forEach((a) => {
          (addonsByItem.get(a.order_item_id) ?? addonsByItem.set(a.order_item_id, []).get(a.order_item_id)!).push(mapItemAddon(a));
        });
      }
      (irows ?? []).forEach((i) => {
        (itemsByOrder.get(i.order_id) ?? itemsByOrder.set(i.order_id, []).get(i.order_id)!).push(
          mapOrderItem(i, addonsByItem.get(i.id) ?? []),
        );
      });

      return orders.map((o) => ({
        ...mapOrder(o),
        tableName: o.table_id ? tablesById.get(o.table_id) ?? undefined : undefined,
        items: itemsByOrder.get(o.id) ?? [],
      }));
    },

    createOrder: async (args: any): Promise<{ orderNumber: string }> => {
      const projectId = await getMyProjectIdRequired();
      const project = await fetchProject(projectId);

      // Server-authoritative totals (mirrors the Convex computation)
      let subtotal = 0;
      const items = (args.items ?? []).map((i: any) => {
        const addonTotal = (i.addons ?? []).reduce((s: number, a: any) => s + num(a.price), 0);
        const line = (num(i.unitPrice) + addonTotal) * num(i.quantity);
        subtotal += line;
        return { ...i, line };
      });
      const discount = num(args.discountAmount) || 0;
      const vat = Math.max(0, (subtotal - discount) * (num(project.vatRate) || 0.1));
      const total = Math.max(0, subtotal - discount + vat);

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          id: crypto.randomUUID(),
          project_id: projectId,
          order_type: args.orderType ?? "dine-in",
          table_id: args.tableId ?? null,
          staff_id: args.staffId ?? null,
          payment_method: args.paymentMethod ?? "cash",
          payment_status: args.paymentStatus ?? "pending",
          customer_name: args.customerName ?? null,
          customer_phone: args.customerPhone ?? null,
          subtotal: round3(subtotal),
          vat_amount: round3(vat),
          discount_amount: round3(discount),
          total: round3(total),
          idempotency_key: crypto.randomUUID(),
          source: "pos",
        })
        .select("id, order_number")
        .single();
      if (error) throw error;

      const itemRows = items.map((i: any) => ({
        order_id: order.id,
        product_id: i.productId ?? null,
        product_name: i.name,
        product_name_ar: i.nameAr ?? null,
        unit_price: round3(num(i.unitPrice)),
        quantity: num(i.quantity),
        total_price: round3(i.line),
        notes: i.notes ?? null,
      }));
      const { data: insertedItems, error: itemsError } = await supabase
        .from("order_items")
        .insert(itemRows)
        .select("id");
      if (itemsError) throw itemsError;

      const addonRows: Record<string, unknown>[] = [];
      items.forEach((i: any, idx: number) => {
        for (const a of i.addons ?? []) {
          addonRows.push({
            order_item_id: insertedItems[idx].id,
            addon_id: a.addonId ?? null,
            addon_name: a.name,
            addon_name_ar: a.nameAr ?? null,
            price: round3(num(a.price)),
          });
        }
      });
      if (addonRows.length > 0) {
        const { error: aErr } = await supabase.from("order_item_addons").insert(addonRows);
        if (aErr) throw aErr;
      }

      notifyDataChanged();
      return { orderNumber: order.order_number };
    },

    updateOrderStatus: async (args: { orderId: Id<"orders">; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: args.status })
        .eq("id", args.orderId);
      if (error) throw error;
      notifyDataChanged();
    },

    payOrder: async (args: { orderId: Id<"orders"> }) => {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", args.orderId);
      if (error) throw error;
      notifyDataChanged();
    },
  },

  dashboard: {
    todayStats: async (): Promise<TodayStats> => {
      const projectId = await getMyProjectId();
      if (!projectId) {
        return { revenue: 0, orderCount: 0, paidCount: 0, statusCounts: {}, topItems: [] };
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, status, payment_status, total, created_at")
        .eq("project_id", projectId)
        .gte("created_at", start.toISOString())
        .limit(500);
      if (error) throw error;
      const list = orders ?? [];

      const revenue = list
        .filter((o) => o.payment_status === "paid")
        .reduce((s, o) => s + num(o.total), 0);

      const statusCounts: Record<string, number> = {};
      for (const o of list) {
        statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      }

      let topItems: { name: string; qty: number; revenue: number }[] = [];
      const ids = list.map((o) => o.id);
      if (ids.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("product_name, quantity, total_price")
          .in("order_id", ids);
        const agg = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const i of items ?? []) {
          const cur = agg.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0 };
          cur.qty += num(i.quantity);
          cur.revenue += num(i.total_price);
          agg.set(i.product_name, cur);
        }
        topItems = [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
      }

      return {
        revenue,
        orderCount: list.length,
        paidCount: list.filter((o) => o.payment_status === "paid").length,
        statusCounts,
        topItems,
      };
    },
  },

  programs: {
    listLoyaltyPrograms: async (): Promise<LoyaltyProgram[]> => {
      const projectId = await getMyProjectId();
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("loyalty_programs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapProgram);
    },

    listLoyaltyStamps: async (args: any): Promise<LoyaltyStamp[] | undefined> => {
      if (args === "skip" || !args?.programId) return undefined;
      const { data, error } = await supabase
        .from("loyalty_stamps")
        .select("*")
        .eq("program_id", args.programId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapStamp);
    },

    listPromotions: async (): Promise<Promotion[]> => {
      const projectId = await getMyProjectId();
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapPromotion);
    },

    createPromotion: async (args: {
      name: string;
      nameAr?: string;
      type: string;
      value?: number;
      minOrderAmount?: number;
    }) => {
      const projectId = await getMyProjectIdRequired();
      const { error } = await supabase.from("promotions").insert({
        project_id: projectId,
        name: args.name,
        name_ar: args.nameAr ?? null,
        type: args.type,
        value: args.value ?? null,
        min_order_amount: args.minOrderAmount ?? null,
        active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    deletePromotion: async (args: { id: Id<"promotions"> }) => {
      const { error } = await supabase.from("promotions").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },
  },

  public: {
    /** Bilingual menu for the QR experience (anon reads via RLS). */
    getPublicMenu: async (args: any): Promise<PublicMenu | null | undefined> => {
      if (args === "skip" || !args?.projectSlug) return undefined;

      const { data: project, error: pErr } = await supabase
        .from("projects")
        .select("*")
        .eq("slug", args.projectSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!project) return null;

      // Resolve the QR table name so the header can show "Table 4" instead of
      // the raw slug from the URL.
      let tableName: string | undefined;
      if (args.tableSlug) {
        const { data: table } = await supabase
          .from("tables")
          .select("name")
          .eq("project_id", project.id)
          .eq("slug", args.tableSlug)
          .eq("is_active", true)
          .maybeSingle();
        tableName = table?.name ?? undefined;
      }

      const [categories, products, addons] = await Promise.all([
        supabase.from("categories").select("*").eq("project_id", project.id).order("sort_order"),
        supabase.from("products").select("*").eq("project_id", project.id).order("name"),
        supabase.from("addons").select("*").eq("project_id", project.id),
      ]);
      if (categories.error) throw categories.error;
      if (products.error) throw products.error;
      if (addons.error) throw addons.error;

      const addonsByProduct: Record<string, Addon[]> = {};
      for (const a of (addons.data ?? []).map(mapAddon)) {
        if (!a.isActive) continue;
        (addonsByProduct[a.productId] ??= []).push(a);
      }

      return {
        project: mapProject(project),
        categories: (categories.data ?? [])
          .map(mapCategory)
          .filter((c) => c.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder),
        products: (products.data ?? []).map(mapProduct).filter((p) => p.isActive),
        addonsByProduct,
        tableName,
      };
    },

    /** Place an order from the QR menu as an anonymous guest. */
    createPublicOrder: async (args: {
      projectSlug: string;
      tableSlug: string;
      customerName?: string;
      customerPhone?: string;
      items: any[];
    }): Promise<{ orderNumber: string }> => {
      const { data: project } = await supabase
        .from("projects")
        .select("*")
        .eq("slug", args.projectSlug)
        .eq("is_active", true)
        .single();
      if (!project) throw new Error("Menu not found.");

      const { data: table, error: tErr } = await supabase
        .from("tables")
        .select("id")
        .eq("project_id", project.id)
        .eq("slug", args.tableSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!table) throw new Error("Table not found.");

      let subtotal = 0;
      const items = (args.items ?? []).map((i: any) => {
        const addonTotal = (i.addons ?? []).reduce((s: number, a: any) => s + num(a.price), 0);
        const line = (num(i.unitPrice) + addonTotal) * num(i.quantity);
        subtotal += line;
        return { ...i, line };
      });
      const vat = Math.max(0, subtotal * (num(project.vat_rate) || 0.1));
      const total = subtotal + vat;

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          id: crypto.randomUUID(),
          project_id: project.id,
          table_id: table.id,
          order_type: "dine-in",
          status: "pending",
          payment_method: "cash",
          payment_status: "pending",
          customer_name: args.customerName ?? null,
          customer_phone: args.customerPhone ?? null,
          subtotal: round3(subtotal),
          vat_amount: round3(vat),
          discount_amount: 0,
          total: round3(total),
          idempotency_key: crypto.randomUUID(),
          source: "qr-menu",
        })
        .select("id, order_number")
        .single();
      if (error) throw error;

      const itemRows = items.map((i: any) => ({
        order_id: order.id,
        product_id: i.productId ?? null,
        product_name: i.name,
        product_name_ar: i.nameAr ?? null,
        unit_price: round3(num(i.unitPrice)),
        quantity: num(i.quantity),
        total_price: round3(i.line),
      }));
      const { data: insertedItems, error: itemsError } = await supabase
        .from("order_items")
        .insert(itemRows)
        .select("id");
      if (itemsError) throw itemsError;

      const addonRows: Record<string, unknown>[] = [];
      items.forEach((i: any, idx: number) => {
        for (const a of i.addons ?? []) {
          addonRows.push({
            order_item_id: insertedItems[idx].id,
            addon_id: a.addonId ?? null,
            addon_name: a.name,
            addon_name_ar: a.nameAr ?? null,
            price: round3(num(a.price)),
          });
        }
      });
      if (addonRows.length > 0) {
        const { error: aErr } = await supabase.from("order_item_addons").insert(addonRows);
        if (aErr) throw aErr;
      }

      notifyDataChanged();
      return { orderNumber: order.order_number };
    },
  },
};
