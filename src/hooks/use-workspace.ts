import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

export function useWorkspace() {
  return useQuery(api.projects.myWorkspace);
}

export function usePosCatalog() {
  return useQuery(api.catalog.posCatalog);
}
