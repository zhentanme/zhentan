import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("Missing SUPABASE_URL");
if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// Service-role key: bypasses Row Level Security — server-side use only.
export const supabase = createClient(url, key);
