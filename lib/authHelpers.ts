import { supabaseAdmin } from "./supabaseAdmin";

export interface AuthedUser {
  id: string;
  username: string;
}

/**
 * Verifies the bearer token on an incoming request against Supabase Auth,
 * then loads that user's username from `profiles`. Returns null if the
 * token is missing/invalid, or if the user hasn't picked a username yet —
 * callers should treat both as "not authenticated for gameplay purposes".
 */
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.username) return null;

  return { id: userData.user.id, username: profile.username };
}
