'use server'

import { createActionClient } from '@/lib/supabase-actions-client'

export async function getUserProfile() {
    const supabase = await createActionClient()

    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
            console.warn('getUserProfile: Check user failed', userError)
            return { error: 'Not authenticated', status: 401 }
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('auth_user_id', user.id)
            .single()

        if (error && error.code !== 'PGRST116') {
            console.error('getUserProfile: Fetch profile failed', error)
            return { error: error.message, status: 500 }
        }

        if (profile) {
            return { profile, status: 200 }
        }

        // Create new profile if not exists
        const profileData = {
            auth_user_id: user.id,
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
            email: user.email || '',
            fullname: user.user_metadata?.full_name || user.user_metadata?.name || '',
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
            updated_at: new Date().toISOString()
        }

        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert(profileData)
            .select()
            .single()

        if (insertError) {
            console.error('getUserProfile: Create profile failed', insertError)
            return {
                // Return user as fallback if creation fails
                profile: null,
                user: {
                    id: user.id,
                    email: user.email,
                    user_metadata: user.user_metadata
                },
                error: insertError.message,
                status: 500
            }
        }

        return { profile: newProfile, status: 201 }

    } catch (error: any) {
        console.error('getUserProfile: Unexpected error', error)
        return { error: error.message || 'Internal server error', status: 500 }
    }
}
