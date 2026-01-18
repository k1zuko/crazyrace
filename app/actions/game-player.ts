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
