// Server Component - Fetches data on the server before rendering
import SettingsForm from "./settings-form"
import { createGFSServer } from "@/lib/supabase/gfs-server"

type Props = {
  params: { roomCode: string }
}


async function getSessionSettings(gamePin: string) {
  const supabase = await createGFSServer();
  
  const { data: sessionData, error: sessionError } = await supabase
    .from("game_sessions")
    .select("id, quiz_id, host_id, quiz_detail, total_time_minutes, question_limit, difficulty")
    .eq("game_pin", gamePin)
    .single();

  if (sessionError || !sessionData) {
    return { session: null, quiz: null, quizDetail: null, error: sessionError?.message || "Session not found" };
  }

  // Fetch quiz questions in parallel
  const { data: quizData, error: quizError } = await supabase
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


export default async function HostSettingsPage({ params }: Props) {
  const roomCode = params.roomCode;

  // ✅ Data fetching happens on the SERVER - instant for the client!
  const initialData = await getSessionSettings(roomCode);

  // Pass pre-fetched data to Client Component
  return <SettingsForm roomCode={roomCode} initialData={initialData} />
}
