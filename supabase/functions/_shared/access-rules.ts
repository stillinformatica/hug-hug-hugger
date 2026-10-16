export const OWNER_USER_ID = "1ed2a250-7ad8-4fcd-9567-763a3f6e5540";

export function canAdminister(userId: string, hasAdminRole: boolean, assurance: string | null): boolean {
  return userId === OWNER_USER_ID && hasAdminRole && assurance === "aal2";
}