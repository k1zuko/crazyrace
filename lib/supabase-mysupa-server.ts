import { createClient } from '@supabase/supabase-js'

/**
 * Get Supabase client for gameplay database (mysupa)
 * Server-side only - uses non-NEXT_PUBLIC env vars for security
 * For use in Server Actions and API routes
 */
export const getMySupaServer = () => {
    // Fallback to NEXT_PUBLIC_ if non-prefixed not available (for backward compat)
    const mysupaUrl = process.env.SUPABASE_URL_MINE
    const mysupaKey = process.env.SUPABASE_ANON_KEY_MINE

    if (!mysupaUrl || !mysupaKey) {
        throw new Error("Server configuration error: Gameplay DB credentials missing")
    }
    return createClient(mysupaUrl, mysupaKey)
}
