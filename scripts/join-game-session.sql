-- To use this, run this SQL code once in your Supabase SQL Editor.
CREATE OR REPLACE FUNCTION join_game_session(
    p_session_id TEXT,
    p_new_participant JSONB,
    p_app_name TEXT
)
RETURNS JSONB -- Return success/error status and participant ID
AS $$
DECLARE
    v_current_participants JSONB;
    v_session_found BOOLEAN;
    v_session_status TEXT;
    v_existing_by_user JSONB;
    v_existing_by_nickname JSONB;
BEGIN
    -- Lock the row and check for the application name
    SELECT true, status, participants
    INTO v_session_found, v_session_status, v_current_participants
    FROM public.game_sessions
    WHERE id = p_session_id AND application = p_app_name
    FOR UPDATE;

    IF NOT v_session_found THEN
        RETURN jsonb_build_object('success', false, 'reason', 'roomNotFound');
    END IF;

    IF v_session_status != 'waiting' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'notAccepting');
    END IF;

    v_current_participants := COALESCE(v_current_participants, '[]'::JSONB);

    -- Check for duplicates inside the transaction
    IF (p_new_participant->>'user_id') IS NOT NULL THEN
        SELECT elem INTO v_existing_by_user
        FROM jsonb_array_elements(v_current_participants) elem
        WHERE elem->>'user_id' = (p_new_participant->>'user_id');
    END IF;

    SELECT elem INTO v_existing_by_nickname
    FROM jsonb_array_elements(v_current_participants) elem
    WHERE lower(elem->>'nickname') = lower(p_new_participant->>'nickname');

    IF v_existing_by_user IS NOT NULL OR v_existing_by_nickname IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate');
    END IF;

    -- Add the new participant
    v_current_participants := v_current_participants || p_new_participant;

    -- Commit the change
    UPDATE public.game_sessions
    SET participants = v_current_participants
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'participantId', p_new_participant->>'id');
END;
$$ LANGUAGE plpgsql;
