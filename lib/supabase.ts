import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const myurlsupa = process.env.NEXT_PUBLIC_SUPABASE_URL_MINE;
const myanonsupa = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE;

if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!myurlsupa) throw new Error("Missing MY_NEXT_PUBLIC_SUPABASE_URL");
if (!myanonsupa) throw new Error("Missing MY_NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const mysupa = createClient(myurlsupa, myanonsupa);
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
