"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Users, Clock, SkipForward, Volume2, VolumeX, Check } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { mysupa } from "@/lib/supabase"
import { formatTime, breakOnCaps } from "@/utils/game"
import { syncServerTime, getSyncedServerTime } from "@/utils/serverTime"
import LoadingRetro from "@/components/loadingRetro"
import { useGlobalLoading } from "@/contexts/globalLoadingContext"
import Image from "next/image"
import { Dialog, DialogContent, DialogOverlay, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useHostGuard } from "@/lib/host-guard"
import { t } from "i18next"
import { getHostGameDataAction, loadMoreParticipantsAction, endGameAction } from "@/app/actions/game-host"

const carGifMap: Record<string, string> = {
  purple: "/assets/car/car1_v2.webp",
  white: "/assets/car/car2_v2.webp",
  black: "/assets/car/car3_v2.webp",
  aqua: "/assets/car/car4_v2.webp",
  blue: "/assets/car/car5_v2.webp",
}

export default function HostMonitorPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  // Security: Verify host access
  useHostGuard(roomCode);
  const { hideLoading, showLoading } = useGlobalLoading();

  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [gameDuration, setGameDuration] = useState(300);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true); // Default muted
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isEndGameConfirmOpen, setEndGameConfirmOpen] = useState(false);

  // Cursor-based pagination states
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const pageSize = 50;
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => { syncServerTime(); }, []);

  // ✅ End game via server action
  const handleEndGame = useCallback(async () => {
    setEndGameConfirmOpen(false);
    setLoading(true);

    try {
      const result = await endGameAction(roomCode);

      if (result.error) throw new Error(result.error);

      console.log("Game diakhiri! Semua player masuk leaderboard.");
      router.push(`/host/${roomCode}/leaderboard`);

    } catch (err: any) {
      console.error("Gagal end game:", err);
      alert("Gagal mengakhiri game. Coba lagi.");
      setLoading(false);
    }
  }, [roomCode, router]);

  // Timer akurat
  const updateTimer = useCallback(() => {
    if (!session?.started_at) return;
    const start = new Date(session.started_at).getTime();
    const now = getSyncedServerTime();
    const elapsed = (now - start) / 1000;
    const remaining = Math.max(0, Math.floor(gameDuration - elapsed));
    setTimeRemaining(remaining);
    if (remaining <= 0 && session?.status === "active") {
      handleEndGame()
    }
  }, [session?.started_at, gameDuration, session?.status, handleEndGame]); // ✅ FIX: Added handleEndGame, removed unused roomCode

  useEffect(() => {
    const interval = setInterval(updateTimer, 1000);
    updateTimer();
    return () => clearInterval(interval);
  }, [updateTimer]);

  // Main effect: fetch initial data via server action + realtime
  useEffect(() => {
    if (!roomCode) return;

    let sessionChan: any = null;

    const init = async () => {
      // Fetch via server action
      const result = await getHostGameDataAction(roomCode);

      if (result.error || !result.data) {
        router.push("/host");
        return;
      }

      const { session: sess, totalQuestions: qCount, gameDuration: dur, participants: parts, totalCount: count, cursor: cur, hasMore: more } = result.data;

      setSession(sess);
      setTotalQuestions(qCount);
      setGameDuration(dur);
      setParticipants(parts);
      setTotalCount(count);
      setCursor(cur);
      setHasMore(more);

      setLoading(false);
      hideLoading();

      // Realtime session (must stay client-side)
      sessionChan = mysupa
        .channel(`host-sess-${roomCode}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `game_pin=eq.${roomCode}`
        }, (payload: any) => {
          const updated = payload.new;
          setSession(updated);
          if (updated.status === "finished") {
            setTimeout(() => router.push(`/host/${roomCode}/leaderboard`), 1500);
          }
        })
        .subscribe();
    };

    init();

    return () => {
      if (sessionChan) mysupa.removeChannel(sessionChan);
    };
  }, [roomCode, router, hideLoading]);

  useEffect(() => {
    if (!session?.id) return;

    const channel = mysupa
      .channel(`host-parts-${roomCode}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "participants",
        filter: `session_id=eq.${session.id}` // ← SELALU PAKAI session.id TERBARU!
      }, (payload: any) => {
        // ... sama seperti sebelumnya
        if (payload.eventType === "INSERT") {
          const p = payload.new;
          setParticipants(prev => {
            if (prev.some(x => x.id === p.id)) return prev; // cegah duplikat
            return [...prev, {
              id: p.id,
              nickname: p.nickname,
              car: p.car || "blue",
              score: p.score || 0,
              correct: p.correct || 0,
              currentQuestion: p.current_question || 0,
              answersCount: (p.answers || []).length,
              isComplete: p.completion === true,
              joinedAt: p.joined_at,
            }];
          });
        }

        if (payload.eventType === "UPDATE") {
          const p = payload.new;
          setParticipants(prev => prev.map(item =>
            item.id === p.id ? {
              ...item,
              score: p.score || 0,
              correct: p.correct || 0,
              currentQuestion: p.current_question || 0,
              answersCount: (p.answers || []).length,
              isComplete: p.completion === true,
            } : item
          ));
        }

        if (payload.eventType === "DELETE") {
          setParticipants(prev => prev.filter(x => x.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        console.log("Realtime participants status:", status); // harus "SUBSCRIBED"
      });

    return () => {
      mysupa.removeChannel(channel);
    };
  }, [session?.id, roomCode]); // ← RE-SUBSCRIBE KALAU session.id BERUBAH!

  // Auto end kalau semua selesai
  useEffect(() => {
    const allDone = participants.length > 0 && participants.every(p => p.isComplete);
    if (allDone && session?.status === "active") {
      handleEndGame()
    }
    if (session?.status === "finished") {
      router.push(`/host/${roomCode}/leaderboard`)
    }
  }, [participants, session?.status, roomCode]);

  // Sorting sama kayak sebelumnya
  const sortedPlayers = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.isComplete !== b.isComplete) return b.isComplete ? 1 : -1;
      if (a.currentQuestion !== b.currentQuestion) return b.currentQuestion - a.currentQuestion;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });
  }, [participants]);

  const getTimeColor = () => {
    if (timeRemaining <= 30) return "text-red-500 animate-pulse";
    if (timeRemaining <= 60) return "text-[#ff6bff] glow-pink-subtle";
    return "text-[#00ffff] glow-cyan";
  };

  // Load more participants via server action
  const loadMore = useCallback(async () => {
    if (!session?.id || !cursor || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const result = await loadMoreParticipantsAction(roomCode, session.id, cursor, pageSize);

    if (result.error) {
      console.error("Load more error:", result.error);
      setIsLoadingMore(false);
      return;
    }

    if (result.participants && result.participants.length > 0) {
      setParticipants(prev => [...prev, ...result.participants]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore || false);
    } else {
      setHasMore(false);
    }
    setIsLoadingMore(false);
  }, [session?.id, cursor, isLoadingMore, hasMore, pageSize, roomCode]);

  // Infinite scroll: observe loader element
  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loader);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // ✅ FIX: handleEndGame sudah dipindahkan ke atas (sebelum updateTimer)

  // Audio control - only play/pause on mute toggle, no autoplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.5; // Default 50% volume

    if (isMuted) {
      audio.pause();
    } else {
      audio.play().catch(() => console.warn("Audio play blocked"));
    }
  }, [isMuted]);

  if (loading) return <LoadingRetro />;

  return (
    <div className="h-screen bg-[#1a0a2a] relative overflow-hidden">
      <audio ref={audioRef} src="/assets/music/racingprogress.mp3" loop preload="auto" className="hidden" />
      {/* Static Background Image */}
      <Image
        src="/assets/background/host/9.webp"
        alt="Background"
        fill
        className="object-cover fixed"
        priority
      />

      {/* Scrollable Content Wrapper */}
      <div className="absolute inset-0 overflow-y-auto z-10">
        {/* Header - Full width, ikut scroll, 3 columns */}
        <div className="w-full px-4 py-4 pb-0 flex items-center justify-between">
          {/* Left side: Crazy Race logo (desktop) */}
          <div className="flex items-center gap-4 flex-1">
            <div className="hidden md:block">
              <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
            </div>
          </div>

          {/* Center: Mobile logo */}
          <div className="block md:hidden w-full flex justify-center mx-auto">
            <Image
              src="/crazyrace-logo.png"
              alt="Crazy Race"
              width={230}
              height={50}
              style={{ imageRendering: 'auto' }}
              className="h-auto drop-shadow-xl"
            />
          </div>

          {/* Right side: Gameforsmart logo + Mute button */}
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="hidden md:block">
              <Image src="/gameforsmart-logo.png" alt="Logo" width={300} height={100} />
            </div>
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => setIsMuted(p => !p)}
              className={`p-3 border-2 pixel-button rounded-lg shadow-lg min-w-[48px] min-h-[48px] flex items-center justify-center transition-all cursor-pointer ${isMuted ? "bg-[#ff6bff]/30 border-[#ff6bff] glow-pink" : "bg-[#00ffff]/30 border-[#00ffff] glow-cyan"}`}
            >
              <span className="filter drop-shadow-[2px_2px_2px_rgba(0,0,0,0.7)]">{isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}</span>
            </motion.button>
          </div>
        </div>

        <div className="relative max-w-7xl mx-auto p-4 sm:p-6 md:p-10 pt-0 sm:pt-0 md:pt-0">
          <div className="flex flex-col items-center text-center">

            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pb-4 sm:pb-5">
              <div className="inline-block py-4 max-w-[200px] sm:max-w-none">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#ffefff] pixel-text glow-pink">{t('monitor.title')}</h1>
              </div>
            </motion.div>

            <Card className="bg-[#1a0a2a]/60 border-[#ff6bff]/50 pixel-card px-6 py-4 mb-4 w-full">
              <div className="flex flex-col gap-2 sm:flex-row items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className={`w-8 h-8 ${getTimeColor()}`} />
                  <div className={`text-2xl font-bold ${getTimeColor()} pixel-text`}>{formatTime(timeRemaining)}</div>
                </div>
                <Button onClick={() => setEndGameConfirmOpen(true)} className="bg-red-500 hover:bg-red-600 pixel-button glow-red flex items-center space-x-2">
                  <SkipForward className="w-4 h-4" /><span>{t('monitor.endGame')}</span>
                </Button>
              </div>
            </Card>
          </div>

          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
            <Card className="bg-[#1a0a2a]/40 border-[#ff6bff]/50 pixel-card p-4 md:p-6 mb-8">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <AnimatePresence>
                  {sortedPlayers.map((player) => {
                    const progress = player.currentQuestion;
                    const isCompleted = player.isComplete;
                    const currentlyAnswering = progress > 0 && !isCompleted && progress < totalQuestions;

                    return (
                      <motion.div key={player.id} layoutId={player.id} initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -20 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} whileHover={{ scale: 1.05 }} className={`group ${currentlyAnswering ? "glow-cyan animate-neon-pulse" : "glow-pink-subtle"}`}>
                        <Card className={`p-3 bg-[#1a0a2a]/50 border-2 border-double transition-all duration-300 h-full gap-4 ${currentlyAnswering ? "border-[#00ffff]/70 bg-[#00ffff]/10" : isCompleted ? "border-[#00ff00]/70 bg-[#00ff00]/10" : "border-[#ff6bff]/70"}`}>
                          <div className="flex items-center justify-end">
                            {isCompleted ? (
                              <Badge className="bg-green-500/20 border border-green-500/50 text-green-400"><Check className="w-4 h-4" /></Badge>
                            ) : (
                              <Badge>{progress}/{totalQuestions}</Badge>
                            )}
                          </div>
                          <div className="relative mb-3">
                            <img src={carGifMap[player.car] || '/assets/car/car5_v2.webp'} alt="car" className="h-28 w-40 mx-auto object-contain animate-neon-bounce filter brightness-125 contrast-150" style={{ transform: 'scaleX(-1)' }} />
                          </div>
                          <div className="text-center">
                            <h3 className="text-white pixel-text text-sm leading-tight mb-2 line-clamp-2 break-words" title={player.nickname}>{breakOnCaps(player.nickname)}</h3>
                            <Progress value={(progress / totalQuestions) * 100} className={`h-2 bg-[#1a0a2a]/50 border border-[#00ffff]/30 mb-2 ${isCompleted ? "bg-green-500/20" : ""}`} />
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {sortedPlayers.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('monitor.noPlayers')}</p>
                </div>
              )}
              {/* Infinite Scroll Loader */}
              {hasMore && participants.length < totalCount && (
                <div ref={loaderRef} className="flex justify-center items-center py-4">
                  <span className="text-[#00ffff] text-sm pixel-text">Loading more...</span>
                </div>
              )}
            </Card>
          </motion.div>
        </div>

        {/* Dialog End Game (sama persis) */}
        <Dialog open={isEndGameConfirmOpen} onOpenChange={setEndGameConfirmOpen}>
          <DialogOverlay className="bg-[#1a0a2a]/60 backdrop-blur-md fixed inset-0 z-50" />
          <DialogContent className="bg-[#1a0a2a]/80 border-2 border-[#ff6bff] pixel-card">
            <DialogTitle className="text-xl text-[#ffefff] pixel-text glow-pink text-center">{t('monitor.endGame')}</DialogTitle>
            <DialogDescription className="text-center text-gray-300 pixel-text my-4">{t('monitor.endGameConfirm')}</DialogDescription>
            <DialogFooter className="flex justify-center gap-4">
              <Button variant="outline" onClick={() => setEndGameConfirmOpen(false)} className="pixel-button bg-gray-700 hover:bg-gray-600">{t('monitor.cancel')}</Button>
              <Button onClick={handleEndGame} className="pixel-button bg-red-600 hover:bg-red-500 glow-red">{t('monitor.confirm')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSS sama persis */}
        <style jsx>{`
        .pixel-text { image-rendering: pixelated; text-shadow: 2px 2px 0px #000; }
        .pixel-button { image-rendering: pixelated; box-shadow: 3px 3px 0px rgba(0,0,0,0.8); transition: all 0.1s ease; }
        .pixel-button:hover:not(:disabled) { transform: translate(2px, 2px); box-shadow: 1px 1px 0px rgba(0,0,0,0.8); }
        .pixel-card { box-shadow: 8px 8px 0px rgba(0,0,0,0.8), 0 0 20px rgba(255,107,255,0.3); }
        .glow-pink { filter: drop-shadow(0 0 10px #ff6bff); }
        .glow-cyan { filter: drop-shadow(0 0 10px #00ffff); }
        .glow-red { filter: drop-shadow(0 0 8px rgba(255,0,0,0.7)); }
        .glow-pink-subtle { filter: drop-shadow(0 0 5px rgba(255,107,255,0.5)); }
        @keyframes neon-pulse { 50% { box-shadow: 0 0 15px rgba(0,255,255,1), 0 0 30px rgba(0,255,255,0.8); } }
        .animate-neon-pulse { animation: neon-pulse 1.5s ease-in-out infinite; }
      `}</style>
      </div>
    </div>
  )
}