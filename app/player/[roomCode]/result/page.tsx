"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Home } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { mysupa, supabase } from "@/lib/supabase"
import LoadingRetro from "@/components/loadingRetro"
import { breakOnCaps } from "@/utils/game"
import Image from "next/image"
import { t } from "i18next"


// Background GIFs
const backgroundGifs = [
  "/assets/background/host/10.webp",
]

// Car GIF mappings
const carGifMap: Record<string, string> = {
  purple: "/assets/car/car1_v2.webp",
  white: "/assets/car/car2_v2.webp",
  black: "/assets/car/car3_v2.webp",
  aqua: "/assets/car/car4_v2.webp",
  blue: "/assets/car/car5_v2.webp",
}

type PlayerStats = {
  nickname: string
  car: string
  finalScore: number
  correctAnswers: number
  totalQuestions: number
  accuracy: string
  totalTime: string
  participantId: string
}

export default function PlayerResultsPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.roomCode as string
  const [participantId, setParticipantId] = useState<string>("");

  const [loading, setLoading] = useState(true)
  const [currentPlayerStats, setCurrentPlayerStats] = useState<PlayerStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentBgIndex, setCurrentBgIndex] = useState(0)
  const hasBootstrapped = useRef(false);

  useEffect(() => {
    const pid = localStorage.getItem("participantId") || "";
    if (!pid) {
      router.replace(`/`);
      return;
    }
    setParticipantId(pid);
  }, [router]);

  useEffect(() => {
    if (!roomCode || !participantId || hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    const setupInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Ambil session dari mysupa (cuma buat ambil total soal & waktu)
        const { data: sess, error: sessErr } = await mysupa
          .from("sessions")
          .select("question_limit, total_time_minutes, current_questions")
          .eq("game_pin", roomCode)
          .single();

        if (sessErr || !sess) throw new Error("Session tidak ditemukan");

        const totalQuestions = sess.question_limit || (sess.current_questions || []).length;
        const gameDuration = (sess.total_time_minutes || 5) * 60;

        // 2. Ambil data player dari mysupa.participants
        const { data: participant, error: partErr } = await mysupa
          .from("participants")
          .select("nickname, car, score, correct, completion, duration")
          .eq("id", participantId)
          .single();

        if (partErr || !participant) throw new Error("Data kamu tidak ditemukan");

        // 3. Hitung statistik
        const correctCount = participant.correct || 0;
        const finalScore = participant.score || 0;

        // Hitung akurasi
        const accuracy = totalQuestions > 0
          ? ((correctCount / totalQuestions) * 100).toFixed(2)
          : "0.00";

        // Format waktu (duration di-save di minigame atau dihitung dari timer)
        const totalSeconds = Math.min(participant.duration || 0, gameDuration);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const totalTime = `${mins}:${secs.toString().padStart(2, "0")}`;

        setCurrentPlayerStats({
          nickname: participant.nickname,
          car: participant.car || "blue",
          finalScore,
          correctAnswers: correctCount,
          totalQuestions,
          accuracy,
          totalTime,
          participantId,
        });

        setLoading(false);
      } catch (err: any) {
        console.error("Error load result:", err);
        setError("Gagal memuat hasil. Coba refresh.");
        setLoading(false);
      }
    };

    setupInitialData();

    return () => {
      hasBootstrapped.current = false;
    };
  }, [roomCode, participantId]);


  // Background cycling
  useEffect(() => {
    const bgInterval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length)
    }, 5000)
    return () => clearInterval(bgInterval)
  }, [])

  if (loading || error || !currentPlayerStats) {
    return (
      <LoadingRetro />
    )
  }

  const formatAccuracy = (value: string | number) =>
    parseFloat(Number(value).toFixed(2)).toString();


  const { finalScore, correctAnswers, totalQuestions, accuracy, totalTime, nickname, car } = currentPlayerStats

  return (
    <div className="min-h-screen bg-[#1a0a2a] relative overflow-hidden">

      {/* Background */}
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

      <h1 className="absolute top-5 right-10 hidden md:block">
        <Image
          src="/gameforsmart-logo.png"
          alt="Gameforsmart Logo"
          width={300}
          height={100}
        />
      </h1>

      <div className="absolute top-4 left-4 hidden md:block">
        <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto p-4">
        {/* <div className="block md:hidden w-full flex justify-center mx-auto">
          <Image
            src="/crazyrace-logo-utama.png"
            alt="Crazy Race"
            width={150}
            height={50}
            style={{ imageRendering: 'auto' }}
            className="h-auto drop-shadow-xl"
          />
        </div> */}

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center pb-4 sm:pb-5"
        >
          <div className="inline-block p-4 md:pt-14">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#ffefff] pixel-text glow-pink">
              {t('joinresult.title')}
            </h1>
          </div>
        </motion.div>

        {/* Main Result Card */}
        <motion.div
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <Card className="bg-[#1a0a2a]/60 border-[#ff6bff]/40 backdrop-blur-xs pixel-card p-7 md:p-10 mb-4 text-center animate-neon-pulse-pink">
            <div className="flex flex-col items-center justify-center space-x-2">
              <img
                src={carGifMap[car] || '/assets/car/car5_v2.webp'}
                alt={`${car} car`}
                className="h-28 w-40 mx-auto object-contain animate-neon-bounce filter brightness-125 contrast-150"
              />
            </div>
            <h2 className="text-2xl md:text-4xl font-bold text-white pixel-text glow-text ">{breakOnCaps(nickname)}</h2>
          </Card>
        </motion.div>

        {/* Detailed Stats */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4"
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <Card className="p-5 text-center bg-[#1a0a2a]/10 border-[#00ffff]/70 backdrop-blur-xs pixel-card">
            <div className="text-xl font-bold text-[#00ffff] mb-1 pixel-text glow-cyan">
              {correctAnswers}/{totalQuestions}
            </div>
            <div className="text-xs text-[#ff6bff] pixel-text">{t('joinresult.correct')}</div>
          </Card>
          <Card className="p-5 text-center bg-[#1a0a2a]/10 border-[#00ffff]/70 backdrop-blur-xs pixel-card">
            <div className="text-xl font-bold text-[#00ffff] mb-1 pixel-text glow-cyan">
              {finalScore}
            </div>
            <div className="text-xs text-[#ff6bff] pixel-text">{t('joinresult.score')}</div>
          </Card>
          <Card className="p-5 text-center bg-[#1a0a2a]/10 border-[#00ffff]/70 backdrop-blur-xs pixel-card">
            <div className="text-xl font-bold text-[#00ffff] mb-1 pixel-text glow-cyan">{totalTime}</div>
            <div className="text-xs text-[#ff6bff] pixel-text">{t('joinresult.time')}</div>
          </Card>
          <Card className="p-5 text-center bg-[#1a0a2a]/10 border-[#00ffff]/70 backdrop-blur-xs pixel-card">
            <div className="text-xl font-bold text-[#00ffff] mb-1 pixel-text glow-cyan">{formatAccuracy(accuracy)}%</div>
            <div className="text-xs text-[#ff6bff] pixel-text">{t('joinresult.accuracy')}</div>
          </Card>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex flex-row gap-2 justify-center mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <Button
            size="lg"
            variant="outline"
            className="bg-[#1a0a2a]/80 border-[#00ffff] text-[#00ffff] pixel-button glow-cyan hover:bg-[#00ffff]/70"
            onClick={() => router.push('/')}
          >
            <Home size={70} className="h-10 w-10" />
          </Button>
        </motion.div>
      </div>

      <style jsx>{`
        .pixel-text {
          image-rendering: pixelated;
          text-shadow: 2px 2px 0px #000;
        }
        .pixel-card {
          box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 107, 255, 0.3);
        }
        .pixel-button {
          image-rendering: pixelated;
          box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
          transition: all 0.1s ease;
        }
        .pixel-button:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.8);
        }
        .crt-effect {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
          background-size: 100% 4px;
          z-index: 5;
          pointer-events: none;
          animation: scanline 8s linear infinite;
        }
        .noise-effect {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url("data:image/svg+xml,%3Csvg%20viewBox%3D%270%200%20200%20200%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cfilter%20id%3D%27noiseFilter%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.65%27%20numOctaves%3D%273%27%20stitchTiles%3D%27stitch%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url(%23noiseFilter)%27%20opacity%3D%270.1%27%2F%3E%3C%2Fsvg%3E");
          z-index: 4;
          pointer-events: none;
        }
        .glow-cyan {
          filter: drop-shadow(0 0 10px #00ffff);
        }
        .glow-pink {
          filter: drop-shadow(0 0 10px #ff6bff);
        }
        .glow-yellow {
          filter: drop-shadow(0 0 10px #ffd700);
        }
        .glow-text {
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
        }
        @keyframes scanline {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
        @keyframes neon-pulse-pink {
          0%, 100% { box-shadow: 0 0 10px rgba(255, 107, 255, 0.7), 0 0 20px rgba(255, 107, 255, 0.5); }
          50% { box-shadow: 0 0 15px rgba(255, 107, 255, 1), 0 0 30px rgba(255, 107, 255, 0.8); }
        }
        @keyframes neon-glow {
          0%, 100% { 
            filter: drop-shadow(0 0 5px #00ffff) drop-shadow(0 0 10px #00ffff) drop-shadow(0 0 15px #00ffff) drop-shadow(0 0 20px #00ffff);
            text-shadow: 2px 2px 0px #000, 0 0 10px #00ffff;
          }
          50% { 
            filter: drop-shadow(0 0 10px #00ffff) drop-shadow(0 0 20px #00ffff) drop-shadow(0 0 30px #00ffff) drop-shadow(0 0 40px #00ffff);
            text-shadow: 2px 2px 0px #000, 0 0 20px #00ffff, 0 0 30px #00ffff;
          }
        }
        .animate-neon-pulse-pink {
          animation: neon-pulse-pink 2s ease-in-out infinite;
        }
        .animate-neon-glow {
          animation: neon-glow 2s ease-in-out infinite;
        }
      `}</style>

    </div>
  )
}