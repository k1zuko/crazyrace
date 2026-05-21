-- CORRECTED VERSION: Uses TEXT for IDs for consistency.
-- To use this, run this SQL code once in your Supabase SQL Editor.
CREATE OR REPLACE FUNCTION finalize_player_session(
    p_session_id TEXT,
    p_participant_id TEXT,
    p_app_name TEXT
)
RETURNS void
AS $$
DECLARE
    v_current_responses JSONB;
    v_current_participants JSONB;
    v_response_idx INT;
    v_participant_response JSONB;
    v_participant_idx INT;
    v_session_found BOOLEAN;
BEGIN
    -- Lock the row and check for the application name
    SELECT true, responses, participants
    INTO v_session_found, v_current_responses, v_current_participants
    FROM public.game_sessions
    WHERE id = p_session_id AND application = p_app_name
    FOR UPDATE;

    IF NOT v_session_found THEN
        RETURN;
    END IF;

    v_current_responses := COALESCE(v_current_responses, '[]'::JSONB);
    v_current_participants := COALESCE(v_current_participants, '[]'::JSONB);

    -- Find the player's response object
    SELECT idx - 1 INTO v_response_idx
    FROM jsonb_array_elements(v_current_responses) WITH ORDINALITY arr(val, idx)
    WHERE val->>'participant' = p_participant_id;

    IF v_response_idx IS NOT NULL THEN
        -- Mark completion status in the responses array
        v_current_responses := jsonb_set(v_current_responses, ARRAY[v_response_idx::TEXT, 'completion'], to_jsonb(true));
        v_current_responses := jsonb_set(v_current_responses, ARRAY[v_response_idx::TEXT, 'racing'], to_jsonb(false)); -- Ensure racing is false

        -- Find the participant in the participants array and update their score one last time
        v_participant_response := v_current_responses->v_response_idx;
        SELECT idx - 1 INTO v_participant_idx
        FROM jsonb_array_elements(v_current_participants) WITH ORDINALITY arr(val, idx)
        WHERE val->>'id' = p_participant_id;

        IF v_participant_idx IS NOT NULL THEN
            v_current_participants := jsonb_set(v_current_participants, ARRAY[v_participant_idx::TEXT, 'score'], (v_participant_response->'score'));
        END IF;

        -- Commit the changes
        UPDATE public.game_sessions
        SET
            responses = v_current_responses,
            participants = v_current_participants
        WHERE id = p_session_id;
    END IF;
END;
$$ LANGUAGE plpgsql;