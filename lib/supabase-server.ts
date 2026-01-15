import { createClient } from "@supabase/supabase-js"

// Server-side Supabase client (can be used in Server Components)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing SUPABASE_ANON_KEY");

// This client is safe to use in Server Components
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey);

// Fetch session data for settings page
export async function getSessionSettings(gamePin: string) {
    const { data: sessionData, error: sessionError } = await supabaseServer
        .from("game_sessions")
        .select("id, quiz_id, host_id, quiz_detail, total_time_minutes, question_limit, difficulty")
        .eq("game_pin", gamePin)
        .single();

    if (sessionError || !sessionData) {
        return { session: null, quiz: null, quizDetail: null, error: sessionError?.message || "Session not found" };
    }

    // Fetch quiz questions in parallel
    const { data: quizData, error: quizError } = await supabaseServer
        .from("quizzes")
        .select("questions")
        .eq("id", sessionData.quiz_id)
        .single();

    // Parse quiz_detail
    let quizDetail = null;
    if (sessionData.quiz_detail) {
        try {
            quizDetail = typeof sessionData.quiz_detail === 'string'
                ? JSON.parse(sessionData.quiz_detail)
                : sessionData.quiz_detail;
        } catch (e) {
            console.error("Error parsing quiz_detail:", e);
        }
    }

    return {
        session: sessionData,
        quizDetail,
        quiz: quizData || null,
        error: quizError?.message || null
    };
}
