import { createClient } from '@supabase/supabase-js'

/**
 * Get Supabase client for gameplay database (mysupa)
 * Server-side only - uses SERVICE ROLE KEY to bypass RLS
 * For use in Server Actions and API routes
 */
export const getMySupaServer = () => {
    const mysupaUrl = process.env.SUPABASE_URL_MINE
    // Use service role key to bypass RLS for server operations
    const mysupaKey = process.env.SUPABASE_SERVICE_ROLE_KEY_MINE

    if (!mysupaUrl || !mysupaKey) {
        throw new Error("Server configuration error: Gameplay DB credentials missing (need SUPABASE_URL_MINE and SUPABASE_SERVICE_ROLE_KEY_MINE)")
    }
    return createClient(mysupaUrl, mysupaKey)
}

