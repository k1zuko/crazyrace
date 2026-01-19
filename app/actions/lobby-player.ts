'use server'

import { getMySupaServer } from '@/lib/supabase-mysupa-server'

export async function getPlayerLobbyData(roomCode: string, participantId: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID provided' }

        // 1. Get Session
        const { data: sessionData, error: sessionError } = await mysupa
            .from("sessions")
            .select("id, status, countdown_started_at, started_at, ended_at, difficulty")
            .eq("game_pin", roomCode)
            .single()

        if (sessionError || !sessionData) return { error: 'Session not found' }

        // 2. Verify Participant belongs to this session
        const { data: participant, error: pError } = await mysupa
            .from("participants")
            .select("id, nickname, car")
            .eq("id", participantId)
            .eq("session_id", sessionData.id)
            .single()

        if (pError || !participant) return { error: 'Participant not found in this session' }

        // 3. Fetch Initial Participants List (for UI)
        const pageSize = 20
        const { data: participants, error: pListError, count } = await mysupa
            .from("participants")
            .select("id, nickname, car, joined_at", { count: "exact" })
            .eq("session_id", sessionData.id)
            .order("joined_at", { ascending: true })
            .limit(pageSize)

        if (pListError) throw pListError

        return {
            session: sessionData,
            participant: participant,
            participants: participants || [],
            totalCount: count || 0,
            cursor: participants && participants.length > 0 ? participants[participants.length - 1].joined_at : null,
            hasMore: (participants?.length || 0) >= pageSize
        }

    } catch (error: any) {
        console.error('getPlayerLobbyData error:', error)
        return { error: error.message }
    }
}

export async function prefetchGameDataAction(roomCode: string, participantId: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        // 1. Fetch Requesting Participant (Security check)
        const { data: me } = await mysupa.from("participants").select("session_id, answers, completion, current_question").eq("id", participantId).single()
        if (!me) return { error: 'Unauthorized' }

        // 2. Fetch Session
        const { data: sess, error: sessError } = await mysupa
            .from("sessions")
            .select("id, status, started_at, total_time_minutes, current_questions, difficulty, game_pin")
            .eq("game_pin", roomCode)
            // Ensure session matches participant's session
            .eq("id", me.session_id)
            .single();

        if (sessError || !sess) return { error: 'Session not found' }

        // 3. Sanitize Questions (CRITICAL SECURITY)
        // Remove 'correctAnswer' or any marker of correctness
        const sanitizedQuestions = (sess.current_questions || []).map((q: any) => ({
            id: q.id,
            question: q.question,
            options: q.answers.map((a: any) => a.answer), // Only return answer text
            // ensure no 'isCorrect' or 'correctAnswerId' is leaked
        }));

        const prefetchedData = {
            session: {
                id: sess.id,
                status: sess.status,
                started_at: sess.started_at,
                total_time_minutes: sess.total_time_minutes,
                difficulty: sess.difficulty,
            },
            questions: sanitizedQuestions,
            participant: {
                answers: me.answers,
                completion: me.completion,
                current_question: me.current_question
            },
            prefetchedAt: Date.now(),
        };

        return { data: prefetchedData }

    } catch (error: any) {
        console.error('prefetchGameDataAction error:', error)
        return { error: error.message }
    }
}

export async function leaveGameAction(participantId: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No ID' }

        const { error } = await mysupa
            .from("participants")
            .delete()
            .eq("id", participantId);

        if (error) throw error
        return { success: true }
    } catch (error: any) {
        console.error('leaveGameAction error:', error)
        return { error: error.message }
    }
}

export async function updatePlayerCarAction(participantId: string, car: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No ID' }

        const { error } = await mysupa
            .from('participants')
            .update({ car: car })
            .eq('id', participantId);

        if (error) throw error
        return { success: true }
    } catch (error: any) {
        console.error('updatePlayerCarAction error:', error)
        return { error: error.message }
    }
}

export async function getParticipantsAction(roomCode: string, participantId: string, cursor: string, limit = 20) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'Unauthorized' }

        // Verify participant is in this session (lightweight check)
        // We need session_id first.
        const { data: sess } = await mysupa.from("sessions").select("id").eq("game_pin", roomCode).single()
        if (!sess) return { error: 'Session not found' }

        // Check if participant exists in this session
        const { count } = await mysupa.from("participants").select("id", { count: 'exact', head: true }).eq("id", participantId).eq("session_id", sess.id)
        if (!count) return { error: 'Unauthorized participant' }

        const { data: participants, error } = await mysupa
            .from("participants")
            .select("id, nickname, car, joined_at")
            .eq("session_id", sess.id)
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
        return { error: error.message }
    }
}
