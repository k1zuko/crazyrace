'use server'

import { createActionClient } from '@/lib/supabase-actions-client'
import { createClient } from '@supabase/supabase-js'

// Helper to get mysupa client for realtime DB
const getMySupaClient = () => {
    const mysupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_MINE
    const mysupaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_MINE

    if (!mysupaUrl || !mysupaKey) {
        throw new Error("Server configuration error: Gameplay DB not connecting")
    }
    return createClient(mysupaUrl, mysupaKey)
}

export async function getLobbyData(roomCode: string) {
    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // 1. Get Session from Main DB (to verify host)
        const { data: sessionData, error: sessionError } = await supabase
            .from("game_sessions")
            .select("id, host_id, status, quiz_id")
            .eq("game_pin", roomCode)
            .single()

        if (sessionError || !sessionData) return { error: 'Session not found' }

        // Host Authorization
        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);

        if (!isHost) return { error: 'Unauthorized: You are not the host' }

        // 2. Get Realtime Session Data from Gameplay DB (mysupa)
        const mysupa = getMySupaClient()
        const { data: realTimeSession, error: rtError } = await mysupa
            .from("sessions")
            .select("id, status, countdown_started_at")
            .eq("game_pin", roomCode)
            .single()

        if (rtError || !realTimeSession) return { error: 'Realtime session not found' }

        // 3. Get Initial Participants
        const pageSize = 30
        const { data: participants, error: pError, count } = await mysupa
            .from("participants")
            .select("id, nickname, car, joined_at", { count: "exact" })
            .eq("session_id", realTimeSession.id)
            .order("joined_at", { ascending: true })
            .limit(pageSize)

        if (pError) throw pError

        return {
            session: realTimeSession,
            participants: participants || [],
            totalCount: count || 0,
            hasMore: (participants?.length || 0) >= pageSize,
            cursor: participants && participants.length > 0 ? participants[participants.length - 1].joined_at : null
        }

    } catch (error: any) {
        console.error('getLobbyData error:', error)
        return { error: error.message }
    }
}

export async function startGame(roomCode: string, countdownStartedAt: string | null = null) {
    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Verify Host Ownership (Lightweight check or reuse logic)
        const { data: sessionData } = await supabase
            .from("game_sessions")
            .select("host_id")
            .eq("game_pin", roomCode)
            .single()

        if (!sessionData) return { error: 'Session not found' }
        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);

        if (!isHost) return { error: 'Unauthorized' }

        const mysupa = getMySupaClient()

        // If countdownStartedAt is provided, we are starting countdown
        // If null (or handle specific status), we might be finishing countdown?
        // Original code: 
        // 1. startGame() -> update countdown_started_at
        // 2. End countdown -> update status='active', started_at=now, countdown_started_at=null

        let updateData: any = {}
        if (countdownStartedAt) {
            updateData = { countdown_started_at: countdownStartedAt }
        } else {
            // Assume "Active" start
            updateData = {
                status: "active",
                started_at: new Date().toISOString(), // Use server time
                countdown_started_at: null,
            }
        }

        const { error } = await mysupa
            .from("sessions")
            .update(updateData)
            .eq("game_pin", roomCode)

        if (error) throw error

        return { success: true }

    } catch (error: any) {
        console.error('startGame error:', error)
        return { error: error.message }
    }
}

export async function kickPlayer(roomCode: string, participantId: string) {
    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Verify Host
        const { data: sessionData } = await supabase.from("game_sessions").select("host_id").eq("game_pin", roomCode).single()
        if (!sessionData) return { error: 'Session not found' }

        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);
        if (!isHost) return { error: 'Unauthorized' }

        const mysupa = getMySupaClient()

        // We need session_id for the delete query on participants
        const { data: rtSession } = await mysupa.from("sessions").select("id").eq("game_pin", roomCode).single()
        if (!rtSession) return { error: 'RT Session not found' }

        const { error } = await mysupa
            .from("participants")
            .delete()
            .eq("id", participantId)
            .eq("session_id", rtSession.id)

        if (error) throw error

        return { success: true }

    } catch (error: any) {
        console.error('kickPlayer error:', error)
        return { error: error.message }
    }
}

export async function getParticipants(roomCode: string, cursor: string, limit = 30) {
    // This is public/open read usually? Or guarded?
    // Lobby participants list is technically public info for players?
    // BUT strict host lobby pagination should probably be guarded if possible.
    // Let's guard it for safety since we are on Host Page.

    // NOTE: This might be overkill for just "load more", checking auth every time.
    // But security-first.

    const supabase = await createActionClient()
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        // Lightweight Host Check or assume if they have roomCode context?
        // Let's verify host to prevent scraping.
        const { data: sessionData } = await supabase.from("game_sessions").select("host_id").eq("game_pin", roomCode).single()
        if (!sessionData) return { error: 'Session not found' }
        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = sessionData.host_id === user.id || (profile && sessionData.host_id === profile.id);
        if (!isHost) return { error: 'Unauthorized' }

        const mysupa = getMySupaClient()
        const { data: rtSession } = await mysupa.from("sessions").select("id").eq("game_pin", roomCode).single()
        if (!rtSession) return { error: 'RT Session not found' }

        const { data: participants, error } = await mysupa
            .from("participants")
            .select("id, nickname, car, joined_at")
            .eq("session_id", rtSession.id)
            .gt("joined_at", cursor)
            .order("joined_at", { ascending: true })
            .limit(limit)

        if (error) throw error

        return {
            participants: participants || [],
            nextCursor: participants && participants.length > 0 ? participants[participants.length - 1].joined_at : null,
            hasMore: (participants?.length || 0) >= limit
        }

    } catch (error: any) {
        console.error('getParticipants error:', error)
        return { error: error.message }
    }
}
