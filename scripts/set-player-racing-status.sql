-- CORRECTED VERSION: Uses TEXT for IDs for consistency.
-- To use this, run this SQL code once in your Supabase SQL Editor.
CREATE OR REPLACE FUNCTION set_player_racing_status(
    p_session_id TEXT,
    p_participant_id TEXT,
    p_is_racing BOOLEAN,
    p_app_name TEXT
)
RETURNS void
AS $$
DECLARE
    v_current_responses JSONB;
    v_response_idx INT;
    v_session_found BOOLEAN;
BEGIN
    -- Lock the row and CRITICALLY check for the application name.
    SELECT true, responses
    INTO v_session_found, v_current_responses
    FROM public.game_sessions
    WHERE id = p_session_id AND application = p_app_name
    FOR UPDATE;

    -- If no row was found, it means the ID is wrong or the app name doesn't match.
    IF NOT v_session_found THEN
        RETURN;
    END IF;

    v_current_responses := COALESCE(v_current_responses, '[]'::JSONB);

    -- Find the player's response object
    SELECT idx - 1 INTO v_response_idx
    FROM jsonb_array_elements(v_current_responses) WITH ORDINALITY arr(val, idx)
    WHERE val->>'participant' = p_participant_id;

    -- If the response object exists, update the 'racing' flag
    IF v_response_idx IS NOT NULL THEN
        v_current_responses := jsonb_set(v_current_responses, ARRAY[v_response_idx::TEXT, 'racing'], to_jsonb(p_is_racing));

        -- Commit the change
        UPDATE public.game_sessions
        SET responses = v_current_responses
        WHERE id = p_session_id;
    END IF;
END;
$$ LANGUAGE plpgsql;