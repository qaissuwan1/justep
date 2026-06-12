// Supabase client singleton, configured from Vite env vars.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev so a missing .env is obvious rather than a silent auth failure.
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
