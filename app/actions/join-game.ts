'use server'

import { getMySupaServer } from '@/lib/supabase-mysupa-server'

/**
 * Join game - calls the join_game RPC on server
 * This prevents API key exposure on client
 */
export async function joinGameAction(
    roomCode: string,
    userId: string,
    nickname: string
) {
    const mysupa = getMySupaServer()

    try {
        const { data, error } = await mysupa.rpc("join_game", {
            p_room_code: roomCode,
            p_user_id: userId,
            p_nickname: nickname.trim(),
        })

        if (error) {
            console.error('joinGameAction RPC error:', error)
            return { error: 'general' }
        }

        if (!data) {
            return { error: 'general' }
        }

        // Pass through RPC error codes
        if (data.error) {
            return { error: data.error }
        }

        // Success - return participant data
        return {
            success: true,
            nickname: data.nickname,
            participantId: data.participant_id,
        }

    } catch (error: any) {
        console.error('joinGameAction error:', error)
        return { error: 'general' }
    }
}
