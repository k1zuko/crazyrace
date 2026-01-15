'use server'

import { createActionClient } from '@/lib/supabase-actions-client'

export async function login(formData: FormData) {
    const identifier = formData.get('identifier') as string
    const password = formData.get('password') as string

    if (!identifier || !password) {
        return { error: 'Email/Username and Password are required', status: 400 }
    }

    const supabase = await createActionClient()

    try {
        let email = identifier.toLowerCase()

        // If username (no @), resolve to email
        if (!email.includes('@')) {
            const { data, error } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', identifier) // identifier can be non-lowercase in input? assume username is case sensitive or not?
                // User code did: if (input.includes("@")) return input.toLowerCase();
                // and .eq("username", input) (not lowercased?). 
                // Let's stick to user logic: input as is for username query.
                .maybeSingle()

            if (error) {
                console.error('Login action: Username lookup failed', error)
                return { error: 'Error validating username', status: 500 }
            }

            if (!data) {
                return { error: 'Username tidak ditemukan!', status: 404 }
            }

            email = data.email
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (signInError) {
            return { error: signInError.message, status: 401 }
        }

        return { success: true, status: 200 }

    } catch (error: any) {
        console.error('Login action: Unexpected error', error)
        return { error: 'Terjadi kesalahan internal', status: 500 }
    }
}
