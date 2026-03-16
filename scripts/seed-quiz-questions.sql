-- Insert sample questions for General Knowledge category
WITH general_category AS (
    SELECT id FROM quiz_categories WHERE slug = 'general' LIMIT 1
)
INSERT INTO quiz_questions (category_id, question, options, correct_answer, difficulty, subcategory, points) VALUES
(
    (SELECT id FROM general_category),
    'What is the capital of France?',
    '["London", "Berlin", "Paris", "Madrid"]',
    2,
    'easy',
    'Geography',
    100
),
(
    (SELECT id FROM general_category),
    'Which planet is known as the Red Planet?',
    '["Venus", "Mars", "Jupiter", "Saturn"]',
    1,
    'easy',
    'Science',
    100
),
(
    (SELECT id FROM general_category),
    'Who painted the Mona Lisa?',
    '["Vincent van Gogh", "Leonardo da Vinci", "Pablo Picasso", "Michelangelo"]',
    1,
    'medium',
    'Art',
    150
),
(
    (SELECT id FROM general_category),
    'What is the largest mammal in the world?',
    '["African Elephant", "Blue Whale", "Giraffe", "Polar Bear"]',
    1,
    'easy',
    'Nature',
    100
),
(
    (SELECT id FROM general_category),
    'In which year did World War II end?',
    '["1944", "1945", "1946", "1947"]',
    1,
    'medium',
    'History',
    150
);

-- Insert sample questions for Science & Technology category
WITH science_category AS (
    SELECT id FROM quiz_categories WHERE slug = 'science' LIMIT 1
)
INSERT INTO quiz_questions (category_id, question, options, correct_answer, difficulty, subcategory, points) VALUES
(
    (SELECT id FROM science_category),
    'What does CPU stand for?',
    '["Central Processing Unit", "Computer Personal Unit", "Central Program Unit", "Computer Processing Unit"]',
    0,
    'easy',
    'Technology',
    100
),
(
    (SELECT id FROM science_category),
    'What is the speed of light in vacuum?',
    '["299,792,458 m/s", "300,000,000 m/s", "299,000,000 m/s", "298,792,458 m/s"]',
    0,
    'hard',
    'Physics',
    200
),
(
    (SELECT id FROM science_category),
    'Which programming language was created by Guido van Rossum?',
    '["Java", "Python", "C++", "JavaScript"]',
    1,
    'medium',
    'Programming',
    150
);

-- Insert sample questions for Sports category
WITH sports_category AS (
    SELECT id FROM quiz_categories WHERE slug = 'sports' LIMIT 1
)
INSERT INTO quiz_questions (category_id, question, options, correct_answer, difficulty, subcategory, points) VALUES
(
    (SELECT id FROM sports_category),
    'How many players are on a basketball team on the court at one time?',
    '["4", "5", "6", "7"]',
    1,
    'easy',
    'Basketball',
    100
),
(
    (SELECT id FROM sports_category),
    'In which sport would you perform a slam dunk?',
    '["Tennis", "Basketball", "Volleyball", "Baseball"]',
    1,
    'easy',
    'Basketball',
    100
),
(
    (SELECT id FROM sports_category),
    'How often are the Summer Olympic Games held?',
    '["Every 2 years", "Every 3 years", "Every 4 years", "Every 5 years"]',
    2,
    'easy',
    'Olympics',
    100
);
