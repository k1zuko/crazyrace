-- Create quiz categories table
CREATE TABLE IF NOT EXISTS quiz_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    slug VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quiz questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES quiz_categories(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of answer options
    correct_answer INTEGER NOT NULL, -- Index of correct answer (0-based)
    difficulty VARCHAR(10) CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
    time_limit INTEGER DEFAULT 60, -- Time limit in seconds
    points INTEGER DEFAULT 100,
    subcategory VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_id VARCHAR(100) NOT NULL, -- In real app, this would be a user ID
    quiz_category_id UUID REFERENCES quiz_categories(id),
    question_count INTEGER DEFAULT 10,
    time_per_question INTEGER DEFAULT 60,
    current_phase VARCHAR(20) CHECK (current_phase IN ('lobby', 'quiz', 'racing', 'finished')) DEFAULT 'lobby',
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    car_color VARCHAR(20) NOT NULL,
    score INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    current_question_index INTEGER DEFAULT 0,
    is_ready BOOLEAN DEFAULT false,
    has_finished BOOLEAN DEFAULT false,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quiz sessions table (tracks individual player progress)
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    question_id UUID REFERENCES quiz_questions(id),
    selected_answer INTEGER, -- Player's selected answer (can be null if not answered)
    is_correct BOOLEAN,
    time_taken INTEGER, -- Time taken to answer in seconds
    points_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_category ON quiz_questions(category_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON quiz_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON game_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_room_player ON quiz_sessions(room_id, player_id);

-- Insert sample quiz categories
INSERT INTO quiz_categories (name, description, slug) VALUES
('General Knowledge', 'Mixed topics for everyone', 'general'),
('Science & Technology', 'For the tech-savvy racers', 'science'),
('Sports', 'Athletic knowledge challenge', 'sports'),
('History', 'Past events and figures', 'history'),
('Geography', 'World knowledge and locations', 'geography'),
('Entertainment', 'Movies, music, and pop culture', 'entertainment')
ON CONFLICT (slug) DO NOTHING;
