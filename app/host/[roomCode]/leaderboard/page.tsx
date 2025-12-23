"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { mysupa, supabase } from "@/lib/supabase"
import { breakOnCaps } from "@/utils/game"
import Image from "next/image"
import { HomeIcon, RotateCwIcon } from "lucide-react"
import { generateGamePin } from "../../page"
import { shuffleArray } from "../settings/page"
import { useAuth } from "@/contexts/authContext"
import { t } from "i18next"
import { useHostGuard } from "@/lib/host-guard"

const APP_NAME = "crazyrace"; // Safety check for multi-tenant DB

type PlayerStats = {
  nickname: string
  car: string
  finalScore: number
  correctAnswers: number
  totalQuestions: number
  accuracy: number
  totalTime: string
  rank: number
  duration: number
}

// Background GIFs (reuse from player results)
const backgroundGifs = [
  "/assets/background/host/10.webp",
]

const carGifMap: Record<string, string> = {
  purple: "/assets/car/car1_v2.webp",
  white: "/assets/car/car2_v2.webp",
  black: "/assets/car/car3_v2.webp",
  aqua: "/assets/car/car4_v2.webp",
  blue: "/assets/car/car5_v2.webp",
}

export default function HostLeaderboardPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  // Security: Verify host access
  useHostGuard(roomCode);

  const [loading, setLoading] = useState(true);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [session, setSession] = useState<any>(null); // TAMBAHKAN INI DI ATAS

  const computePlayerStats = (response: any, totalQuestions: number): Omit<PlayerStats, 'nickname' | 'car' | 'rank'> => {
    const stats = response || {};
    const correctAnswers = stats.correct || 0;
    const accuracy = parseFloat(stats.accuracy) || (totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0);
    const totalSeconds = stats.duration || 0;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const totalTime = `${mins}:${secs.toString().padStart(2, '0')}`;
    const finalScore = stats.score || (correctAnswers * 10);

    return { finalScore, correctAnswers, totalQuestions, accuracy, totalTime, duration: totalSeconds };
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Ambil session dari mysupa
      const { data: sess, error: sessErr } = await mysupa
        .from("sessions")
        .select("id, question_limit, current_questions")
        .eq("game_pin", roomCode)
        .single();

      if (sessErr || !sess) throw new Error("Session tidak ditemukan");

      setSession(sess);

      const totalQuestions = sess.question_limit || (sess.current_questions || []).length;

      // 2. Ambil semua participant yang completion = true
      const { data: participants, error: partErr } = await mysupa
        .from("participants")
        .select("id, nickname, car, score, correct, answers, duration, completion")
        .eq("session_id", sess.id)
        .eq("completion", true);

      if (partErr || !participants || participants.length === 0) {
        setError("Belum ada yang selesai");
        setLoading(false);
        return;
      }

      // 3. Hitung statistik
      const stats = participants.map(p => {
        const correctCount = p.correct || 0;
        const accuracy = totalQuestions > 0
          ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
          : 0;

        const totalSeconds = p.duration || 9999; // kalau duration 0 → urutan belakang
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const totalTime = `${mins}:${secs.toString().padStart(2, "0")}`;

        return {
          participantId: p.id,
          nickname: p.nickname,
          car: p.car || "blue",
          finalScore: p.score || 0,
          correctAnswers: correctCount,
          totalQuestions,
          accuracy,
          totalTime,
          duration: totalSeconds,
        };
      });

      // 4. Urutkan: skor tinggi → waktu cepat
      const sorted = stats.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return a.duration - b.duration; // waktu lebih cepat = lebih baik
      });

      const ranked = sorted.map((s, i) => ({ ...s, rank: i + 1 }));
      setPlayerStats(ranked);

    } catch (err: any) {
      console.error("Error load leaderboard:", err);
      setError("Gagal memuat leaderboard");
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  const handleRealtimeUpdate = (payload: any) => {
    const p = payload.new || payload.old;

    // Kalau player selesai (completion: true)
    if (payload.eventType === "INSERT" ||
      (payload.eventType === "UPDATE" && (p.completion || payload.new.completion))) {
      const totalQuestions = session?.question_limit || (session?.current_questions || []).length;

      const accuracy = totalQuestions > 0
        ? Number(((p.correct || 0) / totalQuestions) * 100).toFixed(2)
        : "0";

      const totalSeconds = p.duration || 9999;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const totalTime = `${mins}:${secs.toString().padStart(2, "0")}`;

      const newPlayer = {
        participantId: p.id,
        nickname: p.nickname,
        car: p.car || "blue",
        finalScore: p.score || 0,
        correctAnswers: p.correct || 0,
        totalQuestions,
        accuracy: Number(accuracy),
        totalTime,
        duration: totalSeconds,
      };

      setPlayerStats(prev => {
        const filtered = prev.filter((x: any) => x.participantId !== p.id);
        const updated = [...filtered, newPlayer];

        // Sort ulang
        const sorted = updated.sort((a, b) => {
          if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
          return a.duration - b.duration;
        });

        return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
      });
    }

    // Kalau player dihapus (jarang)
    if (payload.eventType === "DELETE") {
      setPlayerStats(prev => prev.filter((x: any) => x.participantId !== payload.old.id));
    }
  };

  useEffect(() => {
    if (roomCode) fetchData();
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !session?.id) return;

    const channel = mysupa
      .channel(`leaderboard-${roomCode}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "participants",
        filter: `session_id=eq.${session.id}`
      }, (payload) => {
        // JANGAN fetchData() → GUNAKAN payload LANGSUNG!
        handleRealtimeUpdate(payload);
      })
      .subscribe();

    return () => {
      mysupa.removeChannel(channel)
    };
  }, [roomCode, session?.id]);

  // Background
  useEffect(() => {
    const bgInterval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length);
    }, 5000);
    return () => clearInterval(bgInterval);
  }, []);

  const restartGame = async () => {
    try {
      // 1. Ambil session lama dari mysupa
      const { data: oldSess } = await mysupa
        .from("sessions")
        .select("quiz_id, host_id, question_limit, total_time_minutes, difficulty, current_questions")
        .eq("game_pin", roomCode)
        .single();

      if (!oldSess) throw new Error("Session lama tidak ditemukan");

      // 2. Shuffle questions
      const questions = oldSess.current_questions || [];
      const shuffled = shuffleArray(questions);
      const sliced = shuffled.slice(0, oldSess.question_limit || 5);

      // 3. Generate PIN baru
      const newPin = generateGamePin(6);

      // 4. BUAT SESSION BARU DI mysupa (real-time gameplay)
      const { error: mysupaError } = await mysupa
        .from("sessions")
        .insert({
          game_pin: newPin,
          quiz_id: oldSess.quiz_id,
          host_id: oldSess.host_id, // PENTING: tanpa ini host guard akan redirect!
          status: "waiting",
          question_limit: oldSess.question_limit,
          total_time_minutes: oldSess.total_time_minutes,
          difficulty: oldSess.difficulty,
          current_questions: sliced,
        });

      if (mysupaError) throw mysupaError;

      // 5. BUAT SESSION BARU DI supabase UTAMA (agar bisa join!)
      const { error: mainError } = await supabase
        .from("game_sessions")
        .insert({
          game_pin: newPin,
          quiz_id: oldSess.quiz_id,
          host_id: oldSess.host_id,
          status: "waiting",
          application: "crazyrace",
          total_time_minutes: oldSess.total_time_minutes || 5,
          question_limit: oldSess.question_limit?.toString() || "5",
          difficulty: oldSess.difficulty,
          current_questions: sliced,
          participants: [],
          responses: [],
        });

      if (mainError) {
        console.error("Gagal buat di supabase utama:", mainError);
        throw mainError
      }

      console.log("Restart berhasil! PIN baru:", newPin);
      router.push(`/host/${newPin}`);

    } catch (err: any) {
      console.error("Restart gagal:", err);
      alert("Gagal restart game: " + err.message);
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return "text-yellow-400 glow-gold";
      case 2: return "text-gray-300 glow-silver";
      case 3: return "text-amber-600 glow-bronze";
      default: return "text-[#00ffff]";
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#1a0a2a] relative overflow-hidden">
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
      </div>
    );
  }

  if (error || playerStats.length === 0) {
    return (
      <div className="h-screen bg-[#1a0a2a] relative overflow-hidden">
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
        <div className="relative z-10 max-w-4xl mx-auto p-4 text-center flex items-center justify-center h-screen">
          <Card className="bg-[#1a0a2a]/60 border-[#ff6bff]/50 pixel-card p-6">
            <h1 className="text-xl font-bold mb-2 text-[#00ffff] pixel-text glow-cyan">{t('resulthost.notAvailable')}</h1>
            <p className="text-[#ff6bff] mb-4 pixel-text">{error || t('resulthost.noDataFound')}</p>
            <Button
              className="bg-[#ff6bff] pixel-button glow-pink"
              onClick={() => router.push('/')}
            >
              {t('resulthost.backToHome')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const topThree = playerStats.slice(0, 3);
  const others = playerStats.slice(3);

  return (
    <div className="h-screen bg-[#1a0a2a] relative overflow-hidden">

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

      {/* Scrollable Content Wrapper */}
      <div className="absolute inset-0 overflow-y-auto z-10">
        {/* Header - Full width, ikut scroll */}
        <div className="w-full px-4 py-4 pb-0 flex items-center justify-between">
          {/* Left side: Crazy Race logo */}
          <div className="flex items-center gap-4">
            <div className="hidden md:block">
              <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
            </div>
          </div>

          {/* Right side: Gameforsmart logo */}
          <div className="hidden md:block">
            <Image src="/gameforsmart-logo.png" alt="Gameforsmart Logo" width={300} height={100} />
          </div>
        </div>

        <div className="relative max-w-5xl mx-auto p-4 pb-20 md:pb-0 pt-0">

          <div className="block md:hidden w-full flex justify-center mx-auto">
            <Image
              src="/crazyrace-logo-utama.png"
              alt="Crazy Race"
              width={200}
              height={50}
              style={{ imageRendering: 'auto' }}
              className="h-auto drop-shadow-xl"
            />
          </div>

          <div className="text-center py-4">
            <motion.h1
              className="text-4xl md:text-5xl font-bold text-[#00ffff] pixel-text glow-cyan tracking-wider animate-neon-glow"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#ffefff] pixel-text glow-pink">{t('resulthost.title')}</span>
            </motion.h1>
          </div>

          {/* Podium - Top 3: Hidden on sm-, shown on md+ */}
          <motion.div
            className="hidden md:flex justify-center items-end gap-4 sm:gap-6 mb-8 sm:mb-12 h-[400px] lg:h-[475px] relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {/* 2nd Place - Left, medium height */}
            {topThree[1] && (
              <motion.div
                className="w-45 lg:w-64 order-1 flex flex-col justify-end h-[310px] lg:h-[400px]"
                initial={{ scale: 0.8, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <Card className="p-3 lg:p-6 text-center pixel-card border-gray-300/50 bg-[#1a0a2a]/70 animate-pulse-silver min-h-[160px] flex-1 flex flex-col justify-center">
                  <div className={`text-2xl lg:text-3xl font-bold mb-1 sm:mb-2 ${getRankColor(2)} pixel-text`}>#2</div>
                  <img
                    src={carGifMap[topThree[1].car] || '/assets/car/car5_v2.webp'}
                    alt={`${carGifMap[topThree[1].car]} car`}
                    className="w-20 lg:w-40 mx-auto object-contain animate-neon-bounce filter brightness-125 contrast-150"
                  />
                  <div className="text-xl lg:text-2xl font-bold text-[#00ffff] mb-1 sm:mb-2 pixel-text glow-cyan">{topThree[1].finalScore}</div>
                  <h3 className="text-base lg:text-xl font-bold text-white pixel-text glow-text break-words line-clamp-3">{breakOnCaps(topThree[1].nickname)}</h3>
                </Card>
              </motion.div>
            )}

            {/* 1st Place - Center, tallest podium */}
            {topThree[0] && (
              <motion.div
                className="w-50 lg:w-80 order-2 flex flex-col justify-end h-[350px] lg:h-[425px]"
                initial={{ scale: 0.9, y: 80 }}
                animate={{ scale: 1.1, y: 0 }}
                transition={{ duration: 1, delay: 0.3 }}
              >
                <Card className="p-3 lg:p-6 text-center pixel-card border-yellow-400/70 bg-[#1a0a2a]/80 animate-pulse-gold min-h-[200px] flex-1 flex flex-col justify-center">
                  <div className={`text-3xl lg:text-5xl font-bold mb-2 sm:mb-3 ${getRankColor(1)} pixel-text`}>#1</div>
                  <img
                    src={carGifMap[topThree[0].car] || '/assets/car/car5_v2.webp'}
                    alt={`${topThree[0].car} car`}
                    className="w-30 lg:w-40 mx-auto object-contain animate-neon-bounce filter brightness-125 contrast-150"
                  />
                  <div className="text-2xl lg:text-4xl font-bold text-[#00ffff] mb-2 pixel-text glow-cyan">{topThree[0].finalScore}</div>
                  <h3 className="text-xl lg:text-2xl font-bold text-white pixel-text glow-text break-words line-clamp-3">{breakOnCaps(topThree[0].nickname)}</h3>
                </Card>
              </motion.div>
            )}

            {/* 3rd Place - Right, shortest height */}
            {topThree[2] && (
              <motion.div
                className="w-45 lg:w-64 order-3 flex flex-col justify-end h-[275px] lg:h-[375px]"
                initial={{ scale: 0.8, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                <Card className="p-3 lg:p-6 text-center pixel-card border-amber-600/50 bg-[#1a0a2a]/70 animate-pulse-bronze min-h-[140px] flex-1 flex flex-col justify-center gap-4 lg:gap-6">
                  <div className={`text-xl lg:text-3xl font-bold mb-1 sm:mb-2 ${getRankColor(3)} pixel-text`}>#3</div>
                  <img
                    src={carGifMap[topThree[2].car] || '/assets/car/car5_v2.webp'}
                    alt={`${carGifMap[topThree[2].car]} car`}
                    className="w-20 lg:w-40 mx-auto object-contain animate-neon-bounce filter brightness-125 contrast-150"
                  />
                  <div className="text-xl lg:text-2xl font-bold text-[#00ffff] mb-1 sm:mb-2 pixel-text glow-cyan">{topThree[2].finalScore}</div>
                  <h3 className="text-base lg:text-lg font-bold text-white pixel-text glow-text break-words line-clamp-3">{breakOnCaps(topThree[2].nickname)}</h3>
                </Card>
              </motion.div>
            )}

          </motion.div>

          {/* Full List for sm- (all players) */}
          <motion.div
            className="flex md:hidden flex-col space-y-2 mb-6 mt-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <Card className="bg-[#1a0a2a]/60 border-[#ff6bff]/50 pixel-card p-3">
              <div className="space-y-1.5">
                {playerStats.map((player) => (
                  <div
                    key={player.nickname}
                    className="flex items-center justify-between px-3 py-2 bg-[#1a0a2a]/50 rounded-lg pixel-card"
                  >
                    {/* Rank + Nickname */}
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className={`text-sm font-bold ${getRankColor(player.rank)} pixel-text min-w-[22px]`}>
                        #{player.rank}
                      </div>
                      <h4 className="text-sm font-bold text-white pixel-text glow-text break-words line-clamp-2 flex-1 min-w-0 pl-1">
                        {breakOnCaps(player.nickname)}
                      </h4>
                    </div>

                    {/* Score */}
                    <div className="text-center min-w-[45px]">
                      <div className="font-bold text-sm text-[#00ffff] glow-cyan">
                        {player.finalScore}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>


          {/* Other Players List for md+ (ranks 4+) */}
          {others.length > 0 && (
            <motion.div
              className="hidden md:block"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              <Card className="bg-[#1a0a2a]/60 border-[#ff6bff]/50 pixel-card p-4 mb-4">
                <div className="space-y-2">
                  {others.map((player) => (
                    <div key={player.nickname} className="flex items-center justify-between px-4 py-3 bg-[#1a0a2a]/50 rounded-xl pixel-card">
                      <div className="flex items-center space-x-4">
                        <div className={`text-xl font-bold ${getRankColor(player.rank)} pixel-text`}>
                          #{player.rank}
                        </div>
                        <h4 className="text-lg font-bold text-white pixel-text glow-text break-words line-clamp-2 pl-1">{breakOnCaps(player.nickname)}</h4>
                      </div>
                      <div className="flex items-center space-x-6 text-sm">
                        <div className="text-center">
                          <div className="font-bold text-lg text-[#00ffff] glow-cyan">{player.finalScore}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* Actions Desktop (md ke atas) */}
          <motion.div
            className="hidden md:flex fixed mx-7 inset-y-0 left-0 right-0 justify-between items-center pointer-events-none z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
          >
            {/* Tombol Home */}
            <button
              onClick={() => router.push('/')}
              className="pointer-events-auto flex items-center justify-center w-12 h-12 rounded-full bg-[#1a0a2a]/70 border border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff]/20 transition-all duration-300 shadow-lg"
            >
              <HomeIcon className="w-6 h-6" />
            </button>

            {/* Tombol Restart */}
            <button
              onClick={restartGame}
              className="pointer-events-auto flex items-center justify-center w-12 h-12 rounded-full bg-[#ff6bff]/70 border border-white text-white hover:bg-[#ff8aff]/80 transition-all duration-300 shadow-lg"
            >
              <RotateCwIcon className="w-6 h-6" />
            </button>
          </motion.div>

          {/* Actions Mobile (sm ke bawah) */}
          <div className="md:hidden bg-[#1a0a2a]/50 backdrop-blur-sm w-full text-center py-2 fixed bottom-0 left-1/2 transform -translate-x-1/2 z-50 flex items-center justify-center space-x-3">
            {/* Tombol Home */}
            <button
              onClick={() => router.push('/')}
              className="bg-[#1a0a2a]/70 border border-[#00ffff] rounded-lg text-[#00ffff] px-4 py-2 text-sm hover:bg-[#00ffff]/20 transition-all duration-300"
            >
              {t('resulthost.home')}
            </button>

            {/* Tombol Restart */}
            <button
              onClick={restartGame}
              className="bg-[#ff6bff] border border-white rounded-lg text-white px-4 py-2 text-sm hover:bg-[#ff8aff]/80 transition-all duration-300"
            >
              {t('resulthost.restart')}
            </button>
          </div>


        </div>

        <style jsx>{`
        .pixel-text {
          image-rendering: pixelated;
          text-shadow: 2px 2px 0px #000;
        }
        .pixel-card {
          box-shadow: 0 0 20px rgba(255, 107, 255, 0.3);
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
        .glow-gold {
          filter: drop-shadow(0 0 15px #ffd700);
        }
        .glow-silver {
          filter: drop-shadow(0 0 12px #d1d5db);
        }
        .glow-bronze {
          filter: drop-shadow(0 0 12px #b45309);
        }
        .glow-text {
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
        }
        @keyframes scanline {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
        @keyframes neon-pulse-gold {
          0%, 100% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.7), 0 0 30px rgba(255, 215, 0, 0.5); }
          50% { box-shadow: 0 0 25px rgba(255, 215, 0, 1), 0 0 50px rgba(255, 215, 0, 0.8); }
        }
        @keyframes neon-pulse-silver {
          0%, 100% { box-shadow: 0 0 12px rgba(209, 213, 219, 0.7), 0 0 24px rgba(209, 213, 219, 0.5); }
          50% { box-shadow: 0 0 20px rgba(209, 213, 219, 1), 0 0 40px rgba(209, 213, 219, 0.8); }
        }
        @keyframes neon-pulse-bronze {
          0%, 100% { box-shadow: 0 0 12px rgba(180, 83, 9, 0.7), 0 0 24px rgba(180, 83, 9, 0.5); }
          50% { box-shadow: 0 0 20px rgba(180, 83, 9, 1), 0 0 40px rgba(180, 83, 9, 0.8); }
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
        .animate-pulse-gold {
          animation: neon-pulse-gold 2s ease-in-out infinite;
        }
        .animate-pulse-silver {
          animation: neon-pulse-silver 2s ease-in-out infinite;
        }
        .animate-pulse-bronze {
          animation: neon-pulse-bronze 2s ease-in-out infinite;
        }
        .animate-neon-glow {
          animation: neon-glow 2s ease-in-out infinite;
        }
      `}</style>

      </div>
    </div>
  )
}