-- Enable real-time for game tables
ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_sessions;

-- Create function to handle room updates
CREATE OR REPLACE FUNCTION handle_room_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify all clients in the room about updates
  PERFORM pg_notify(
    'room_update',
    json_build_object(
      'room_code', NEW.room_code,
      'event', TG_OP,
      'data', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle player updates
CREATE OR REPLACE FUNCTION handle_player_update()
RETURNS TRIGGER AS $$
DECLARE
  room_code_val VARCHAR(6);
BEGIN
  -- Get room code for the player
  SELECT gr.room_code INTO room_code_val
  FROM game_rooms gr
  WHERE gr.id = COALESCE(NEW.room_id, OLD.room_id);

  -- Notify all clients in the room about player updates
  PERFORM pg_notify(
    'player_update',
    json_build_object(
      'room_code', room_code_val,
      'event', TG_OP,
      'data', CASE 
        WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        ELSE row_to_json(NEW)
      END
    )::text
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for real-time updates
DROP TRIGGER IF EXISTS room_update_trigger ON game_rooms;
CREATE TRIGGER room_update_trigger
  AFTER INSERT OR UPDATE OR DELETE ON game_rooms
  FOR EACH ROW EXECUTE FUNCTION handle_room_update();

DROP TRIGGER IF EXISTS player_update_trigger ON players;
CREATE TRIGGER player_update_trigger
  AFTER INSERT OR UPDATE OR DELETE ON players
  FOR EACH ROW EXECUTE FUNCTION handle_player_update();

-- Create function to get room with players
CREATE OR REPLACE FUNCTION get_room_with_players(room_code_param VARCHAR(6))
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'room', row_to_json(gr),
    'players', COALESCE(
      json_agg(
        json_build_object(
          'id', p.id,
          'nickname', p.nickname,
          'car_color', p.car_color,
          'score', p.score,
          'correct_answers', p.correct_answers,
          'is_ready', p.is_ready,
          'has_finished', p.has_finished,
          'joined_at', p.joined_at
        )
      ) FILTER (WHERE p.id IS NOT NULL),
      '[]'::json
    )
  ) INTO result
  FROM game_rooms gr
  LEFT JOIN players p ON gr.id = p.room_id
  WHERE gr.room_code = room_code_param
  GROUP BY gr.id, gr.room_code, gr.host_id, gr.quiz_category_id, 
           gr.question_count, gr.time_per_question, gr.current_phase,
           gr.started_at, gr.finished_at, gr.created_at, gr.updated_at;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to join room
CREATE OR REPLACE FUNCTION join_room(
  room_code_param VARCHAR(6),
  nickname_param VARCHAR(50),
  car_color_param VARCHAR(20)
)
RETURNS JSON AS $$
DECLARE
  room_id_val UUID;
  player_id_val UUID;
  result JSON;
BEGIN
  -- Get room ID
  SELECT id INTO room_id_val
  FROM game_rooms
  WHERE room_code = room_code_param AND current_phase = 'lobby';
  
  IF room_id_val IS NULL THEN
    RETURN json_build_object('error', 'Room not found or game already started');
  END IF;
  
  -- Insert new player
  INSERT INTO players (room_id, nickname, car_color)
  VALUES (room_id_val, nickname_param, car_color_param)
  RETURNING id INTO player_id_val;
  
  -- Return player data
  SELECT json_build_object(
    'id', id,
    'nickname', nickname,
    'car_color', car_color,
    'room_code', room_code_param
  ) INTO result
  FROM players
  WHERE id = player_id_val;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
