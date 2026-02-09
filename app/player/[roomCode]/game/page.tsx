"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle, XCircle, X, Maximize2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { mysupa, supabase } from "@/lib/supabase"
import { motion, AnimatePresence } from "framer-motion"
import LoadingRetro from "@/components/loadingRetro"
import { useGlobalLoading } from "@/contexts/globalLoadingContext"
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
  image?: string | null
  answers: {
    answer: string
    image?: string | null
  }[]
  // correctAnswer tidak disimpan di client untuk keamanan
}

type GameMode = 'quiz' | 'racing';

const APP_NAME = "crazyrace"; // Safety check for multi-tenant DB

export default function QuizGamePage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.roomCode as string
  const { hideLoading } = useGlobalLoading();

  // ============ GAME MODE STATE ============
  const [gameMode, setGameMode] = useState<GameMode>('quiz');
  const [gameSrc, setGameSrc] = useState('/racing-game/v4.final.html');
  const [racingKey, setRacingKey] = useState(0); // Force iframe remount on each new race
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
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)

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
          setQuestions(parseQuizQuestions(prefetched.questions));
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
          hideLoading();
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
        const parsedQuestions = parseQuizQuestions(JSON.parse(cachedQuestions));

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
        hideLoading();
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
      const parsedQuestions = parseQuizQuestions(sess.current_questions || []);

      // 4. Simpan soal ke localStorage (TANPA jawaban - aman)
      localStorage.setItem(cachedQuestionsKey, JSON.stringify(sess.current_questions || []));

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
      hideLoading();

    } catch (err: any) {
      console.error("Fetch error:", err);
      setError("Gagal memuat game.");
    }
  }, [participantId, roomCode, router]);

  // Tambahkan di atas return (di dalam component)
  useEffect(() => {
    if (zoomedImage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedImage(null);
      }
    };

    window.addEventListener('keydown', handleEsc);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [zoomedImage]);

  // Helper function to create seeded random for consistent shuffle per player
  const seededRandom = (seed: string) => {
    // Simple hash function to convert string to number
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Linear congruential generator for random numbers
    return () => {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      return hash / 0x7fffffff;
    };
  };

  // Shuffle array using seeded random (consistent per participant)
  const seededShuffle = <T,>(array: T[], seed: string): T[] => {
    const shuffled = [...array];
    const random = seededRandom(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Helper function to parse questions from DB or Cache
  const parseQuizQuestions = (rawQuestions: any[]): QuizQuestion[] => {
    const parsed = rawQuestions.map((q: any) => ({
      id: q.id,
      question: q.question,
      image: q.image || null,
      answers: Array.isArray(q.answers)
        ? q.answers.map((a: any) => ({
          answer: typeof a === 'object' ? a.answer : a,
          image: typeof a === 'object' ? a.image : null
        }))
        : [],
      // options: Keeping types consistent by using 'answers' instead
    }));

    // ✅ Shuffle questions per player using participantId as seed
    // This ensures each player gets different order but consistent on reload
    if (participantId) {
      return seededShuffle(parsed, participantId);
    }
    return parsed;
  };

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
      setRacingKey(prev => prev + 1); // Force iframe remount to reset game state
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
    if (totalTimeRemaining <= 10) return "text-red-500 glow-red animate-pulse";
    if (totalTimeRemaining <= 20) return "text-[#ff6bff] glow-pink-subtle";
    return "text-[#00ffff] glow-cyan";
  };

  const isReady = !loading && !error && questions.length > 0 && gameStartTime && gameDuration > 0 && totalTimeRemaining > 0 && !!currentQuestion;

  if (!isReady) {
    return <LoadingRetro />;
  }

  return (
    <div className="min-h-screen relative">
      {/* ============ ZOOMED IMAGE MODAL ============ */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm"
            onClick={() => setZoomedImage(null)}
          >
            <div className="relative max-w-[50vw] w-full flex items-center justify-center p-8">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomedImage(null);
                }}
                className="absolute top-4 right-4 p-3 bg-black/70 rounded-full text-white hover:bg-white/20 z-50 transition-all backdrop-blur-sm"
                aria-label="Close Zoom"
              >
                <X className="w-4 h-4" />
              </button>

              {/* GAMBAR ZOOM - DIPAKSA BESAR MESKI RESOLUSI KECIL */}
              <img
                src={zoomedImage}
                alt="Zoomed"
                className="w-[70vw] object-contain rounded-2xl cursor-zoom-out select-none"
                onClick={(e) => e.stopPropagation()}
                draggable={false}

              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ QUIZ UI ============ */}
      <div className={gameMode === 'quiz' ? 'block' : 'hidden'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBgIndex}
            className="fixed inset-0 w-full h-full"
            style={{
              backgroundImage: `url(${backgroundGifs[currentBgIndex]})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />
        </AnimatePresence>
        <div className="relative z-10 max-w-7xl mx-auto pt-8 px-4 pb-20 h-screen">
          <div className="text-center">
            <Image src="/crazyrace-logo-utama.webp" alt="Crazy Race" width={200} height={80} sizes="200px" style={{ imageRendering: 'auto' }} className="h-auto mx-auto drop-shadow-xl" />
          </div>
          <Card className="bg-[#1a0a2a]/80 border-[#ff6bff]/50 pixel-card my-6 px-4 py-2 top-0 z-20">
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
          <Card className="bg-[#1a0a2a]/80 border-[#ff6bff]/50 pixel-card">
            <CardHeader className="text-center px-4">
              {/* Gambar pertanyaan (jika ada) */}
              {currentQuestion.image && (
                <div className="mb-4 w-full flex justify-center">
                  <div className="relative group cursor-zoom-in" onClick={() => setZoomedImage(currentQuestion.image || null)}>
                    <Image
                      src={currentQuestion.image}
                      alt="Question Image"
                      width={200}
                      height={100}
                      className="rounded-lg max-h-[150px] sm:max-h-[250px] w-auto object-contain border-2 border-[#ff6bff]/50 shadow-lg hover:borderColor-[#00ffff] transition-all"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="bg-black/50 p-2 rounded-full backdrop-blur-sm shadow-lg transform transition-transform group-hover:scale-110">
                        <Maximize2 className="w-6 h-6 text-[#00ffff]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                <h2 className="text-base md:text-lg text-[#00ffff] pixel-text leading-tight text-left whitespace-pre-wrap break-words px-2">
                  {currentQuestion.question}
                </h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.answers.map((option, index) => {
                  return (
                    <motion.button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={isAnswered}
                      className={`
                        p-3 sm:p-4 rounded-xl border-4 border-double transition-all duration-200 text-left bg-[#1a0a2a]/50 w-full overflow-hidden relative group
                        ${getOptionStyle(index)}
                        ${isAnswered ? 'cursor-default' : 'cursor-pointer'}
                      `}
                      whileHover={{ scale: isAnswered ? 1 : 1.01 }}
                      whileTap={{ scale: isAnswered ? 1 : 0.99 }}
                    >
                      <div className={`flex w-full ${option.image ? 'flex-col items-center gap-3' : 'flex-row items-center gap-2 sm:gap-3'}`}>
                        <div className={`
                          w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#ff6bff]/20 flex items-center justify-center font-bold text-[#ff6bff] pixel-text glow-pink-subtle flex-shrink-0 text-sm sm:text-base
                          ${option.image ? 'absolute top-3 left-3 z-10 bg-black/60' : ''}
                        `}>
                          {String.fromCharCode(65 + index)}
                        </div>

                        {/* Gambar Jawaban */}
                        {option.image && (
                          <div className="w-full flex justify-center py-1">
                            <div
                              className="relative rounded-lg overflow-hidden border border-[#ff6bff]/30 hover:border-[#00ffff] transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setZoomedImage(option.image || null);
                              }}
                            >
                              <Image
                                src={option.image}
                                alt={`Answer ${String.fromCharCode(65 + index)}`}
                                width={200}
                                height={150}
                                className="max-h-[100px] sm:max-h-[120px] md:max-h-[150px] w-auto object-contain hover:scale-105 transition-transform"
                                unoptimized
                              />
                            </div>
                          </div>
                        )}

                        {/* Teks jawaban - hanya tampilkan jika bukan placeholder titik */}
                        {(!option.image || (option.answer && option.answer !== ".")) && (
                          <span className={`text-xs md:text-sm text-white pixel-text glow-text break-words leading-tight flex-1 min-w-0 ${option.image ? 'text-center w-full' : ''}`}>
                            {option.answer}
                          </span>
                        )}
                      </div>
                    </motion.button>
                  )
                })}
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
          key={racingKey}
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
        .glow-red { filter: drop-shadow(0 0 10px rgba(255, 0, 0, 0.8)); }
        .glow-text { filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)); }
        .animate-neon-pulse { animation: neon-pulse 1.5s ease-in-out infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff6bff; border-radius: 3px; }
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
