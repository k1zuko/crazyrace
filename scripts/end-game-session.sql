-- Function to atomically end a game session, handle AFK players, and finalize scores.
CREATE OR REPLACE FUNCTION end_game_session(
    p_session_id TEXT,
    p_app_name TEXT
)
RETURNS void
AS $$
DECLARE
    v_session RECORD;
    v_participant RECORD;
    v_response RECORD;
    v_responses_updated JSONB;
    v_participants_updated JSONB;
    v_afk_response JSONB;
    v_total_questions INT;
    v_response_exists BOOLEAN;
BEGIN
    -- Lock the session row for update to prevent race conditions
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = p_session_id AND application = p_app_name
    FOR UPDATE;

    -- If session not found or already finished, do nothing.
    IF NOT FOUND OR v_session.status = 'finished' THEN
        RETURN;
    END IF;

    -- Get the total number of questions for the session
    v_total_questions := jsonb_array_length(v_session.current_questions);
    v_responses_updated := v_session.responses;
    v_participants_updated := v_session.participants;

    -- Loop through each participant to check for AFK status
    FOR v_participant IN SELECT * FROM jsonb_to_recordset(v_session.participants) AS p(id TEXT, nickname TEXT, car TEXT, score INT)
    LOOP
        -- Check if a response entry exists for this participant
        SELECT EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(v_responses_updated) AS r(participant TEXT)
            WHERE r.participant = v_participant.id
        ) INTO v_response_exists;

        -- If no response exists, the participant is AFK. Create a default result.
        IF NOT v_response_exists THEN
            -- Create a default zero-score response object
            v_afk_response := jsonb_build_object(
                'participant', v_participant.id,
                'score', 0,
                'racing', false,
                'answers', '[]'::jsonb,
                'correct', 0,
                'accuracy', '0.00',
                'duration', 0,
                'total_question', v_total_questions,
                'current_question', 0,
                'completion', true -- Mark as complete to finalize
            );
            
            -- Add the AFK response to the responses array
            v_responses_updated := v_responses_updated || v_afk_response;

            -- Also, find and update the participant's score in the participants array to 0 for leaderboard consistency
            FOR v_response IN SELECT value, ordinality - 1 AS idx FROM jsonb_array_elements(v_participants_updated) WITH ORDINALITY
            LOOP
                IF v_response.value->>'id' = v_participant.id THEN
                    v_participants_updated := jsonb_set(v_participants_updated, ARRAY[v_response.idx::text, 'score'], '0'::jsonb);
                    EXIT; -- Exit the inner loop once updated
                END IF;
            END LOOP;

        END IF;
    END LOOP;

    -- Finally, update the game session with the new status and potentially updated arrays
    UPDATE public.game_sessions
    SET
        status = 'finished',
        ended_at = now(),
        participants = v_participants_updated,
        responses = v_responses_updated
    WHERE id = p_session_id;

END;
$$ LANGUAGE plpgsql;
