"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { mysupa, supabase } from "@/lib/supabase"
import { motion, AnimatePresence } from "framer-motion"
import LoadingRetro from "@/components/loadingRetro"
import { formatTime } from "@/utils/game"
import { syncServerTime, getSyncedServerTime } from "@/utils/serverTime"
import { generateXID } from "@/lib/id-generator"
import Image from "next/image"

// Background GIFs
const backgroundGifs = [
  "/assets/background/1.webp",
  "/assets/background/host/1.webp",
  "/assets/background/host/3.webp",
  "/assets/background/host/4.webp",
  "/assets/background/host/7.webp",
]

type QuizQuestion = {
  id: string
  question: string
  options: string[]
  // correctAnswer tidak disimpan di client untuk keamanan
}

type GameMode = 'quiz' | 'racing';

const APP_NAME = "crazyrace"; // Safety check for multi-tenant DB

export default function QuizGamePage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.roomCode as string

  // ============ GAME MODE STATE ============
  const [gameMode, setGameMode] = useState<GameMode>('quiz');
  const [gameSrc, setGameSrc] = useState('/racing-game/v4.final.html');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ============ QUIZ STATES ============
  const [participantId, setParticipantId] = useState<string>("")
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [totalTimeRemaining, setTotalTimeRemaining] = useState(0)
  const [isAnswered, setIsAnswered] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null) // Dari server setelah menjawab
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [currentBgIndex, setCurrentBgIndex] = useState(0)
  const [gameStartTime, setGameStartTime] = useState<number | null>(null)
  const [gameDuration, setGameDuration] = useState(0)
  const [session, setSession] = useState<any>(null);
  const sessionRef = useRef(session);
  const hasBootstrapped = useRef(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pendingAnswersRef = useRef<any[]>([]);
  const pendingScoreRef = useRef<number>(0);
  const pendingCorrectRef = useRef<number>(0);

  const currentQuestion = questions[currentQuestionIndex]
  const totalQuestions = questions.length

  useEffect(() => {
    // Sync time once on component load to get the offset
    syncServerTime();
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const pid = localStorage.getItem("participantId") || "";
    if (!pid) {
      router.replace(`/`);
      return;
    }
    setParticipantId(pid);
  }, [router])

  const fetchGameData = useCallback(async () => {
    if (!participantId || !roomCode) return;

    try {
      // ✅ 0. CEK PREFETCHED DATA dari sessionStorage (dari countdown prefetch)
      // HANYA gunakan jika belum pernah pakai (first load dari lobby)
      const prefetchKey = `prefetch_game_${roomCode}`;
      const hasUsedPrefetchKey = `hasUsedPrefetch_${roomCode}`;
      const prefetchedRaw = sessionStorage.getItem(prefetchKey);
      const hasUsedPrefetch = sessionStorage.getItem(hasUsedPrefetchKey);

      if (prefetchedRaw && !hasUsedPrefetch) {
        const prefetched = JSON.parse(prefetchedRaw);

        // Validasi freshness (max 60 detik)
        const age = Date.now() - prefetched.prefetchedAt;
        if (age < 60000 && prefetched.session?.status === "active") {
          // Clear prefetched data setelah dipakai (security + prevent reuse)
          sessionStorage.removeItem(prefetchKey);
          // ✅ Set flag bahwa prefetch sudah dipakai (untuk navigasi dari minigame)
          sessionStorage.setItem(hasUsedPrefetchKey, "true");

          // Cek completion
          const answeredCount = (prefetched.participant?.answers || []).length;
          if (prefetched.participant?.completion || answeredCount >= prefetched.questions.length) {
            router.replace(`/player/${roomCode}/result`);
            return;
          }

          // Set all states dari prefetched data
          setCurrentQuestionIndex(answeredCount);
          setSession(prefetched.session);
          setQuestions(prefetched.questions);
          setGameDuration((prefetched.session.total_time_minutes || 5) * 60);
          setGameStartTime(new Date(prefetched.session.started_at).getTime());

          // ✅ Set game source based on difficulty
          let src = '/racing-game/v4.final.html';
          switch (prefetched.session.difficulty) {
            case 'easy':
              src = '/racing-game/v1.straight.html';
              break;
            case 'normal':
              src = '/racing-game/v2.curves.html';
              break;
            case 'hard':
              src = '/racing-game/v4.final.html';
              break;
          }
          setGameSrc(src);

          // Cache questions ke localStorage untuk reload
          const cachedQuestionsKey = `quizQuestions_${roomCode}`;
          localStorage.setItem(cachedQuestionsKey, JSON.stringify(prefetched.questions));

          setLoading(false);
          return;
        } else {
          sessionStorage.removeItem(prefetchKey);
        }
      }

      // 1. CEK DULU apakah soal sudah ada di localStorage
      const cachedQuestionsKey = `quizQuestions_${roomCode}`;
      const cachedQuestions = localStorage.getItem(cachedQuestionsKey);

      if (cachedQuestions) {
        // Soal sudah tersimpan, gunakan dari cache
        const parsedQuestions = JSON.parse(cachedQuestions);

        // Ambil session info (timing, status, difficulty)
        const { data: sess, error } = await mysupa
          .from("sessions")
          .select("id, status, started_at, total_time_minutes, difficulty")
          .eq("game_pin", roomCode)
          .single();

        if (error || !sess || sess.status !== "active") {
          router.replace(`/player/${roomCode}/lobby`);
          return;
        }

        // ✅ Set game source based on difficulty
        let src = '/racing-game/v4.final.html';
        switch (sess.difficulty) {
          case 'easy':
            src = '/racing-game/v1.straight.html';
            break;
          case 'normal':
            src = '/racing-game/v2.curves.html';
            break;
          case 'hard':
            src = '/racing-game/v4.final.html';
            break;
        }
        setGameSrc(src);

        // Ambil participant untuk tahu index soal mana sekarang + racing status
        const { data: participant } = await mysupa
          .from("participants")
          .select("answers, completion, current_question, racing")
          .eq("id", participantId)
          .single();

        if (participant) {
          const answeredCount = (participant.answers || []).length;

          if (participant.completion || answeredCount >= parsedQuestions.length) {
            router.replace(`/player/${roomCode}/result`);
            return;
          }

          setCurrentQuestionIndex(answeredCount);

          // ✅ Restore racing mode jika player refresh saat sedang racing
          if (participant.racing) {
            setGameMode('racing');
          }
        }

        setSession(sess);
        setQuestions(parsedQuestions);
        setGameDuration((sess.total_time_minutes || 5) * 60);
        setGameStartTime(new Date(sess.started_at).getTime());
        setLoading(false);
        return;
      }

      // 2. Jika tidak ada di cache, fetch dari database (HANYA FIRST TIME)
      const { data: sess, error } = await mysupa
        .from("sessions")
        .select("id, status, started_at, total_time_minutes, current_questions, difficulty")
        .eq("game_pin", roomCode)
        .single();

      if (error || !sess || sess.status !== "active") {
        router.replace(`/player/${roomCode}/lobby`);
        return;
      }

      // ✅ Set game source based on difficulty
      let src = '/racing-game/v4.final.html';
      switch (sess.difficulty) {
        case 'easy':
          src = '/racing-game/v1.straight.html';
          break;
        case 'normal':
          src = '/racing-game/v2.curves.html';
          break;
        case 'hard':
          src = '/racing-game/v4.final.html';
          break;
      }
      setGameSrc(src);

      // 3. Parse questions TANPA correctAnswer (untuk keamanan)
      const parsedQuestions = (sess.current_questions || []).map((q: any) => ({
        id: q.id,
        question: q.question,
        options: q.answers.map((a: any) => a.answer),
        // correctAnswer TIDAK disimpan di client! Akan di-check via server
      }));

      // 4. Simpan soal ke localStorage (TANPA jawaban - aman)
      localStorage.setItem(cachedQuestionsKey, JSON.stringify(parsedQuestions));

      // 5. Ambil participant (termasuk racing status)
      const { data: participant } = await mysupa
        .from("participants")
        .select("answers, completion, current_question, racing")
        .eq("id", participantId)
        .single();

      // 6. CEK DULU sebelum setQuestions!
      if (participant) {
        const answeredCount = (participant.answers || []).length;

        if (participant.completion || answeredCount >= parsedQuestions.length) {
          router.replace(`/player/${roomCode}/result`);
          return;
        }

        // Baru set index setelah yakin tidak selesai
        setCurrentQuestionIndex(answeredCount);

        // ✅ Restore racing mode jika player refresh saat sedang racing
        if (participant.racing) {
          setGameMode('racing');
        }
      }

      // 7. SET SEMUA STATE (setelah semua pengecekan selesai)
      setSession(sess);
      setQuestions(parsedQuestions);
      setGameDuration((sess.total_time_minutes || 5) * 60);
      setGameStartTime(new Date(sess.started_at).getTime());
      setLoading(false);

    } catch (err: any) {
      console.error("Fetch error:", err);
      setError("Gagal memuat game.");
    }
  }, [participantId, roomCode, router]);


  useEffect(() => {
    if (participantId) {
      fetchGameData();
    }
  }, [participantId, fetchGameData]);

  // ✅ FIX: Wrap dengan useCallback untuk menghindari race condition
  const saveProgressAndRedirect = useCallback(async () => {
    if (pendingAnswersRef.current.length > 0) {
      await mysupa.rpc('submit_quiz_answer_batch', {
        p_participant_id: participantId,
        p_new_answers: pendingAnswersRef.current,
        p_total_score_add: pendingScoreRef.current,
        p_total_correct_add: pendingCorrectRef.current,
        p_next_index: totalQuestions,
        p_is_finished: true,
        p_is_racing: false
      });

      pendingAnswersRef.current = [];
    } else {
      await mysupa
        .from("participants")
        .update({
          completion: true,
          finished_at: new Date(getSyncedServerTime()).toISOString()
        })
        .eq("id", participantId);
    }

    // 🧹 Hapus cache soal dari localStorage setelah game selesai
    const cachedQuestionsKey = `quizQuestions_${roomCode}`;
    localStorage.removeItem(cachedQuestionsKey);

    router.push(`/player/${roomCode}/result`);
  }, [participantId, roomCode, router, totalQuestions]); // ✅ FIX: Added proper dependencies


  useEffect(() => {
    if (loading || !gameStartTime || gameDuration === 0) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      return;
    }

    const updateRemaining = () => {
      const elapsed = Math.floor((getSyncedServerTime() - gameStartTime) / 1000);
      const remaining = gameDuration - elapsed;
      setTotalTimeRemaining(Math.max(0, remaining));

      if (remaining <= 0) {
        saveProgressAndRedirect();
      }
    };

    updateRemaining();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(updateRemaining, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [gameStartTime, loading, gameDuration, saveProgressAndRedirect]);

  useEffect(() => {
    if (!roomCode || !saveProgressAndRedirect) return;

    const channel = mysupa
      .channel(`minigame-session-updates-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `game_pin=eq.${roomCode}`,
        },
        (payload) => {
          const newSession = payload.new as any;
          if (newSession.status === 'finished') {
            saveProgressAndRedirect();
          }
        }
      )
      .subscribe();

    return () => {
      mysupa.removeChannel(channel);
    };
  }, [roomCode, saveProgressAndRedirect]);

  useEffect(() => {
    const bgInterval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length);
    }, 5000);
    return () => clearInterval(bgInterval);
  }, []);

  // ============ RACING GAME MESSAGE HANDLER ============
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'racing_finished' || !participantId) return;

      try {
        // UPDATE LANGSUNG ke mysupa.participants → NO RPC!
        const { error } = await mysupa
          .from("participants")
          .update({ racing: false })
          .eq("id", participantId);

        if (error) throw error;

        // ✅ INSTANT: Switch back to quiz mode (no navigation!)
        setGameMode('quiz');
        setSelectedAnswer(null);
        setIsAnswered(false);
        setShowResult(false);
        setCorrectAnswerIndex(null);
      } catch (err) {
        console.error("Gagal update racing status:", err);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [participantId]);

  // Focus iframe when in racing mode
  useEffect(() => {
    if (gameMode === 'racing' && iframeRef.current) {
      iframeRef.current.contentWindow?.focus();
    }
  }, [gameMode]);

  const handleAnswerSelect = async (answerIndex: number) => {
    if (isAnswered || !currentQuestion || !participantId) return;

    setIsAnswered(true);
    setSelectedAnswer(answerIndex);

    const nextIndex = currentQuestionIndex + 1;
    const isFinished = nextIndex >= totalQuestions;
    const isRacing = nextIndex % 3 === 0 && !isFinished;
    const scorePerQuestion = Math.max(1, Math.floor(100 / totalQuestions));

    try {
      // Panggil RPC dengan jawaban - server akan return isCorrect dan correctAnswer
      const serverTask = mysupa.rpc('submit_quiz_answer_secure', {
        p_participant_id: participantId,
        p_question_id: currentQuestion.id,
        p_answer_index: answerIndex,
        p_score_per_question: scorePerQuestion,
        p_next_index: nextIndex,
        p_is_finished: isFinished,
        p_is_racing: isRacing,
        p_pending_answers: pendingAnswersRef.current,
        p_pending_score: pendingScoreRef.current,
        p_pending_correct: pendingCorrectRef.current
      });

      const timeoutTask = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request Timeout")), 3000)
      );

      const result = await Promise.race([serverTask, timeoutTask]);
      const { is_correct, correct_answer } = (result as any).data || {};

      // Set correctAnswer dari server untuk tampilan
      setCorrectAnswerIndex(correct_answer);
      setShowResult(true);

      // Clear pending
      pendingAnswersRef.current = [];
      pendingScoreRef.current = 0;
      pendingCorrectRef.current = 0;

      // Delay sebelum navigasi agar player lihat hasil
      await new Promise(resolve => setTimeout(resolve, 500));
      navigateNext(nextIndex, isFinished, isRacing);
    } catch (err: any) {
      console.warn("⚠️ Gagal kirim (Timeout/Error), simpan ke pending:", err);

      // Simpan ke pending untuk dikirim nanti
      const newAnswer = {
        id: generateXID(),
        question_id: currentQuestion.id,
        answer_id: String(answerIndex),
        correct: null, // Tidak tahu benar/salah, akan di-resolve server
      };
      pendingAnswersRef.current = [...pendingAnswersRef.current, newAnswer];

      // Tidak tampilkan hasil karena tidak tahu jawaban benar
      setShowResult(false);
      navigateNext(nextIndex, isFinished, isRacing);
    }
  };

  const navigateNext = (nextIndex: number, isFinished: boolean, isRacing: boolean) => {
    if (isFinished) {
      saveProgressAndRedirect();
    } else if (isRacing) {
      // ✅ INSTANT: Switch to racing mode (no navigation!)
      setCurrentQuestionIndex(nextIndex);
      setGameMode('racing');
    } else {
      setCurrentQuestionIndex(nextIndex);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setShowResult(false);
      setCorrectAnswerIndex(null); // Reset correctAnswer untuk soal baru
    }
  };

  const getOptionStyle = (optionIndex: number) => {
    if (!showResult || correctAnswerIndex === null) {
      return selectedAnswer === optionIndex
        ? "border-[#00ffff] bg-[#00ffff]/10 animate-neon-pulse"
        : "border-[#ff6bff]/70 hover:border-[#ff6bff] hover:bg-[#ff6bff]/10 hover:scale-[1.01] glow-pink-subtle";
    }
    // Gunakan correctAnswerIndex dari server, bukan dari local
    if (optionIndex === selectedAnswer) {
      return optionIndex === correctAnswerIndex
        ? "border-[#00ff00] bg-[#00ff00]/10 text-[#00ff00] glow-green" // BENAR: Hijau
        : "border-red-500 bg-red-500/10 text-red-500"; // SALAH: Merah
    }
    return "border-[#ff6bff]/50 bg-[#1a0a2a]/50 opacity-60";
  };

  const getTimeColor = () => {
    if (totalTimeRemaining <= 10) return "text-red-500";
    if (totalTimeRemaining <= 20) return "text-[#ff6bff] glow-pink-subtle";
    return "text-[#00ffff] glow-cyan";
  };

  const isReady = !loading && !error && questions.length > 0 && gameStartTime && gameDuration > 0 && totalTimeRemaining > 0 && !!currentQuestion;

  if (!isReady) {
    return <LoadingRetro />;
  }

  return (
    <div className="min-h-screen bg-[#1a0a2a] relative overflow-hidden">
      {/* ============ QUIZ UI ============ */}
      <div className={gameMode === 'quiz' ? 'block' : 'hidden'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBgIndex}
            className="absolute inset-0 w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundGifs[currentBgIndex]})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />
        </AnimatePresence>
        <div className="relative z-10 max-w-7xl mx-auto pt-8 px-4">
          <div className="text-center">
            <Image src="/crazyrace-logo-utama.png" alt="Crazy Race" width={200} height={80} style={{ imageRendering: 'auto' }} className="h-auto mx-auto drop-shadow-xl" />
          </div>
          <Card className="bg-[#1a0a2a]/40 border-[#ff6bff]/50 pixel-card my-8 px-4 py-2">
            <CardContent className="px-0">
              <div className="flex sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <Clock className={`h-5 w-5 sm:h-7 sm:w-7 md:h-8 md:w-8 lg:h-10 lg:w-10 ${getTimeColor()}`} />
                  <div>
                    <div className={`text-base sm:text-xl md:text-2xl lg:text-3xl font-bold ${getTimeColor()}`}>
                      {formatTime(totalTimeRemaining)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center">
                  <Badge className="bg-[#1a0a2a]/50 border-[#00ffff] text-[#00ffff] px-3 sm:px-4 sm:py-2 text-base sm:text-lg md:text-xl lg:text-2xl pixel-text glow-cyan">
                    {(currentQuestionIndex + 1) > totalQuestions ? totalQuestions : (currentQuestionIndex + 1)}/{totalQuestions}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#1a0a2a]/40 border-[#ff6bff]/50 pixel-card">
            <CardHeader className="text-center pb-4 px-4">
              <div className="max-h-[200px] overflow-y-auto"> {/* <-- ini yang penting */}
                <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-[#00ffff] pixel-text glow-cyan leading-tight text-balance whitespace-pre-wrap break-words px-2">
                  {currentQuestion.question}
                </h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, index) => (
                  <motion.button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={isAnswered}
                    className={`p-3 sm:p-4 rounded-xl border-4 border-double transition-all duration-200 text-left bg-[#1a0a2a]/50 w-full overflow-hidden ${getOptionStyle(index)}`}
                    whileHover={{ scale: isAnswered ? 1 : 1.01 }}
                    whileTap={{ scale: isAnswered ? 1 : 0.99 }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 w-full">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#ff6bff]/20 flex items-center justify-center font-bold text-[#ff6bff] pixel-text glow-pink-subtle flex-shrink-0 text-sm sm:text-base">
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span className="text-sm sm:text-base md:text-lg font-medium text-white pixel-text glow-text break-words leading-tight flex-1 min-w-0">{option}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============ RACING GAME (ALWAYS MOUNTED, TOGGLE VISIBILITY) ============ */}
      <div className={`w-full h-screen absolute inset-0 ${gameMode === 'racing' ? 'block z-50' : 'hidden'}`}>
        {/* Timer overlay for racing */}
        {gameMode === 'racing' && totalTimeRemaining > 0 && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-4 py-2 rounded-lg text-lg font-bold shadow-lg ${getTimeColor()}`}>
            {formatTime(totalTimeRemaining)}
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={gameSrc}
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin"
          title="Racing Game"
          className="z-0"
        />
      </div>

      <style jsx>{`
        .pixel-text { image-rendering: pixelated; text-shadow: 2px 2px 0px #000; }
        .pixel-card { box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 107, 255, 0.3); }
        .glow-cyan { filter: drop-shadow(0 0 10px #00ffff); }
        .glow-pink-subtle { animation: neon-pulse-pink 1.5s ease-in-out infinite; }
        .glow-green { filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.8)); }
        .glow-text { filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)); }
        .animate-neon-pulse { animation: neon-pulse 1.5s ease-in-out infinite; }
        @keyframes neon-pulse {
          0%, 100% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.7), 0 0 20px rgba(0, 255, 255, 0.5); }
          50% { box-shadow: 0 0 15px rgba(0, 255, 255, 1), 0 0 30px rgba(0, 255, 255, 0.8); }
        }
        @keyframes neon-pulse-pink {
          0%, 100% { box-shadow: 0 0 10px rgba(255, 107, 255, 0.7), 0 0 20px rgba(255, 107, 255, 0.5); }
          50% { box-shadow: 0 0 15px rgba(255, 107, 255, 1), 0 0 30px rgba(255, 107, 255, 0.8); }
        }
      `}</style>


      {isFinalizing && (
        <div className="absolute inset-0 bg-[#1a0a2a]/80 flex items-center justify-center z-50">
          <LoadingRetro />
        </div>
      )}
    </div>
  )
}
