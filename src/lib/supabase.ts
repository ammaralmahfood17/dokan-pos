import { createClient } from "@supabase/supabase-js";
import { notifyDataChanged } from "./realtime";

/**
 * Supabase client — the single backend connection for Dokan.
 *
 * Configure via the project Keys tab:
 *   VITE_SUPABASE_URL      — Project URL (https://xxxx.supabase.co)
 *   VITE_SUPABASE_ANON_KEY — anon / public key
 */
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true } },
);

// Realtime: orders drive the KDS, POS table occupancy and order lists.
// Subscribed once per tab; RLS decides what each session actually receives.
if (typeof window !== "undefined" && isSupabaseConfigured) {
  supabase
    .channel("dokan-orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      () => notifyDataChanged(),
    )
    .subscribe();
}
