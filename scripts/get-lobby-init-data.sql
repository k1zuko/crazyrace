-- Drop previous if exists
DROP FUNCTION IF EXISTS get_lobby_init_data;

CREATE OR REPLACE FUNCTION get_lobby_init_data(
    p_room_code TEXT,
    p_user_id TEXT,
    p_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id UUID;
    v_participants JSONB;
    v_my_data JSONB;
    v_total_count INTEGER;
BEGIN
    -- 1. Get Session ID
    SELECT id INTO v_session_id
    FROM sessions
    WHERE game_pin = p_room_code
    LIMIT 1;

    IF v_session_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'session_not_found'
        );
    END IF;

    -- 2. Get Total Count
    SELECT count(*) INTO v_total_count
    FROM participants
    WHERE session_id = v_session_id;

    -- 3. Get Participants Page (Cursor logic is handled by client usually, but here we just fetch top N)
    SELECT jsonb_agg(sub) INTO v_participants
    FROM (
        SELECT *
        FROM participants
        WHERE session_id = v_session_id
        ORDER BY joined_at ASC
        LIMIT p_limit
    ) sub;

    -- 4. Get My Data (separately, to ensure it exists even if outside limit)
    SELECT jsonb_build_object(
        'id', id,
        'nickname', nickname,
        'car', car,
        'joined_at', joined_at,
        'session_id', session_id
        -- Add other fields if necessary
    ) INTO v_my_data
    FROM participants
    WHERE session_id = v_session_id AND id = p_user_id;

    -- 5. Return Combined Result
    RETURN jsonb_build_object(
        'participants', COALESCE(v_participants, '[]'::jsonb),
        'me', v_my_data, -- will be null if user not found (kicked/invalid)
        'total_count', v_total_count,
        'session_id', v_session_id
    );
END;
$$;
