import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/** Returns the projectId the signed-in user belongs to, or null. */
export async function getProjectIdForUser(
  ctx: Ctx,
): Promise<Id<"projects"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const staff = await ctx.db
    .query("staffMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!staff || !staff.isActive) return null;
  return staff.projectId;
}

/** Throws if the user is not a member of any active project. */
export async function requireProjectId(ctx: Ctx): Promise<Id<"projects">> {
  const projectId = await getProjectIdForUser(ctx);
  if (projectId === null) {
    throw new Error("No project found for this user. Complete onboarding first.");
  }
  return projectId;
}