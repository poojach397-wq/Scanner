import { createClient } from "@supabase/supabase-js";

// These come from your Supabase project settings (Project Settings -> API)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client only (uses service role key - never expose this to the browser)
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
