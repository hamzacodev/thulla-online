import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client, used only in API routes (server side). Never expose
// this key to the browser.
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
