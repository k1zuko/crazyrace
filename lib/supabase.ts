import { createBrowserClient } from '@supabase/ssr'
import { createClient } from "@supabase/supabase-js"

// ⚠️ MUST use NEXT_PUBLIC_ prefix for client-side env vars!
// Non-prefixed env vars are ONLY available on server in Next.js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const myurlsupa = process.env.NEXT_PUBLIC_SUPABASE_URL_MINE;
const myanonsupa = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!myurlsupa) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL_MINE");
if (!myanonsupa) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE");

export const mysupa = createClient(myurlsupa, myanonsupa);
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

