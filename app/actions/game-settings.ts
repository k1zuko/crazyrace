'use server'

import { createActionClient } from '@/lib/supabase-actions-client'
import { createClient } from '@supabase/supabase-js'

// Helper to get mysupa client
const getMySupaClient = () => {
    const mysupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_MINE
    const mysupaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE

    if (!mysupaUrl || !mysupaKey) {
        throw new Error("Server configuration error: Gameplay DB not connecting")
    }
    return createClient(mysupaUrl, mysupaKey)
}

export async function updateGameSettings(roomCode: string, settings: any) {
    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Optional: Verify host ownership here if strictly needed, 
        // but typically the roomCode + auth check is decent if we trust the flow.
        // For strictness, we should check if 'game_sessions' has this user as host_id
        const { data: sessionData, error: checkError } = await supabase
            .from('game_sessions')
            .select('host_id')
            .eq('game_pin', roomCode)
            .single()

        if (checkError || !sessionData) return { error: 'Session not found' }

        // Check if current user is the host
        // Note: host_id in game_sessions might be profile id or auth user id depending on implementation.
        // In select-quiz.ts we set it as profile.id || user.id.
        // Let's check against both? Or secure getHostProfile?
        // Let's fetch profile first to be sure.
        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()

        const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);
        if (!isHost) return { error: 'Unauthorized: You are not the host of this session' }

        const mysupa = getMySupaClient()

        const { error } = await mysupa
            .from("sessions")
            .update(settings)
            .eq("game_pin", roomCode);

        if (error) throw error

        return { success: true }
    } catch (error: any) {
        console.error('updateGameSettings error:', error)
        return { error: error.message }
    }
}

export async function deleteGameSession(roomCode: string) {
    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Check ownership
        const { data: sessionData } = await supabase
            .from('game_sessions')
            .select('host_id')
            .eq('game_pin', roomCode)
            .single()

        if (sessionData) {
            const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
            const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);
            if (!isHost) return { error: 'Unauthorized' }
        }

        const mysupa = getMySupaClient()

        // Parallel delete
        const [mainResult, gameResult] = await Promise.allSettled([
            supabase.from("game_sessions").delete().eq("game_pin", roomCode),
            mysupa.from("sessions").delete().eq("game_pin", roomCode)
        ]);

        const mainError = mainResult.status === 'rejected' ? mainResult.reason : mainResult.value.error;
        const gameError = gameResult.status === 'rejected' ? gameResult.reason : gameResult.value.error;

        if (mainError) throw new Error(`Main DB Error: ${mainError.message || mainError}`)
        if (gameError) throw new Error(`Gameplay DB Error: ${gameError.message || gameError}`)

        return { success: true }

    } catch (error: any) {
        console.error('deleteGameSession error:', error)
        return { error: error.message }
    }
}

// Fetch session data for settings page (moved from lib/supabase-server.ts)
// Fetch session data for settings page (moved from lib/supabase-server.ts)
export async function getSessionSettings(gamePin: string) {
    const supabase = await createActionClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated', session: null, quiz: null, quizDetail: null }

        // Fetch session first
        const { data: sessionData, error: sessionError } = await supabase
            .from("game_sessions")
            .select("id, quiz_id, host_id, quiz_detail, total_time_minutes, question_limit, difficulty")
            .eq("game_pin", gamePin)
            .single();

        if (sessionError || !sessionData) {
            return { session: null, quiz: null, quizDetail: null, error: sessionError?.message || "Session not found" };
        }

        // Host Authorization Guard
        // Check if current user is the host (either directly or via profile)
        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);

        if (!isHost) {
            return { error: 'Unauthorized: You are not the host of this session', session: null, quiz: null, quizDetail: null }
        }

        // Fetch quiz questions in parallel
        const { data: quizData, error: quizError } = await supabase
            .from("quizzes")
            .select("questions")
            .eq("id", sessionData.quiz_id)
            .single();

        // Parse quiz_detail
        let quizDetail = null;
        if (sessionData.quiz_detail) {
            try {
                quizDetail = typeof sessionData.quiz_detail === 'string'
                    ? JSON.parse(sessionData.quiz_detail)
                    : sessionData.quiz_detail;
            } catch (e) {
                console.error("Error parsing quiz_detail:", e);
            }
        }

        return {
            session: sessionData,
            quizDetail,
            quiz: quizData || null,
            error: quizError?.message || null
        };

    } catch (error: any) {
        console.error('getSessionSettings error:', error)
        return { error: error.message, session: null, quiz: null, quizDetail: null }
    }
}
