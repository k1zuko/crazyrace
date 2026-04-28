import { createClient } from "@supabase/supabase-js";

export const supabaseGame = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL_MINE!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);