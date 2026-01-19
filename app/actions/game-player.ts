'use server'

import { getMySupaServer } from '@/lib/supabase-mysupa-server'

/**
 * Fetch game data for a player (session, questions, participant state)
 */
export async function getGameDataAction(roomCode: string, participantId: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        // 1. Verify participant exists
        const { data: me } = await mysupa
            .from("participants")
            .select("session_id, answers, completion, current_question, racing")
            .eq("id", participantId)
            .single()

        if (!me) return { error: 'Participant not found' }

        // 2. Fetch Session
        const { data: sess, error: sessError } = await mysupa
            .from("sessions")
            .select("id, status, started_at, total_time_minutes, current_questions, difficulty")
            .eq("game_pin", roomCode)
            .eq("id", me.session_id)
            .single()

        if (sessError || !sess) return { error: 'Session not found' }

        // 3. Sanitize Questions (CRITICAL: Remove correct answer)
        const sanitizedQuestions = (sess.current_questions || []).map((q: any) => ({
            id: q.id,
            question: q.question,
            options: q.answers.map((a: any) => a.answer),
        }))

        // 4. Check completion
        const answeredCount = (me.answers || []).length
        if (me.completion || answeredCount >= sanitizedQuestions.length) {
            return { redirect: 'result' }
        }

        // 5. Determine game source based on difficulty
        let gameSrc = '/racing-game/v4.final.html'
        switch (sess.difficulty) {
            case 'easy':
                gameSrc = '/racing-game/v1.straight.html'
                break
            case 'normal':
                gameSrc = '/racing-game/v2.curves.html'
                break
            case 'hard':
                gameSrc = '/racing-game/v4.final.html'
                break
        }

        return {
            data: {
                session: {
                    id: sess.id,
                    status: sess.status,
                    started_at: sess.started_at,
                    total_time_minutes: sess.total_time_minutes,
                    difficulty: sess.difficulty,
                },
                questions: sanitizedQuestions,
                currentQuestionIndex: answeredCount,
                isRacing: me.racing || false,
                gameSrc,
            }
        }

    } catch (error: any) {
        console.error('getGameDataAction error:', error)
        return { error: error.message }
    }
}

/**
 * Submit a single answer (calls RPC for secure validation)
 */
export async function submitAnswerAction(
    participantId: string,
    questionId: string,
    answerIndex: number,
    scorePerQuestion: number,
    nextIndex: number,
    isFinished: boolean,
    isRacing: boolean,
    pendingAnswers: any[],
    pendingScore: number,
    pendingCorrect: number
) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        const { data, error } = await mysupa.rpc('submit_quiz_answer_secure', {
            p_participant_id: participantId,
            p_question_id: questionId,
            p_answer_index: answerIndex,
            p_score_per_question: scorePerQuestion,
            p_next_index: nextIndex,
            p_is_finished: isFinished,
            p_is_racing: isRacing,
            p_pending_answers: pendingAnswers,
            p_pending_score: pendingScore,
            p_pending_correct: pendingCorrect
        })

        if (error) throw error

        return {
            data: {
                is_correct: data?.is_correct,
                correct_answer: data?.correct_answer
            }
        }

    } catch (error: any) {
        console.error('submitAnswerAction error:', error)
        return { error: error.message }
    }
}

/**
 * Submit batch of pending answers (when time runs out or reconnecting)
 */
export async function submitBatchAnswersAction(
    participantId: string,
    newAnswers: any[],
    totalScoreAdd: number,
    totalCorrectAdd: number,
    nextIndex: number,
    isFinished: boolean,
    isRacing: boolean
) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        const { error } = await mysupa.rpc('submit_quiz_answer_batch', {
            p_participant_id: participantId,
            p_new_answers: newAnswers,
            p_total_score_add: totalScoreAdd,
            p_total_correct_add: totalCorrectAdd,
            p_next_index: nextIndex,
            p_is_finished: isFinished,
            p_is_racing: isRacing
        })

        if (error) throw error

        return { success: true }

    } catch (error: any) {
        console.error('submitBatchAnswersAction error:', error)
        return { error: error.message }
    }
}

/**
 * Update participant's racing status
 */
export async function updateRacingStatusAction(participantId: string, racing: boolean) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        const { error } = await mysupa
            .from("participants")
            .update({ racing })
            .eq("id", participantId)

        if (error) throw error

        return { success: true }

    } catch (error: any) {
        console.error('updateRacingStatusAction error:', error)
        return { error: error.message }
    }
}

/**
 * Mark game as finished for participant
 */
export async function finishGameAction(participantId: string, roomCode: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        const { error } = await mysupa
            .from("participants")
            .update({
                completion: true,
                finished_at: new Date().toISOString()
            })
            .eq("id", participantId)

        if (error) throw error

        return { success: true }

    } catch (error: any) {
        console.error('finishGameAction error:', error)
        return { error: error.message }
    }
}

/**
 * Get player result data (session + participant stats)
 */
export async function getPlayerResultAction(roomCode: string, participantId: string) {
    const mysupa = getMySupaServer()
    try {
        if (!participantId) return { error: 'No participant ID' }

        // 1. Get session
        const { data: sess, error: sessErr } = await mysupa
            .from("sessions")
            .select("id, question_limit, total_time_minutes, current_questions, status")
            .eq("game_pin", roomCode)
            .single()

        if (sessErr || !sess) return { error: 'Session tidak ditemukan' }

        const totalQuestions = sess.question_limit || (sess.current_questions || []).length
        const gameDuration = (sess.total_time_minutes || 5) * 60
        const isFinished = sess.status === 'finished'

        // 2. Get participant data
        const { data: participant, error: partErr } = await mysupa
            .from("participants")
            .select("nickname, car, score, correct, completion, duration")
            .eq("id", participantId)
            .single()

        if (partErr || !participant) return { error: 'Data kamu tidak ditemukan' }

        // 3. Calculate stats
        const correctCount = participant.correct || 0
        const finalScore = participant.score || 0
        const accuracy = totalQuestions > 0
            ? ((correctCount / totalQuestions) * 100).toFixed(2)
            : "0.00"

        const totalSeconds = Math.min(participant.duration || 0, gameDuration)
        const mins = Math.floor(totalSeconds / 60)
        const secs = totalSeconds % 60
        const totalTime = `${mins}:${secs.toString().padStart(2, "0")}`

        // 4. Calculate rank if game finished
        let rank: number | null = null
        if (isFinished) {
            const { data: participants } = await mysupa
                .from("participants")
                .select("id, score, duration")
                .eq("session_id", sess.id)
                .eq("completion", true)

            if (participants) {
                const sorted = participants.sort((a, b) => {
                    const scoreA = a.score || 0
                    const scoreB = b.score || 0
                    if (scoreB !== scoreA) return scoreB - scoreA
                    return (a.duration || 9999) - (b.duration || 9999)
                })
                const rankIndex = sorted.findIndex(p => p.id === participantId)
                rank = rankIndex !== -1 ? rankIndex + 1 : sorted.length + 1
            }
        }

        return {
            data: {
                sessionId: sess.id,
                isFinished,
                stats: {
                    nickname: participant.nickname,
                    car: participant.car || "blue",
                    finalScore,
                    correctAnswers: correctCount,
                    totalQuestions,
                    accuracy,
                    totalTime,
                    participantId,
                    duration: participant.duration || 0,
                },
                rank,
            }
        }

    } catch (error: any) {
        console.error('getPlayerResultAction error:', error)
        return { error: error.message }
    }
}

/**
 * Calculate player rank (when game finishes via realtime)
 */
export async function calculatePlayerRankAction(sessionId: string, participantId: string) {
    const mysupa = getMySupaServer()
    try {
        if (!sessionId || !participantId) return { error: 'Missing params' }

        const { data: participants, error } = await mysupa
            .from("participants")
            .select("id, score, duration")
            .eq("session_id", sessionId)
            .eq("completion", true)

        if (error || !participants) return { rank: 1 }

        const sorted = participants.sort((a, b) => {
            const scoreA = a.score || 0
            const scoreB = b.score || 0
            if (scoreB !== scoreA) return scoreB - scoreA
            return (a.duration || 9999) - (b.duration || 9999)
        })

        const rankIndex = sorted.findIndex(p => p.id === participantId)
        return { rank: rankIndex !== -1 ? rankIndex + 1 : sorted.length + 1 }

    } catch (error: any) {
        console.error('calculatePlayerRankAction error:', error)
        return { error: error.message, rank: 1 }
    }
}
