-- To use this, run this SQL code once in your Supabase SQL Editor.
CREATE OR REPLACE FUNCTION remove_participant_from_session(
    p_session_id TEXT,
    p_participant_id TEXT,
    p_app_name TEXT
)
RETURNS void
AS $$
DECLARE
    v_current_participants JSONB;
    v_session_found BOOLEAN;
BEGIN
    -- Lock the row and check for the application name
    SELECT true, participants
    INTO v_session_found, v_current_participants
    FROM public.game_sessions
    WHERE id = p_session_id AND application = p_app_name
    FOR UPDATE;

    IF NOT v_session_found THEN
        RETURN;
    END IF;

    v_current_participants := COALESCE(v_current_participants, '[]'::JSONB);

    -- Remove the participant from the array by filtering
    v_current_participants := (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(v_current_participants) elem
        WHERE (elem->>'id') IS DISTINCT FROM p_participant_id
    );

    -- Commit the change
    UPDATE public.game_sessions
    SET participants = v_current_participants
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;
