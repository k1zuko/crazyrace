-- =====================================================
-- RPC: get_quizzes_paginated
-- Pagination dengan offset + server-side filtering
-- =====================================================

-- Drop function lama jika ada
DROP FUNCTION IF EXISTS get_quizzes_paginated(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, INT);

-- Buat function baru
CREATE OR REPLACE FUNCTION get_quizzes_paginated(
  p_user_id TEXT DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_category_filter TEXT DEFAULT NULL,
  p_favorites_filter TEXT[] DEFAULT NULL,
  p_creator_filter TEXT DEFAULT NULL,
  p_limit INT DEFAULT 9,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  category TEXT,
  is_public BOOLEAN,
  created_at TIMESTAMPTZ,
  creator_id TEXT,
  question_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Hitung total dulu
  SELECT COUNT(*) INTO v_total
  FROM quizzes q
  WHERE 
    (q.is_public = true OR (p_user_id IS NOT NULL AND q.creator_id = p_user_id))
    AND (p_search_query IS NULL OR p_search_query = '' OR q.title ILIKE '%' || p_search_query || '%')
    AND (p_category_filter IS NULL OR p_category_filter = '' OR p_category_filter = 'All' OR q.category = p_category_filter)
    AND (p_favorites_filter IS NULL OR array_length(p_favorites_filter, 1) IS NULL OR q.id = ANY(p_favorites_filter))
    AND (p_creator_filter IS NULL OR p_creator_filter = '' OR q.creator_id = p_creator_filter);

  -- Return data dengan total_count
  RETURN QUERY
  SELECT 
    q.id,
    q.title,
    q.category,
    q.is_public,
    q.created_at,
    q.creator_id,
    jsonb_array_length(q.questions)::BIGINT as question_count,
    v_total as total_count
  FROM quizzes q
  WHERE 
    (q.is_public = true OR (p_user_id IS NOT NULL AND q.creator_id = p_user_id))
    AND (p_search_query IS NULL OR p_search_query = '' OR q.title ILIKE '%' || p_search_query || '%')
    AND (p_category_filter IS NULL OR p_category_filter = '' OR p_category_filter = 'All' OR q.category = p_category_filter)
    AND (p_favorites_filter IS NULL OR array_length(p_favorites_filter, 1) IS NULL OR q.id = ANY(p_favorites_filter))
    AND (p_creator_filter IS NULL OR p_creator_filter = '' OR q.creator_id = p_creator_filter)
  ORDER BY q.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Beri akses ke anon dan authenticated users
GRANT EXECUTE ON FUNCTION get_quizzes_paginated TO anon, authenticated;
