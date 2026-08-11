/**
 * Dokan data layer — Supabase.
 *
 * Every function maps a Convex-style API the UI consumes
 * (`api.catalog.posCatalog`, `api.orders.createOrder`, ...) onto Supabase
 * (Postgres + RLS + Realtime). Row mappers convert snake_case columns to the
 * camelCase shapes the pages expect (`_id`, `nameAr`, ...).
 *
 * RLS in `supabase/migrations/0000_init.sql` (hardened by 0001/0002) scopes
 * every query to the signed-in user's project, so project_id is derived here
 * from the user's staff membership rather than passed from the client.
 *
 * SECURITY MODEL (post-hardening):
 *  - Tenant + owner-staff creation happens in the security-definer RPC
 *    `create_project_with_owner` — never via client table inserts.
 *  - Order creation happens in the security-definer RPC `create_order`,
 *    which re-validates every price against products/addons, computes
 *    subtotal/VAT/total server-side, and inserts order + items + addons
 *    atomically. Client-supplied prices are ignored.
 *  - PIN login uses the security-definer RPC `verify_staff_pin` (bcrypt
 *    hash checked server-side); PIN hashes are never returned to the client.
 *  - The public QR menu reads through the narrow `public_menu_by_slug` RPC
 *    (no cost_price / vat_number / subscription_status) instead of direct
 *    anonymous table SELECTs.
 */
import { supabase } from "./supabase";
import { notifyDataChanged } from "./realtime";

// ─── Types (mirrors the old Convex data model) ─────────────────────────────

/** A table-scoped id (phantom-branded string; same runtime shape). */
export type Id<T extends string = string> = string & { __table?: T };

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
  /** Tenant configuration merged into the projects.metadata jsonb column. */
  metadata?: Record<string, unknown>;
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

export interface TableWithStatus extends TableRow {
  occupied: boolean;
  activeOrders: string[];
  activeTotal: number;
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
  /** Whether a PIN is set — the PIN itself is never exposed. */
  hasPin?: boolean;
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
  /** Resolved table id — used by "Call Waiter" (waiter_calls). */
  tableId?: string;
}

// ─── Input types for mutations ─────────────────────────────────────────────

export interface CartAddonArg {
  addonId?: string;
  name: string;
  nameAr?: string;
  price: number;
}

export interface CartItemArg {
  productId?: string;
  name: string;
  nameAr?: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  addons?: CartAddonArg[];
}

export interface CreateOrderArgs {
  orderType?: "dine-in" | "takeaway" | "delivery";
  paymentMethod?: "cash" | "benefitpay" | "card";
  paymentStatus?: "paid" | "pending";
  staffId?: string;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  discountAmount?: number;
  items?: CartItemArg[];
  /**
   * Generated once at submit time and reused unchanged on every retry of the
   * same order (offline queue replay, network retry). The server enforces
   * uniqueness per project so a retry can never duplicate an order.
   */
  idempotencyKey?: string;
}

export interface ProductInput {
  id?: string;
  name?: string;
  nameAr?: string;
  categoryId?: string;
  description?: string;
  descriptionAr?: string;
  price?: number | string;
  allergens?: string[];
  isAvailable?: boolean;
}

// ─── DB row shapes (Supabase REST returns these untyped) ───────────────────

interface DbProject {
  id: string; slug: string; name: string; name_ar: string | null;
  currency: string | null; vat_number: string | null; vat_rate: string | number | null;
  logo_url: string | null; is_active: boolean; default_language: string | null;
  metadata: Record<string, unknown> | null; created_at: string; updated_at: string | null;
}
interface DbBranch {
  id: string; project_id: string; name: string; name_ar: string | null;
  address: string | null; phone: string | null; is_active: boolean; created_at: string;
}
interface DbTable {
  id: string; branch_id: string | null; project_id: string; name: string;
  slug: string; is_active: boolean; created_at: string;
}
interface DbCategory {
  id: string; project_id: string; name: string; name_ar: string;
  sort_order: number | null; is_active: boolean; created_at: string;
}
interface DbProduct {
  id: string; project_id: string; category_id: string | null; name: string; name_ar: string;
  description: string | null; description_ar: string | null; price: string | number;
  cost_price: string | number | null; image_url: string | null; allergens: string[] | null;
  is_available: boolean; is_active: boolean; created_at: string;
}
interface DbAddon {
  id: string; project_id: string; product_id: string; name: string; name_ar: string;
  price: string | number; is_active: boolean; created_at: string;
}
interface DbStaff {
  id: string; project_id: string; user_id: string | null; full_name: string;
  role: string; is_active: boolean; created_at: string; has_pin: boolean;
}
interface DbOrder {
  id: string; project_id: string; branch_id: string | null; table_id: string | null;
  staff_id: string | null; order_number: string; order_type: string; status: string;
  subtotal: string | number; vat_amount: string | number; discount_amount: string | number;
  total: string | number; payment_method: string; payment_status: string;
  customer_phone: string | null; customer_name: string | null; notes: string | null;
  idempotency_key: string | null; source: string | null; created_at: string;
  updated_at: string | null;
}
interface DbOrderItem {
  id: string; order_id: string; product_id: string | null; product_name: string;
  product_name_ar: string | null; unit_price: string | number; quantity: number;
  total_price: string | number; notes: string | null; created_at: string;
}
interface DbOrderItemAddon {
  id: string; order_item_id: string; addon_id: string | null; addon_name: string;
  addon_name_ar: string | null; price: string | number; created_at: string;
}
interface DbLoyaltyProgram {
  id: string; project_id: string; name: string; name_ar: string | null;
  stamp_target: number | null; reward_name: string | null; reward_name_ar: string | null;
  active: boolean; created_at: string;
}
interface DbLoyaltyStamp {
  id: string; program_id: string; customer_phone: string; current_stamps: number;
  redeemed_count: number; created_at: string;
}
interface DbPromotion {
  id: string; project_id: string; name: string; name_ar: string | null;
  type: string | null; value: string | number | null; min_order_amount: string | number | null;
  start_date: string | null; end_date: string | null; active: boolean; created_at: string;
}

// ─── Row helpers ───────────────────────────────────────────────────────────

const num = (v: unknown): number =>
  v == null ? 0 : typeof v === "number" ? v : Number(v);

const ts = (v: string | null | undefined): number => (v ? Date.parse(v) : 0);

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "dokan"
  );
}

function mapProject(r: DbProject): Project {
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
    metadata: r.metadata ?? undefined,
    _creationTime: ts(r.created_at),
  };
}

function mapBranch(r: DbBranch): Branch {
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

function mapTable(r: DbTable): TableRow {
  return {
    _id: r.id,
    branchId: r.branch_id ?? r.project_id,
    projectId: r.project_id,
    name: r.name,
    slug: r.slug,
    isActive: r.is_active,
  };
}

function mapCategory(r: DbCategory): Category {
  return {
    _id: r.id,
    projectId: r.project_id,
    name: r.name,
    nameAr: r.name_ar,
    sortOrder: num(r.sort_order),
    isActive: r.is_active,
  };
}

function mapProduct(r: DbProduct): Product {
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

function mapAddon(r: DbAddon): Addon {
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

function mapStaff(r: DbStaff): StaffMember {
  return {
    _id: r.id,
    projectId: r.project_id,
    userId: r.user_id ?? undefined,
    fullName: r.full_name,
    role: r.role,
    hasPin: r.has_pin,
    isActive: r.is_active,
  };
}

function mapOrder(r: DbOrder): Order {
  return {
    _id: r.id,
    projectId: r.project_id,
    branchId: r.branch_id ?? undefined,
    tableId: r.table_id ?? undefined,
    staffId: r.staff_id ?? undefined,
    orderNumber: r.order_number,
    orderType: r.order_type as Order["orderType"],
    status: r.status as Order["status"],
    subtotal: num(r.subtotal),
    vatAmount: num(r.vat_amount),
    discountAmount: num(r.discount_amount),
    total: num(r.total),
    paymentMethod: r.payment_method as Order["paymentMethod"],
    paymentStatus: r.payment_status as Order["paymentStatus"],
    customerPhone: r.customer_phone ?? undefined,
    customerName: r.customer_name ?? undefined,
    notes: r.notes ?? undefined,
    source: r.source === null ? undefined : (r.source as Order["source"]),
    items: [],
    _creationTime: ts(r.created_at),
  };
}

function mapOrderItem(r: DbOrderItem, addons: OrderItemAddon[]): OrderItem {
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

function mapItemAddon(r: DbOrderItemAddon): OrderItemAddon {
  return {
    _id: r.id,
    orderItemId: r.order_item_id,
    addonId: r.addon_id ?? undefined,
    addonName: r.addon_name,
    addonNameAr: r.addon_name_ar ?? undefined,
    price: num(r.price),
  };
}

function mapProgram(r: DbLoyaltyProgram): LoyaltyProgram {
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

function mapStamp(r: DbLoyaltyStamp): LoyaltyStamp {
  return {
    _id: r.id,
    programId: r.program_id,
    customerPhone: r.customer_phone,
    currentStamps: num(r.current_stamps),
    redeemedCount: num(r.redeemed_count),
  };
}

function mapPromotion(r: DbPromotion): Promotion {
  return {
    _id: r.id,
    projectId: r.project_id,
    name: r.name,
    nameAr: r.name_ar ?? undefined,
    type: r.type as Promotion["type"],
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

/** Hash (or clear) a staff member's PIN server-side via the definer RPC. */
async function setStaffPin(staffId: string, pin: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_staff_pin", {
    p_staff_id: staffId,
    p_pin: pin ?? null,
  });
  if (error) throw error;
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
        // staff_view (security invoker) exposes safe columns + has_pin only —
        // pin hashes are never readable by any client role.
        supabase.from("staff_view").select("*").eq("project_id", projectId).order("created_at"),
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

      // One atomic security-definer RPC creates the project + owner staff row
      // + first branch + tables. The server generates the slug, enforces one
      // workspace per user and rolls everything back on any failure — none of
      // this is client-trusted anymore.
      const { data: projectId, error: rpcErr } = await supabase.rpc("create_project_with_owner", {
        p_name: args.name,
        p_name_ar: args.nameAr ?? null,
        p_branch_name: args.branchName || "Main Branch",
        p_branch_name_ar: args.branchNameAr ?? null,
        p_table_names: (args.tableNames ?? []).map((n) => n.trim()).filter(Boolean),
        p_currency: "BHD",
        p_vat_rate: 0.1,
        p_default_language: "en",
      });
      if (rpcErr) throw rpcErr;
      if (!projectId) throw new Error("Workspace creation failed.");

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
      benefitpayMerchantId?: string;
    }): Promise<void> => {
      const projectId = await getMyProjectIdRequired();
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.nameAr !== undefined) patch.name_ar = args.nameAr;
      if (args.vatRate !== undefined) patch.vat_rate = args.vatRate;
      if (args.vatNumber !== undefined) patch.vat_number = args.vatNumber;
      if (args.currency !== undefined) patch.currency = args.currency;
      if (args.benefitpayMerchantId !== undefined) {
        // jsonb updates replace the whole column, so read the current value
        // first and merge — never clobber other metadata keys.
        const { data: cur } = await supabase
          .from("projects")
          .select("metadata")
          .eq("id", projectId)
          .single();
        const merged = { ...((cur?.metadata as Record<string, unknown> | null) ?? {}) };
        if (args.benefitpayMerchantId.trim()) {
          merged.benefitpayMerchantId = args.benefitpayMerchantId.trim();
        } else {
          delete merged.benefitpayMerchantId;
        }
        patch.metadata = merged;
      }
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
        const list = addonsByProduct[a.productId] ?? [];
        list.push(a);
        addonsByProduct[a.productId] = list;
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
        name: String(args.name ?? ""),
        name_ar: String(args.nameAr ?? ""),
        sort_order: num(args.sortOrder),
        is_active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    updateCategory: async (args: { id: string; name?: string; nameAr?: string; sortOrder?: number }) => {
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = String(args.name);
      if (args.nameAr !== undefined) patch.name_ar = String(args.nameAr);
      if (args.sortOrder !== undefined) patch.sort_order = args.sortOrder;
      const { error } = await supabase.from("categories").update(patch).eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    deleteCategory: async (args: { id: string }) => {
      const { error } = await supabase.from("categories").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    createProduct: async (args: ProductInput & { name: string; nameAr: string }) => {
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

    updateProduct: async (args: ProductInput & { id: string }) => {
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

    deleteProduct: async (args: { id: string }) => {
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

    deleteBranch: async (args: { id: string }) => {
      const { error } = await supabase.from("branches").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    createTable: async (args: { branchId: string; name: string }) => {
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

    deleteTable: async (args: { id: string }) => {
      const { error } = await supabase.from("tables").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    /** Tables with live occupancy — driven by open (pending/preparing) orders. */
    tablesWithStatus: async (): Promise<TableWithStatus[]> => {
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
          ...mapTable(t),
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
      // verify_staff_pin (security definer) checks the bcrypt hash server-side
      // and returns safe columns only — never the hash — and enforces a
      // per-project lockout after repeated failures.
      const { data, error } = await supabase.rpc("verify_staff_pin", {
        p_project_id: projectId,
        p_pin: String(args.pinCode),
      });
      if (error) throw error;
      const row = (data ?? [])[0] as DbStaff | undefined;
      return row ? mapStaff(row) : null;
    },

    createStaff: async (args: { fullName: string; role: string; pinCode?: string }) => {
      const projectId = await getMyProjectIdRequired();
      const { data: authData } = await supabase.auth.getUser();
      const { data: staff, error } = await supabase
        .from("staff_members")
        .insert({
          project_id: projectId,
          user_id: args.role === "owner" ? authData.user?.id ?? null : null,
          full_name: args.fullName,
          role: args.role,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;

      // PINs are bcrypt-hashed server-side by the security-definer RPC.
      if (args.pinCode) {
        await setStaffPin(staff.id, args.pinCode);
      }

      // Branch membership: new staff join every active branch by default, so
      // branch-scoped tenants keep working out of the box. Restricting a
      // member to a subset of branches is done by removing assignments.
      const { data: branches } = await supabase
        .from("branches")
        .select("id")
        .eq("project_id", projectId)
        .eq("is_active", true);
      const assignments = (branches ?? []).map((b) => ({
        project_id: projectId,
        staff_id: staff.id,
        branch_id: b.id,
        role: args.role,
        is_active: true,
      }));
      if (assignments.length > 0) {
        const { error: aErr } = await supabase.from("staff_branch_assignments").insert(assignments);
        if (aErr) throw aErr;
      }

      notifyDataChanged();
    },

    updateStaff: async (args: {
      id: string;
      fullName?: string;
      role?: string;
      pinCode?: string | null;
      isActive?: boolean;
    }) => {
      const patch: Record<string, unknown> = {};
      if (args.fullName !== undefined) patch.full_name = args.fullName;
      if (args.role !== undefined) patch.role = args.role;
      if (args.isActive !== undefined) patch.is_active = args.isActive;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("staff_members").update(patch).eq("id", args.id);
        if (error) throw error;
      }
      // PIN changes go through the definer RPC (bcrypt hash server-side);
      // null/undefined leaves the existing PIN untouched.
      if (args.pinCode !== undefined) {
        await setStaffPin(args.id, args.pinCode);
      }
      notifyDataChanged();
    },

    deleteStaff: async (args: { id: string }) => {
      const { error } = await supabase.from("staff_members").delete().eq("id", args.id);
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
        for (const a of arows ?? []) {
          const list = addonsByItem.get(a.order_item_id) ?? [];
          list.push(mapItemAddon(a));
          addonsByItem.set(a.order_item_id, list);
        }
      }
      for (const i of irows ?? []) {
        const list = itemsByOrder.get(i.order_id) ?? [];
        list.push(mapOrderItem(i, addonsByItem.get(i.id) ?? []));
        itemsByOrder.set(i.order_id, list);
      }

      return orders.map((o) => ({
        ...mapOrder(o),
        tableName: o.table_id ? tablesById.get(o.table_id) ?? undefined : undefined,
        items: itemsByOrder.get(o.id) ?? [],
      }));
    },

    createOrder: async (args: CreateOrderArgs): Promise<{ orderId: string; orderNumber: string }> => {
      const projectId = await getMyProjectIdRequired();

      // create_order (security definer) re-validates every product/addon price
      // server-side, computes subtotal / VAT / total inside Postgres and
      // inserts order + items + addons atomically (no orphaned orders on
      // partial failure). Client-supplied prices are ignored. The idempotency
      // key is generated once at submit time (pos.tsx) and reused unchanged on
      // retries; the server dedupes on (project_id, idempotency_key).
      const { data, error } = await supabase.rpc("create_order", {
        p_project_id: projectId,
        p_table_id: args.tableId ?? null,
        p_order_type: args.orderType ?? "dine-in",
        p_payment_method: args.paymentMethod ?? "cash",
        p_payment_status: args.paymentStatus ?? "pending",
        p_customer_name: args.customerName ?? null,
        p_customer_phone: args.customerPhone ?? null,
        p_discount_amount: num(args.discountAmount) || 0,
        p_staff_id: args.staffId ?? null,
        p_source: "pos",
        p_idempotency_key: args.idempotencyKey ?? null,
        p_items: (args.items ?? []).map((i) => ({
          product_id: i.productId ?? null,
          quantity: num(i.quantity) || 1,
          notes: i.notes ?? null,
          addons: (i.addons ?? []).map((a) => ({ addon_id: a.addonId ?? null })),
        })),
      });
      if (error) throw error;
      const row = (data ?? [])[0] as
        | { order_id: string; order_number: string }
        | undefined;
      if (!row) throw new Error("Order creation failed.");
      notifyDataChanged();
      return { orderId: row.order_id, orderNumber: row.order_number };
    },

    updateOrderStatus: async (args: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: args.status })
        .eq("id", args.orderId);
      if (error) throw error;
      notifyDataChanged();
    },

    payOrder: async (args: { orderId: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", args.orderId);
      if (error) throw error;
      notifyDataChanged();
    },
  },

  payments: {
    /** Begin a BenefitPay session — returns the payload the POS renders as a QR code. */
    initiateBenefitPay: async (args: {
      orderId: string;
      amount: number;
    }): Promise<{
      transactionId: string;
      merchantId: string;
      amount: number;
      orderId: string;
      timestamp: number;
    }> => {
      const projectId = await getMyProjectIdRequired();
      const { data, error } = await supabase.rpc("initiate_benefitpay_payment", {
        p_project_id: projectId,
        p_order_id: args.orderId,
        p_amount: num(args.amount),
      });
      if (error) throw error;
      const payload = (data ?? null) as {
        transactionId: string;
        merchantId: string;
        amount: number;
        orderId: string;
        timestamp: number;
      } | null;
      if (!payload?.transactionId) throw new Error("BenefitPay initiation failed.");
      return payload;
    },

    /** Poll a pending transaction's status (the modal polls every 5 s). */
    checkBenefitPayStatus: async (args: { transactionId: string }): Promise<{
      transactionId: string;
      status: "pending" | "completed" | "failed";
    }> => {
      const { data, error } = await supabase.rpc("get_benefitpay_transaction", {
        p_transaction_id: args.transactionId,
      });
      if (error) throw error;
      const row = (data ?? null) as {
        transactionId: string;
        status: "pending" | "completed" | "failed";
      } | null;
      if (!row) throw new Error("Transaction not found.");
      return row;
    },

    /**
     * Confirm a sandbox payment. In production this is the gateway webhook
     * handler (server-side); until live merchant credentials exist it is what
     * a staff member taps to complete a test payment.
     */
    completeBenefitPay: async (args: { transactionId: string }): Promise<{
      transactionId: string;
      status: "completed";
    }> => {
      const { data, error } = await supabase.rpc("complete_benefitpay_transaction", {
        p_transaction_id: args.transactionId,
      });
      if (error) throw error;
      const row = (data ?? null) as { transactionId: string; status: "completed" } | null;
      if (!row) throw new Error("Could not complete transaction.");
      return row;
    },
  },

  waiter: {
    /** Customer calls the waiter from the public QR menu. */
    callWaiter: async (args: {
      tableId: string;
      type?: "assistance" | "bill";
    }): Promise<{ callId: string; status: string }> => {
      const { data, error } = await supabase.rpc("call_waiter", {
        p_table_id: args.tableId,
        p_type: args.type ?? "assistance",
      });
      if (error) throw error;
      return (data ?? { status: "pending" }) as { callId: string; status: string };
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

  reports: {
    /**
     * Last 7 days of paid revenue, bucketed by local calendar day (missing
     * days are zero-filled so charts render a continuous axis).
     */
    getDailySales: async (): Promise<
      { date: string; revenue: number; orders: number }[]
    > => {
      const projectId = await getMyProjectId();
      if (!projectId) return [];
      const since = new Date(Date.now() - 6 * 86400000);
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("orders")
        .select("created_at, total")
        .eq("project_id", projectId)
        .eq("payment_status", "paid")
        .gte("created_at", since.toISOString());
      if (error) throw error;

      const dayKey = (d: Date) => {
        // Local calendar day (browser timezone), not UTC.
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
      };

      const days = new Map<string, { revenue: number; orders: number }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        days.set(dayKey(d), { revenue: 0, orders: 0 });
      }
      for (const row of data ?? []) {
        const key = dayKey(new Date(row.created_at));
        const entry = days.get(key);
        if (entry) {
          entry.revenue += num(row.total);
          entry.orders += 1;
        }
      }
      return [...days.entries()].map(([date, v]) => ({ date, ...v }));
    },

    /**
     * Top products by units sold over the last 30 days (non-cancelled
     * orders only), with revenue — feeds the performance chart.
     */
    getProductPerformance: async (): Promise<
      { name: string; nameAr?: string; qty: number; revenue: number }[]
    > => {
      const projectId = await getMyProjectId();
      if (!projectId) return [];
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "product_name, product_name_ar, quantity, total_price, orders!inner(status, project_id)",
        )
        .eq("orders.project_id", projectId)
        .neq("orders.status", "cancelled")
        .gte("orders.created_at", since)
        .limit(5000);
      if (error) throw error;

      const agg = new Map<
        string,
        { name: string; nameAr?: string; qty: number; revenue: number }
      >();
      for (const i of data ?? []) {
        const key = String(i.product_name ?? "—");
        const cur = agg.get(key) ?? {
          name: key,
          nameAr: (i.product_name_ar as string | null) ?? undefined,
          qty: 0,
          revenue: 0,
        };
        cur.qty += num(i.quantity);
        cur.revenue += num(i.total_price);
        agg.set(key, cur);
      }
      return [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
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

    createLoyaltyProgram: async (args: {
      name: string;
      nameAr?: string;
      stampTarget?: number;
      rewardName?: string;
      rewardNameAr?: string;
    }) => {
      const projectId = await getMyProjectIdRequired();
      const { error } = await supabase.from("loyalty_programs").insert({
        project_id: projectId,
        name: args.name,
        name_ar: args.nameAr ?? null,
        stamp_target: args.stampTarget ?? 9,
        reward_name: args.rewardName ?? null,
        reward_name_ar: args.rewardNameAr ?? null,
        active: true,
      });
      if (error) throw error;
      notifyDataChanged();
    },

    updateLoyaltyProgram: async (args: {
      id: string;
      name?: string;
      nameAr?: string;
      stampTarget?: number;
      rewardName?: string;
      rewardNameAr?: string;
      active?: boolean;
    }) => {
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.nameAr !== undefined) patch.name_ar = args.nameAr;
      if (args.stampTarget !== undefined) patch.stamp_target = args.stampTarget;
      if (args.rewardName !== undefined) patch.reward_name = args.rewardName;
      if (args.rewardNameAr !== undefined) patch.reward_name_ar = args.rewardNameAr;
      if (args.active !== undefined) patch.active = args.active;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from("loyalty_programs").update(patch).eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    deleteLoyaltyProgram: async (args: { id: string }) => {
      const { error } = await supabase.from("loyalty_programs").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },

    listLoyaltyStamps: async (
      args: { programId: string } | "skip" | undefined,
    ): Promise<LoyaltyStamp[] | undefined> => {
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

    deletePromotion: async (args: { id: string }) => {
      const { error } = await supabase.from("promotions").delete().eq("id", args.id);
      if (error) throw error;
      notifyDataChanged();
    },
  },

  public: {
    /** Bilingual menu for the QR experience (anon reads via RLS). */
    getPublicMenu: async (
      args: { projectSlug: string; tableSlug?: string } | "skip" | undefined,
    ): Promise<PublicMenu | null | undefined> => {
      if (args === "skip" || !args?.projectSlug) return undefined;

      // One security-definer RPC returns the whole public menu: only menu-safe
      // columns (never cost_price / vat_number / subscription_status), the QR
      // table validated, and no anonymous direct SELECT on projects/tables/
      // categories/products/addons at all.
      const { data, error } = await supabase.rpc("public_menu_by_slug", {
        p_slug: args.projectSlug,
        p_table_slug: args.tableSlug ?? null,
      });
      if (error) throw error;

      const menu = (data ?? [])[0] as
        | null
        | undefined
        | {
            error?: string;
            project?: Record<string, unknown>;
            table?: { id: string; name: string } | null;
            categories?: unknown[];
            products?: unknown[];
            addons?: unknown[];
          };
      if (!menu || menu.error === "table_not_found" || !menu.project) return null;

      const project = menu.project as unknown as DbProject;
      const categories = (menu.categories ?? []) as unknown as DbCategory[];
      const products = (menu.products ?? []) as unknown as DbProduct[];
      const addons = (menu.addons ?? []) as unknown as DbAddon[];

      const addonsByProduct: Record<string, Addon[]> = {};
      for (const a of addons.map(mapAddon)) {
        if (!a.isActive) continue;
        const list = addonsByProduct[a.productId] ?? [];
        list.push(a);
        addonsByProduct[a.productId] = list;
      }

      return {
        project: mapProject(project),
        categories: categories
          .map(mapCategory)
          .filter((c) => c.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder),
        products: products.map(mapProduct).filter((p) => p.isActive),
        addonsByProduct,
        tableName: menu.table?.name,
        tableId: menu.table?.id,
      };
    },

    /** Place an order from the QR menu as an anonymous guest. */
    createPublicOrder: async (args: {
      projectSlug: string;
      tableSlug: string;
      customerName?: string;
      customerPhone?: string;
      items?: CartItemArg[];
      idempotencyKey?: string;
    }): Promise<{ orderNumber: string }> => {
      // Narrow public lookup: only the columns the menu needs (no vat_number /
      // subscription_status), never a full projects table SELECT.
      const { data: pdata, error: pErr } = await supabase.rpc("public_project_by_slug", {
        p_slug: args.projectSlug,
      });
      if (pErr) throw pErr;
      const project = (pdata ?? [])[0] as { id: string } | undefined;
      if (!project) throw new Error("Menu not found.");

      // Same server-authoritative flow as the POS: prices are re-validated and
      // the whole order (order + items + addons) is inserted atomically by the
      // security-definer RPC, deduped on the idempotency key.
      const { data, error } = await supabase.rpc("create_order", {
        p_project_id: project.id,
        p_table_slug: args.tableSlug,
        p_order_type: "dine-in",
        p_payment_method: "cash",
        p_payment_status: "pending",
        p_customer_name: args.customerName ?? null,
        p_customer_phone: args.customerPhone ?? null,
        p_source: "qr-menu",
        p_idempotency_key: args.idempotencyKey ?? null,
        p_items: (args.items ?? []).map((i) => ({
          product_id: i.productId ?? null,
          quantity: num(i.quantity) || 1,
          addons: (i.addons ?? []).map((a) => ({ addon_id: a.addonId ?? null })),
        })),
      });
      if (error) throw error;
      const row = (data ?? [])[0] as
        | { order_id: string; order_number: string }
        | undefined;
      if (!row) throw new Error("Order creation failed.");
      notifyDataChanged();
      return { orderNumber: row.order_number };
    },
  },
};
