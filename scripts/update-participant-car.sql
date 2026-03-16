-- To use this, run this SQL code once in your Supabase SQL Editor.
CREATE OR REPLACE FUNCTION update_participant_car(
    p_session_id TEXT,
    p_participant_id TEXT,
    p_new_car TEXT,
    p_app_name TEXT
)
RETURNS void
AS $$
DECLARE
    v_current_participants JSONB;
    v_participant_idx INT;
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

    -- Find the index of the participant to update
    SELECT idx - 1 INTO v_participant_idx
    FROM jsonb_array_elements(v_current_participants) WITH ORDINALITY arr(val, idx)
    WHERE val->>'id' = p_participant_id;

    -- If found, update the car property
    IF v_participant_idx IS NOT NULL THEN
        v_current_participants := jsonb_set(v_current_participants, ARRAY[v_participant_idx::TEXT, 'car'], to_jsonb(p_new_car));

        -- Commit the change
        UPDATE public.game_sessions
        SET participants = v_current_participants
        WHERE id = p_session_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
