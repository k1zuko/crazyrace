'use server'

import { createActionClient } from '@/lib/supabase-actions-client'
import { createClient } from '@supabase/supabase-js'
import { generateXID } from '@/lib/id-generator'

// Helper to generate game pin (moved from client)
function generateGamePin(length = 6) {
    const digits = "0123456789";
    return Array.from({ length }, () => digits[Math.floor(Math.random() * digits.length)]).join("");
}

export async function getHostProfile() {
    const supabase = await createActionClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, favorite_quiz')
            .eq('auth_user_id', user.id)
            .single()

        if (error) throw error

        let favorites: string[] = []
        if (data.favorite_quiz) {
            try {
                const parsed = typeof data.favorite_quiz === 'string'
                    ? JSON.parse(data.favorite_quiz)
                    : data.favorite_quiz
                favorites = parsed.favorites || []
            } catch (e) {
                console.error('Error parsing favorites:', e)
            }
        }

        return { profile: data, favorites, userId: user.id }
    } catch (error: any) {
        console.error('getHostProfile error:', error)
        return { error: error.message }
    }
}

export async function getQuizCategories(profileId: string) {
    const supabase = await createActionClient()
    try {
        const { data, error } = await supabase
            .from('quizzes')
            .select('category')
            .or(`is_public.eq.true,creator_id.eq.${profileId}`)

        if (error) throw error

        const uniqueCats = ["All", ...new Set(data.map(q => q.category).filter(Boolean))] as string[]
        return { categories: uniqueCats }
    } catch (error: any) {
        console.error('getQuizCategories error:', error)
        return { error: error.message }
    }
}

export async function getQuizzesPaginated(params: {
    profileId: string
    searchQuery?: string
    category?: string
    favorites?: string[]
    creatorId?: string
    page: number
    limit: number
}) {
    const supabase = await createActionClient()
    try {
        const offset = (params.page - 1) * params.limit

        const { data, error } = await supabase
            .rpc('get_quizzes_paginated', {
                p_user_id: params.profileId,
                p_search_query: params.searchQuery || null,
                p_category_filter: params.category === "All" ? null : params.category,
                p_favorites_filter: params.favorites || null,
                p_creator_filter: params.creatorId || null,
                p_limit: params.limit,
                p_offset: offset
            })

        if (error) throw error

        const totalCount = (data && data.length > 0) ? Number(data[0].total_count) : 0
        return { quizzes: data || [], totalCount }

    } catch (error: any) {
        console.error('getQuizzesPaginated error:', error)
        return { error: error.message }
    }
}

export async function toggleFavoriteQuiz(quizId: string, currentFavorites: string[]) {
    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Get reliable profile id
        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        if (!profile) return { error: 'Profile not found' }

        const isFavoriting = !currentFavorites.includes(quizId)
        let newFavorites = [...currentFavorites]

        if (isFavoriting) {
            newFavorites.push(quizId)
        } else {
            newFavorites = newFavorites.filter(id => id !== quizId)
        }

        // 1. Update profiles
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ favorite_quiz: { favorites: newFavorites } })
            .eq('id', profile.id)

        if (profileError) throw profileError

        // 2. Update quizzes table (favorite array of user IDs)
        const { data: quizData, error: fetchError } = await supabase
            .from('quizzes')
            .select('favorite')
            .eq('id', quizId)
            .single()

        if (fetchError) throw fetchError

        let quizFavorites: string[] = []
        if (quizData?.favorite) {
            if (typeof quizData.favorite === 'string') {
                try { quizFavorites = JSON.parse(quizData.favorite) } catch { }
            } else {
                quizFavorites = quizData.favorite
            }
        }

        if (isFavoriting) {
            if (!quizFavorites.includes(profile.id)) quizFavorites.push(profile.id)
        } else {
            quizFavorites = quizFavorites.filter(id => id !== profile.id)
        }

        const { error: quizError } = await supabase
            .from('quizzes')
            .update({ favorite: quizFavorites })
            .eq('id', quizId)

        if (quizError) throw quizError

        return { success: true, newFavorites }

    } catch (error: any) {
        console.error('toggleFavoriteQuiz error:', error)
        return { error: error.message }
    }
}

export async function createGameSession(quizId: string) {
    const supabase = await createActionClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const hostId = profile?.id || user.id

        const gamePin = generateGamePin()
        const sessId = generateXID()

        const primarySession = {
            id: sessId,
            quiz_id: quizId,
            host_id: hostId,
            game_pin: gamePin,
            total_time_minutes: 5,
            question_limit: 5,
            difficulty: "easy",
            current_questions: [],
            status: "waiting",
        }

        const newMainSession = {
            ...primarySession,
            game_end_mode: "manual",
            allow_join_after_start: false,
            participants: [],
            responses: [],
            application: "crazyrace"
        };

        // 1. Write to Main DB (Authenticated User context)
        const { error: mainError } = await supabase
            .from("game_sessions")
            .insert(newMainSession)

        if (mainError) throw mainError

        // 2. Write to Gameplay DB (mysupa - Realtime)
        // Initialize the secondary client for the formatting/gameplay DB
        const mysupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_MINE
        const mysupaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE

        if (!mysupaUrl || !mysupaKey) {
            // Rollback and error
            await supabase.from("game_sessions").delete().eq("id", sessId)
            console.error("Missing MINE Supabase env vars")
            throw new Error("Server configuration error: Gameplay DB not connecting")
        }

        // Since this is a server action, we use the standard createClient.
        // We assume 'sessions' table allows public inserts or the anon key has permission.
        const mysupa = createClient(mysupaUrl, mysupaKey)

        const { error: gameError } = await mysupa
            .from("sessions")
            .insert(primarySession)

        if (gameError) {
            console.error("Error creating session in Gameplay DB:", gameError)
            // Rollback first insert in Main DB
            await supabase.from("game_sessions").delete().eq("id", sessId)
            throw gameError
        }

        return { success: true, gamePin, hostId }

    } catch (error: any) {
        console.error('createGameSession error:', error)
        return { error: error.message }
    }
}
