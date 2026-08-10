import { api } from "@/lib/api";
import { useQuery } from "@/lib/react-query";

/**
 * The signed-in user's workspace ({ project, branches, tables, staff }).
 * - `undefined` while loading
 * - `null` when the user has no project yet (drives the onboarding redirect)
 */
export function useWorkspace() {
  return useQuery(api.projects.myWorkspace);
}

/** POS catalog: categories, products and addons grouped by product. */
export function usePosCatalog() {
  return useQuery(api.catalog.posCatalog);
}
