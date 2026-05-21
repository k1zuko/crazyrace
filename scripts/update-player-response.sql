-- CORRECTED VERSION: Uses TEXT for IDs and generate_xid() for consistency.
-- To use this, run this SQL code once in your Supabase SQL Editor.
CREATE OR REPLACE FUNCTION update_player_response(
    p_session_id TEXT,
    p_participant_id TEXT,
    p_question_id TEXT,
    p_answer_id TEXT,
    p_is_correct BOOLEAN,
    p_total_questions INT,
    p_app_name TEXT
)
RETURNS void
AS $$
DECLARE
    v_current_responses JSONB;
    v_current_participants JSONB;
    v_response_idx INT;
    v_participant_response JSONB;
    v_new_correct_count INT;
    v_points_per_question INT;
    v_new_score INT;
    v_start_time TIMESTAMPTZ;
    v_elapsed_seconds INT;
    v_new_accuracy TEXT;
    v_answer_obj JSONB;
    v_participant_idx INT;
    v_session_found BOOLEAN;
BEGIN
    -- Lock the session row and CRITICALLY check for the application name.
    SELECT true, responses, participants, started_at
    INTO v_session_found, v_current_responses, v_current_participants, v_start_time
    FROM public.game_sessions
    WHERE id = p_session_id AND application = p_app_name
    FOR UPDATE;

    -- If no row was found, it means the ID is wrong or the app name doesn't match.
    IF NOT v_session_found THEN
        RETURN;
    END IF;

    v_current_responses := COALESCE(v_current_responses, '[]'::JSONB);

    SELECT idx - 1 INTO v_response_idx
    FROM jsonb_array_elements(v_current_responses) WITH ORDINALITY arr(val, idx)
    WHERE val->>'participant' = p_participant_id;

    IF p_total_questions > 0 THEN
        v_points_per_question := floor(100 / p_total_questions);
    ELSE
        v_points_per_question := 0;
    END IF;

    v_answer_obj := jsonb_build_object(
        'id', generate_xid(),
        'question_id', p_question_id,
        'answer_id', p_answer_id,
        'is_correct', p_is_correct,
        'points_earned', CASE WHEN p_is_correct THEN v_points_per_question ELSE 0 END,
        'created_at', now()
    );

    IF v_response_idx IS NOT NULL THEN
        v_participant_response := v_current_responses->v_response_idx;
        v_participant_response := jsonb_set(
            v_participant_response,
            '{answers}',
            (v_participant_response->'answers') || v_answer_obj
        );
    ELSE
        v_participant_response := jsonb_build_object(
            'id', generate_xid(),
            'participant', p_participant_id,
            'answers', jsonb_build_array(v_answer_obj),
            'score', 0, 'correct', 0, 'accuracy', '0.00', 'duration', 0,
            'total_question', p_total_questions,
            'current_question', 0,
            'racing', false, 'completion', false
        );
    END IF;

    SELECT COUNT(*) INTO v_new_correct_count
    FROM jsonb_array_elements(v_participant_response->'answers') ans
    WHERE (ans->>'is_correct')::BOOLEAN = true;

    v_new_score := v_new_correct_count * v_points_per_question;
    v_elapsed_seconds := floor(extract(epoch from (now() - v_start_time)));
    
    IF p_total_questions > 0 THEN
        v_new_accuracy := to_char((v_new_correct_count::FLOAT / p_total_questions::FLOAT) * 100, 'FM999999990.00');
    ELSE
        v_new_accuracy := '0.00';
    END IF;

    v_participant_response := jsonb_set(v_participant_response, '{correct}', to_jsonb(v_new_correct_count));
    v_participant_response := jsonb_set(v_participant_response, '{score}', to_jsonb(v_new_score));
    v_participant_response := jsonb_set(v_participant_response, '{accuracy}', to_jsonb(v_new_accuracy));
    v_participant_response := jsonb_set(v_participant_response, '{duration}', to_jsonb(v_elapsed_seconds));
    v_participant_response := jsonb_set(v_participant_response, '{current_question}', to_jsonb(jsonb_array_length(v_participant_response->'answers')));

    IF v_response_idx IS NOT NULL THEN
        v_current_responses := jsonb_set(v_current_responses, ARRAY[v_response_idx::TEXT], v_participant_response);
    ELSE
        v_current_responses := v_current_responses || v_participant_response;
    END IF;

    v_current_participants := COALESCE(v_current_participants, '[]'::JSONB);
    SELECT idx - 1 INTO v_participant_idx
    FROM jsonb_array_elements(v_current_participants) WITH ORDINALITY arr(val, idx)
    WHERE val->>'id' = p_participant_id;

    IF v_participant_idx IS NOT NULL THEN
        v_current_participants := jsonb_set(v_current_participants, ARRAY[v_participant_idx::TEXT, 'score'], to_jsonb(v_new_score));
    END IF;

    UPDATE public.game_sessions
    SET
        responses = v_current_responses,
        participants = v_current_participants
    WHERE id = p_session_id;

END;
$$ LANGUAGE plpgsql;
