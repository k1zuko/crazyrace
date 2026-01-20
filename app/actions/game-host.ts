'use server'

import { createActionClient } from '@/lib/supabase-actions-client'
import { getMySupaServer } from '@/lib/supabase-mysupa-server'
import { generateXID } from '@/lib/id-generator'

function generateGamePin(length = 6) {
    const digits = "0123456789";
    return Array.from({ length }, () => digits[Math.floor(Math.random() * digits.length)]).join("");
}

/**
 * Get host game data (session + initial participants)
 */
export async function getHostGameDataAction(roomCode: string) {
    const supabase = await createActionClient()
    const mysupa = getMySupaServer()

    try {
        // Verify host
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: mainSession } = await supabase
            .from("game_sessions")
            .select("host_id")
            .eq("game_pin", roomCode)
            .single()

        if (!mainSession) return { error: 'Session not found' }

        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = mainSession.host_id === user.id || (profile && mainSession.host_id === profile.id)
        if (!isHost) return { error: 'Unauthorized' }

        // Fetch session from mysupa
        const { data: sess, error } = await mysupa
            .from("sessions")
            .select("id, status, started_at, current_questions, question_limit, total_time_minutes")
            .eq("game_pin", roomCode)
            .single()

        if (error || !sess) return { error: 'Session not found in gameplay DB' }

        const qCount = sess.question_limit || (sess.current_questions || []).length || 5
        const gameDuration = (sess.total_time_minutes || 5) * 60

        // Fetch initial participants
        const pageSize = 50
        const { data: parts, count } = await mysupa
            .from("participants")
            .select("id, nickname, car, score, correct, current_question, completion, answers, joined_at", { count: "exact" })
            .eq("session_id", sess.id)
            .order("joined_at", { ascending: true })
            .limit(pageSize)

        const mapped = (parts || []).map((p: any) => ({
            id: p.id,
            nickname: p.nickname,
            car: p.car || "blue",
            score: p.score || 0,
            correct: p.correct || 0,
            currentQuestion: p.current_question || 0,
            answersCount: (p.answers || []).length,
            isComplete: p.completion === true,
            joinedAt: p.joined_at,
        }))

        return {
            data: {
                session: sess,
                totalQuestions: qCount,
                gameDuration,
                participants: mapped,
                totalCount: count || 0,
                cursor: parts && parts.length > 0 ? parts[parts.length - 1].joined_at : null,
                hasMore: (parts?.length || 0) >= pageSize,
            }
        }

    } catch (error: any) {
        console.error('getHostGameDataAction error:', error)
        return { error: error.message }
    }
}

/**
 * Load more participants (pagination)
 */
export async function loadMoreParticipantsAction(roomCode: string, sessionId: string, cursor: string, pageSize = 50) {
    const supabase = await createActionClient()
    const mysupa = getMySupaServer()

    try {
        // Verify host (lightweight)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: more } = await mysupa
            .from("participants")
            .select("id, nickname, car, score, correct, current_question, completion, answers, joined_at")
            .eq("session_id", sessionId)
            .gt("joined_at", cursor)
            .order("joined_at", { ascending: true })
            .limit(pageSize)

        const mapped = (more || []).map((p: any) => ({
            id: p.id,
            nickname: p.nickname,
            car: p.car || "blue",
            score: p.score || 0,
            correct: p.correct || 0,
            currentQuestion: p.current_question || 0,
            answersCount: (p.answers || []).length,
            isComplete: p.completion === true,
            joinedAt: p.joined_at,
        }))

        return {
            participants: mapped,
            nextCursor: more && more.length > 0 ? more[more.length - 1].joined_at : null,
            hasMore: (more?.length || 0) >= pageSize,
        }

    } catch (error: any) {
        console.error('loadMoreParticipantsAction error:', error)
        return { error: error.message }
    }
}

/**
 * End game - mark session finished and sync to main DB
 */
export async function endGameAction(roomCode: string) {
    const supabase = await createActionClient()
    const mysupa = getMySupaServer()

    try {
        // Verify host
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: mainSession } = await supabase
            .from("game_sessions")
            .select("host_id")
            .eq("game_pin", roomCode)
            .single()

        if (!mainSession) return { error: 'Session not found' }

        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = mainSession.host_id === user.id || (profile && mainSession.host_id === profile.id)
        if (!isHost) return { error: 'Unauthorized' }

        // 1. End session
        const endedAt = new Date().toISOString()
        const { data: sess, error: sessError } = await mysupa
            .from("sessions")
            .update({
                status: "finished",
                ended_at: endedAt,
            })
            .eq("game_pin", roomCode)
            .select("id")
            .single()

        if (sessError || !sess) return { error: 'Failed to end session' }

        // 2. Force complete all remaining players
        const { error: playerError } = await mysupa
            .from("participants")
            .update({
                completion: true,
                racing: false,
                finished_at: endedAt,
            })
            .eq("session_id", sess.id)
            .eq("completion", false)

        if (playerError) return { error: 'Failed to complete players' }

        // 3. Sync results to main Supabase
        await syncResultsToMainDB(roomCode, sess.id, supabase, mysupa)

        return { success: true, sessionId: sess.id }

    } catch (error: any) {
        console.error('endGameAction error:', error)
        return { error: error.message }
    }
}

/**
 * Helper: Sync results to main Supabase
 */
async function syncResultsToMainDB(roomCode: string, sessionId: string, supabase: any, mysupa: any) {
    try {
        const { data: sess } = await mysupa
            .from("sessions")
            .select("id, host_id, quiz_id, question_limit, total_time_minutes, current_questions, started_at, ended_at")
            .eq("id", sessionId)
            .single()

        if (!sess) throw new Error("Session not found")

        const totalQuestions = sess.question_limit || (sess.current_questions || []).length

        const { data: participants } = await mysupa
            .from("participants")
            .select("id, user_id, nickname, car, score, correct, answers, duration, completion, current_question")
            .eq("session_id", sessionId)

        if (!participants || participants.length === 0) return

        // Format participants
        const formattedParticipants = participants.map((p: any) => {
            const correctCount = p.correct || 0
            const accuracy = totalQuestions > 0
                ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
                : 0

            return {
                id: p.id,
                user_id: p.user_id || null,
                nickname: p.nickname,
                car: p.car || "blue",
                score: p.score || 0,
                correct: correctCount,
                completion: p.completion || false,
                total_completion_time: p.duration || 0,
                total_question: totalQuestions,
                current_question: p.current_question || 0,
                accuracy: accuracy.toFixed(2),
            }
        })

        // Format responses
        const formattedResponses = participants
            .filter((p: any) => (p.answers || []).length > 0)
            .map((p: any) => ({
                id: generateXID(),
                participant: p.id,
                answers: p.answers || [],
            }))

        // Upsert to main Supabase
        const { error } = await supabase
            .from("game_sessions")
            .upsert({
                game_pin: roomCode,
                quiz_id: sess.quiz_id,
                host_id: sess.host_id,
                status: "finished",
                application: "crazyrace",
                total_time_minutes: sess.total_time_minutes || 5,
                question_limit: totalQuestions.toString(),
                started_at: sess.started_at,
                ended_at: sess.ended_at,
                participants: formattedParticipants,
                responses: formattedResponses,
                current_questions: sess.current_questions,
            }, { onConflict: "game_pin" })

        if (error) throw error

        console.log("Results synced to main Supabase!")
    } catch (err: any) {
        console.error("Sync failed:", err)
    }
}

/**
 * Get leaderboard data (session + completed participants with ranks)
 */
export async function getLeaderboardDataAction(roomCode: string) {
    const supabase = await createActionClient()
    const mysupa = getMySupaServer()

    try {
        // Verify host
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: mainSession } = await supabase
            .from("game_sessions")
            .select("host_id")
            .eq("game_pin", roomCode)
            .single()

        if (!mainSession) return { error: 'Session not found' }

        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = mainSession.host_id === user.id || (profile && mainSession.host_id === profile.id)
        if (!isHost) return { error: 'Unauthorized' }

        // Get session from mysupa
        const { data: sess, error: sessErr } = await mysupa
            .from("sessions")
            .select("id, question_limit, current_questions")
            .eq("game_pin", roomCode)
            .single()

        if (sessErr || !sess) return { error: 'Session tidak ditemukan' }

        const totalQuestions = sess.question_limit || (sess.current_questions || []).length

        // Get completed participants
        const { data: participants, error: partErr } = await mysupa
            .from("participants")
            .select("id, nickname, car, score, correct, answers, duration, completion")
            .eq("session_id", sess.id)
            .eq("completion", true)

        if (partErr) return { error: 'Failed to fetch participants' }

        if (!participants || participants.length === 0) {
            return { data: { session: sess, playerStats: [] } }
        }

        // Calculate stats
        const stats = participants.map(p => {
            const correctCount = p.correct || 0
            const accuracy = totalQuestions > 0
                ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
                : 0

            const totalSeconds = p.duration || 9999
            const mins = Math.floor(totalSeconds / 60)
            const secs = totalSeconds % 60
            const totalTime = `${mins}:${secs.toString().padStart(2, "0")}`

            return {
                participantId: p.id,
                nickname: p.nickname,
                car: p.car || "blue",
                finalScore: p.score || 0,
                correctAnswers: correctCount,
                totalQuestions,
                accuracy,
                totalTime,
                duration: totalSeconds,
            }
        })

        // Sort: high score → fast time
        const sorted = stats.sort((a, b) => {
            if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
            return a.duration - b.duration
        })

        const ranked = sorted.map((s, i) => ({ ...s, rank: i + 1 }))

        return { data: { session: sess, playerStats: ranked } }

    } catch (error: any) {
        console.error('getLeaderboardDataAction error:', error)
        return { error: error.message }
    }
}

/**
 * Restart game - create new session with shuffled questions
 */
export async function restartGameAction(roomCode: string) {
    const supabase = await createActionClient()
    const mysupa = getMySupaServer()

    try {
        // Verify host
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: mainSession } = await supabase
            .from("game_sessions")
            .select("host_id")
            .eq("game_pin", roomCode)
            .single()

        if (!mainSession) return { error: 'Session not found' }

        const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
        const isHost = mainSession.host_id === user.id || (profile && mainSession.host_id === profile.id)
        if (!isHost) return { error: 'Unauthorized' }

        // 1. Get old session
        const { data: oldSess } = await mysupa
            .from("sessions")
            .select("quiz_id, host_id, question_limit, total_time_minutes, difficulty, current_questions")
            .eq("game_pin", roomCode)
            .single()

        if (!oldSess) return { error: 'Session lama tidak ditemukan' }

        // 2. Shuffle questions
        const questions = oldSess.current_questions || []
        const shuffled = shuffleArray(questions)
        const sliced = shuffled.slice(0, oldSess.question_limit || 5)

        // 3. Generate new PIN
        const newPin = generateGamePin()

        // 4. Create new session in mysupa
        const { error: mysupaError } = await mysupa
            .from("sessions")
            .insert({
                game_pin: newPin,
                quiz_id: oldSess.quiz_id,
                host_id: oldSess.host_id,
                status: "waiting",
                question_limit: oldSess.question_limit,
                total_time_minutes: oldSess.total_time_minutes,
                difficulty: oldSess.difficulty,
                current_questions: sliced,
            })

        if (mysupaError) return { error: 'Failed to create new session in gameplay DB' }

        // 5. Create new session in main supabase
        const { error: mainError } = await supabase
            .from("game_sessions")
            .insert({
                game_pin: newPin,
                quiz_id: oldSess.quiz_id,
                host_id: oldSess.host_id,
                status: "waiting",
                application: "crazyrace",
                total_time_minutes: oldSess.total_time_minutes || 5,
                question_limit: oldSess.question_limit?.toString() || "5",
                difficulty: oldSess.difficulty,
                current_questions: sliced,
                participants: [],
                responses: [],
            })

        if (mainError) return { error: 'Failed to create new session in main DB' }

        return { success: true, newPin }

    } catch (error: any) {
        console.error('restartGameAction error:', error)
        return { error: error.message }
    }
}

// Helper: Shuffle array
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}
