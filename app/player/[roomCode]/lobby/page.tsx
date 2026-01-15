"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, ArrowLeft } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { mysupa, supabase } from "@/lib/supabase"
import LoadingRetro from "@/components/loadingRetro"
import { useGlobalLoading } from "@/contexts/globalLoadingContext"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogTitle } from "@/components/ui/dialog"

import Image from "next/image"
import { breakOnCaps } from "@/utils/game"
import { getSyncedServerTime, syncServerTime } from "@/utils/serverTime"
import { t } from "i18next"

// Background GIFs
const backgroundGifs = [
  "/assets/background/1.webp",
  "/assets/background/host/1.webp",
  "/assets/background/host/3.webp",
  "/assets/background/host/4.webp",
  "/assets/background/host/7.webp",
]

const carGifMap: Record<string, string> = {
  purple: "/assets/car/car1_v2.webp",
  white: "/assets/car/car2_v2.webp",
  black: "/assets/car/car3_v2.webp",
  aqua: "/assets/car/car4_v2.webp",
  blue: "/assets/car/car5_v2.webp",
}

const availableCars = [
  { key: "purple", label: "Vortexia" },
  { key: "white", label: "Glacier" },
  { key: "black", label: "Noctis" },
  { key: "aqua", label: "Hydracer" },
  { key: "blue", label: "Skyburst" },
] as const

interface Player {
  id: string | null;
  nickname: string;
  car: string | null;
}

export default function LobbyPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.roomCode as string
  const { hideLoading } = useGlobalLoading()

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [currentPlayer, setCurrentPlayer] = useState<Player>({
    id: null,
    nickname: "",
    car: null,
  });

  const [participants, setParticipants] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [gamePhase, setGamePhase] = useState("waiting")
  const [countdown, setCountdown] = useState(0)
  const [currentBgIndex, setCurrentBgIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCarDialog, setShowCarDialog] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const hasBootstrapped = useRef(false);
  const hasPreloaded = useRef(false); // ✅ Track if assets already preloaded

  // Cursor-based pagination states
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const pageSize = 20;
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    syncServerTime()
    localStorage.removeItem("roomCode")
  }, [])

  // ✅ Handle browser back button (Alt+Left Arrow / Back button)
  useEffect(() => {
    // Push a dummy state to history so we can intercept back button
    window.history.pushState({ lobby: true }, "", window.location.href);

    const handlePopState = (event: PopStateEvent) => {
      // Prevent default back navigation
      event.preventDefault();

      // Push state again to prevent leaving
      window.history.pushState({ lobby: true }, "", window.location.href);

      // Show exit dialog
      setShowExitDialog(true);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);


  const calculateCountdown = (startTimestamp: string, durationSeconds: number = 10): number => {
    const start = new Date(startTimestamp).getTime();
    const now = getSyncedServerTime();
    const elapsed = (now - start) / 1000;
    return Math.max(0, Math.min(durationSeconds, Math.ceil(durationSeconds - elapsed)));
  };

  const startCountdownSync = useCallback((startTimestamp: string, duration: number = 10) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    let remaining = calculateCountdown(startTimestamp, duration);
    setCountdown(remaining);
    if (remaining <= 0) return;

    countdownIntervalRef.current = setInterval(() => {
      remaining = calculateCountdown(startTimestamp, duration);
      setCountdown(remaining);
      setLoading(true)
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
      }
    }, 100);
  }, []);

  // ✅ Preload minigame assets based on difficulty
  const preloadMinigameAssets = useCallback((difficulty: string) => {
    if (hasPreloaded.current) return; // Already preloaded
    hasPreloaded.current = true;

    // Determine which game HTML to preload
    let gameSrc = '/racing-game/v4.final.html';
    switch (difficulty) {
      case 'easy':
        gameSrc = '/racing-game/v1.straight.html';
        break;
      case 'normal':
        gameSrc = '/racing-game/v2.curves.html';
        break;
      case 'hard':
        gameSrc = '/racing-game/v4.final.html';
        break;
    }

    // Preload main game HTML via hidden iframe prefetch
    const linkGame = document.createElement('link');
    linkGame.rel = 'prefetch';
    linkGame.href = gameSrc;
    document.head.appendChild(linkGame);

    // Common assets to preload (images only, skip audio)
    const assetsToPreload = [
      '/racing-game/common.js',
      '/racing-game/common.css',
      '/racing-game/images/sprites.png',
      '/racing-game/images/background.png',
      '/racing-game/images/up.webp',
      '/racing-game/images/down.webp',
      '/racing-game/images/left.webp',
      '/racing-game/images/right.webp',
    ];

    // Preload each asset
    assetsToPreload.forEach(src => {
      if (src.endsWith('.png') || src.endsWith('.webp')) {
        // Preload images using HTMLImageElement
        const img = document.createElement('img');
        img.src = src;
      } else {
        // Prefetch JS/CSS
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = src;
        document.head.appendChild(link);
      }
    });
  }, []);

  // ✅ Prefetch game data (questions, session, participant) saat countdown
  const prefetchGameData = useCallback(async () => {
    if (!roomCode) return;

    const prefetchKey = `prefetch_game_${roomCode}`;

    // Skip jika sudah di-prefetch
    if (sessionStorage.getItem(prefetchKey)) {
      return;
    }

    try {
      const participantId = localStorage.getItem("participantId") || "";

      // 1. Fetch session dengan current_questions
      const { data: sess, error: sessError } = await mysupa
        .from("sessions")
        .select("id, status, started_at, total_time_minutes, current_questions, difficulty")
        .eq("game_pin", roomCode)
        .single();

      if (sessError || !sess) {
        console.error("❌ Prefetch session error:", sessError);
        return;
      }

      // 2. Parse questions TANPA correctAnswer (keamanan!)
      const questions = (sess.current_questions || []).map((q: any) => ({
        id: q.id,
        question: q.question,
        options: q.answers.map((a: any) => a.answer),
        // NO correctAnswer! Server-side validation only
      }));

      // 3. Fetch participant state
      const { data: participant } = await mysupa
        .from("participants")
        .select("answers, completion, current_question")
        .eq("id", participantId)
        .single();

      // 4. Store prefetched data ke sessionStorage (lebih aman dari localStorage)
      const prefetchedData = {
        session: {
          id: sess.id,
          status: sess.status,
          started_at: sess.started_at,
          total_time_minutes: sess.total_time_minutes,
          difficulty: sess.difficulty,
        },
        questions,
        participant: participant || { answers: [], completion: false, current_question: 0 },
        prefetchedAt: Date.now(),
      };

      sessionStorage.setItem(prefetchKey, JSON.stringify(prefetchedData));

    } catch (err) {
      console.error("❌ Prefetch game data error:", err);
    }
  }, [roomCode]);

  const stopCountdownSync = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setCountdown(0);
  }, []);

  useEffect(() => {
    if (session?.status === 'active' && !loading) {
      router.replace(`/player/${roomCode}/game`);
    } else if (session?.status === 'finished' && !loading) {
      router.replace(`/player/${roomCode}/result`);
    }
  }, [session?.status, loading, roomCode, router]);

  // REFACTORED: Use the 'remove_participant_from_session' RPC for a safe, atomic update.
  const handleExit = async () => {
    if (!currentPlayer.id || !session) return;

    const { error } = await mysupa
      .from("participants")
      .delete()
      .eq("id", currentPlayer.id);

    if (error) {
      console.error('Error exiting session via RPC:', error);
    } else {
      localStorage.removeItem('participantId');
      localStorage.removeItem('game_pin');
      router.push('/');
    }
    setShowExitDialog(false);
  };

  // REFACTORED: Use the 'update_participant_car' RPC for a safe, atomic update.
  const handleSelectCar = async (selectedCar: string) => {
    if (!currentPlayer.id || !session) return;

    // Optimistic UI update
    setCurrentPlayer(prev => ({ ...prev, car: selectedCar }));
    setParticipants(prev => prev.map(p => p.id === currentPlayer.id ? { ...p, car: selectedCar } : p));
    setShowCarDialog(false);

    const { error } = await mysupa
      .from('participants')
      .update({ car: selectedCar })
      .eq('id', currentPlayer.id);


    if (error) {
      console.error('Error updating car via RPC:', error);
      // Revert optimistic update on error if needed
    }
  };

  // Load more participants using cursor
  const loadMore = useCallback(async () => {
    if (!session?.id || !cursor || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const { data: more } = await mysupa
      .from("participants")
      .select("*")
      .eq("session_id", session.id)
      .gt("joined_at", cursor)
      .order("joined_at", { ascending: true })
      .limit(pageSize);

    if (more && more.length > 0) {
      setParticipants(prev => [...prev, ...more]);
      setCursor(more[more.length - 1].joined_at);
      setHasMore(more.length >= pageSize);
    } else {
      setHasMore(false);
    }
    setIsLoadingMore(false);
  }, [session?.id, cursor, isLoadingMore, hasMore, pageSize]);

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

  useEffect(() => {
    if (hasBootstrapped.current || !roomCode) return;
    hasBootstrapped.current = true;

    let sessionChannel: any = null;
    let participantsChannel: any = null;

    const bootstrap = async () => {
      setLoading(true);

      // Fetch session dari gameplay supabase (include difficulty)
      const { data: fetchedSession, error: sessionErr } = await mysupa
        .from("sessions")
        .select("id, status, countdown_started_at, started_at, ended_at, difficulty")
        .eq("game_pin", roomCode)
        .single();

      if (sessionErr || !fetchedSession) {
        router.replace("/");
        return;
      }

      setSession(fetchedSession);
      setGamePhase(fetchedSession.status);

      if (fetchedSession.countdown_started_at) {
        startCountdownSync(fetchedSession.countdown_started_at, 10);
        // ✅ Preload minigame assets saat countdown dimulai
        if (fetchedSession.difficulty) {
          preloadMinigameAssets(fetchedSession.difficulty);
        }
        // ✅ Prefetch game data (questions, session info) saat countdown
        prefetchGameData();
      } else {
        stopCountdownSync();
      }

      // Fetch participants (cursor-based)
      const { data: fetchedParticipants, count } = await mysupa
        .from("participants")
        .select("*", { count: "exact" })
        .eq("session_id", fetchedSession.id)
        .order("joined_at", { ascending: true })
        .limit(pageSize);

      setParticipants(fetchedParticipants ?? []);
      setTotalCount(count || 0);

      // Set cursor and hasMore
      if (fetchedParticipants && fetchedParticipants.length > 0) {
        setCursor(fetchedParticipants[fetchedParticipants.length - 1].joined_at);
        setHasMore(fetchedParticipants.length >= pageSize);
      } else {
        setHasMore(false);
      }

      const myParticipantId = localStorage.getItem("participantId") || "";
      const me = (fetchedParticipants || []).find((p: any) => p.id === myParticipantId);

      if (!me) {
        console.warn("Participant not found");
        localStorage.removeItem("participantId");
        localStorage.removeItem("game_pin");
        router.replace("/");
        return;
      }

      setCurrentPlayer({ id: me.id, nickname: me.nickname, car: me.car || "blue" });

      // Realtime listener hanya pada sessions table
      sessionChannel = mysupa
        .channel(`session:${roomCode}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sessions", filter: `game_pin=eq.${roomCode}` },
          async (payload) => {
            const newSessionData = payload.new;
            setSession(newSessionData);
            setGamePhase(newSessionData.status);

            // countdown realtime
            if (newSessionData.countdown_started_at) {
              startCountdownSync(newSessionData.countdown_started_at, 10);
              // ✅ Preload minigame assets saat countdown dimulai via realtime
              if (newSessionData.difficulty) {
                preloadMinigameAssets(newSessionData.difficulty);
              }
              // ✅ Prefetch game data via realtime
              prefetchGameData();
            }
            else stopCountdownSync();

            // Navigation between phases
            if (newSessionData.status === "active") router.replace(`/player/${roomCode}/game`);
            else if (newSessionData.status === "finished") router.replace(`/player/${roomCode}/result`);
          }
        )
        .subscribe();

      participantsChannel = mysupa
        .channel(`participants:${roomCode}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "participants",
            filter: `session_id=eq.${fetchedSession.id}`,   // FIX HERE
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              setParticipants(prev => [...prev, payload.new]);
            }

            if (payload.eventType === "UPDATE") {
              setParticipants(prev =>
                prev.map(p => p.id === payload.new.id ? payload.new : p)
              );
            }

            if (payload.eventType === "DELETE") {
              setParticipants(prev => prev.filter(p => p.id !== payload.old.id));

              // Hanya jika yang di-delete adalah DIRINYA SENDIRI → baru dianggap kicked
              const kickedId = payload.old.id;
              const myId = localStorage.getItem("participantId");

              if (kickedId === myId) {
                console.warn("You have been kicked from the session");
                localStorage.removeItem("participantId");
                localStorage.removeItem("game_pin");
                router.push("/");
              }
            }
          }
        )
        .subscribe();



      setLoading(false);
      hideLoading(); // Hide global loading (for seamless transition from /join)
    };

    bootstrap();

    return () => {
      stopCountdownSync();
      if (sessionChannel) mysupa.removeChannel(sessionChannel);
      if (participantsChannel) mysupa.removeChannel(participantsChannel);
    };
  }, [roomCode, router, startCountdownSync, stopCountdownSync, hideLoading]);


  useEffect(() => {
    const bgInterval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length)
    }, 5000);
    return () => clearInterval(bgInterval);
  }, []);

  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.id === currentPlayer.id) return -1;
    if (b.id === currentPlayer.id) return 1;
    return 0;
  });

  if (countdown > 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1a0a2a] z-[9999]">
        <motion.div
          className="text-8xl md:text-9xl lg:text-[10rem] xl:text-[12rem] leading-none font-bold text-[#00ffff] pixel-text glow-cyan race-pulse"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 0.5 }}
        >
          {countdown}
        </motion.div>
      </div>
    )
  }

  if (loading) {
    return <LoadingRetro />;
  }

  return (
    <div className={`min-h-screen bg-[#1a0a2a] relative overflow-hidden p-4`}>
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
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />
      </AnimatePresence>

      <div className="relative z-10">
        {/* Header - Full width, ikut scroll */}
        <div className="w-full pb-0 flex items-center justify-between">
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

        <div className="max-w-7xl mx-auto pt-0 px-4">
          <div className="text-center md:m-8 mb-8">
            <h1 className="sm:max-w-none text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#00ffff] pixel-text glow-cyan mb-4 tracking-wider">
              {t('lobby.title')}
            </h1>
          </div>

          <motion.div initial={{ y: 50 }} animate={{ y: 0 }} transition={{ duration: 0.8 }}>
            <Card className="bg-[#1a0a2a]/40 backdrop-blur-sm border-[#ff6bff]/50 pixel-card py-5 gap-3 mb-10">
              <CardHeader className="text-center px-5 mb-5">
                <motion.div className="relative flex items-center justify-center">
                  <Badge className="absolute bg-[#1a0a2a]/50 border-[#00ffff] text-[#00ffff] p-2 md:text-lg pixel-text glow-cyan top-0 left-0 gap-1 md:gap-3">
                    <Users className="!w-3 !h-3 md:!w-5 md:!h-5" />
                    {totalCount}
                  </Badge>
                </motion.div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  {sortedParticipants.map((player) => (
                    <motion.div
                      key={player.id}
                      className={`relative group ${player.id === currentPlayer.id ? 'glow-cyan' : 'glow-pink-subtle'}`}
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={`p-4 rounded-xl border-4 border-double transition-all duration-300 bg-transparent backdrop-blur-sm ${player.id === currentPlayer.id ? 'border-[#00ffff] animate-neon-pulse' : 'border-[#ff6bff]/70 hover:border-[#ff6bff]'}`}>
                        <div className="relative mb-3">
                          <img src={carGifMap[player.car] || '/assets/car/car5_v2.webp'} alt={`${player.car} car`} className="h-28 w-40 mx-auto object-contain animate-neon-bounce filter brightness-125 contrast-150" />
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-2 mb-1">
                            <h3 className="text-white pixel-text text-sm leading-tight line-clamp-2 break-words" title={player.nickname}>
                              {breakOnCaps(player.nickname)}
                            </h3>
                          </div>
                          {player.id === currentPlayer.id && (
                            <Badge className="bg-transparent text-[#00ffff] border-[#00ffff]/70 text-xs pixel-text glow-cyan-subtle">
                              YOU
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {/* Infinite Scroll Loader */}
                {hasMore && participants.length < totalCount && (
                  <div ref={loaderRef} className="flex justify-center items-center py-4">
                    <span className="text-[#00ffff] text-sm pixel-text">Loading more...</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <div className="bg-[#1a0a2a]/50 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none w-full text-center py-3 fixed bottom-0 left-1/2 transform -translate-x-1/2 z-10 space-x-2 items-center justify-center flex">
            <Button className="bg-red-500 border-2 border-white pixel-button-large hover:bg-red-800 px-8 py-3" onClick={() => setShowExitDialog(true)}>
              <ArrowLeft />
            </Button>
            <Button className="bg-[#ff6bff] border-2 border-white pixel-button-large hover:bg-[#ff8aff] glow-pink px-8 py-3" onClick={() => setShowCarDialog(true)}>
              <span className="pixel-text text-lg">CHOOSE CAR</span>
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogOverlay className="bg-[#000ffff] backdrop-blur-sm" />
        <DialogContent className="bg-[#1a0a2a]/65 border-[#ff6bff]/50 backdrop-blur-md text-[#00ffff] max-w-lg mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }}>
            <DialogHeader>
              <DialogTitle className="text-cyan-400 pixel-text glow-cyan text-center"> {t('lobby.keluar')} </DialogTitle>
            </DialogHeader>
            <div className="flex justify-center mb-4">
              <img src={carGifMap[currentPlayer.car || 'blue']} alt="Your Car" className="h-24 w-32 object-contain filter brightness-125 glow-cyan" />
            </div>
            <DialogDescription className="text-gray-300 text-center">
              {t('lobby.homepage')}
            </DialogDescription>
            <div className="flex justify-end space-x-3 pt-4">
              <Button variant="outline" onClick={() => setShowExitDialog(false)} className="text-[#00ffff] border-1 border-[#00ffff] hover:bg-[#00ffff] ">
                {t('lobby.cancel')}
              </Button>
              <Button onClick={handleExit} className="bg-red-500 border-1 border-[#00ffff] hover:bg-red-600 hover:text-white">
                {t('lobby.exit')}
              </Button>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCarDialog} onOpenChange={setShowCarDialog}>
        <DialogOverlay className="bg-[#8B00FF]/60 backdrop-blur-sm" />
        <DialogContent className="bg-[#1a0a2a]/90 border-[#ff6bff]/50 backdrop-blur-sm sm:max-w-md sm:h-auto overflow-auto p-0">
          <DialogHeader className="pt-4 pb-2 px-4">
            <DialogTitle className="text-[#00ffff] pixel-text glow-cyan text-center text-xl">Choose Car</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto">
            {availableCars.map((car) => (
              <motion.button
                key={car.key}
                onClick={() => handleSelectCar(car.key)}
                className={`p-4 mt-1 rounded-xl border-2 border-double transition-all duration-200 hover:scale-105 flex flex-col items-center ${currentPlayer.car === car.key ? 'border-[#00ffff] bg-[#00ffff]/10 animate-neon-pulse' : 'border-[#ff6bff]/70 hover:border-[#ff6bff] hover:bg-[#ff6bff]/10'}`}
                whileHover={{ scale: 0.97 }}
                whileTap={{ scale: 0.95 }}
              >
                <img src={carGifMap[car.key]} alt={car.label} className="h-24 w-32 mx-auto object-contain filter brightness-125 contrast-150 mb-2" />
                <p className="text-xs text-white mt-1 pixel-text text-center">{car.label}</p>
              </motion.button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <style jsx>{`
        .pixel-text { image-rendering: pixelated; text-shadow: 2px 2px 0px #000; }
        .pixel-button-large { image-rendering: pixelated; box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.8); transition: all 0.1s ease; }
        .pixel-button-large:hover { transform: translate(3px, 3px); box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.8); }
        .pixel-card { box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 107, 255, 0.3); }
        .glow-cyan { filter: drop-shadow(0 0 10px #00ffff); }
        .glow-pink-subtle { filter: drop-shadow(0 0 5px rgba(255, 107, 255, 0.5)); }
        @keyframes neon-bounce { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes neon-pulse { 0%, 100% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.7), 0 0 20px rgba(0, 255, 255, 0.5); } 50% { box-shadow: 0 0 15px rgba(0, 255, 255, 1), 0 0 30px rgba(0, 255, 255, 0.8); } }
        @keyframes neon-pulse-pink { 0%, 100% { box-shadow: 0 0 10px rgba(255, 107, 255, 0.7), 0 0 20px rgba(255, 107, 255, 0.5); } 50% { box-shadow: 0 0 15px rgba(255, 107, 255, 1), 0 0 30px rgba(255, 107, 255, 0.8); } }
        .glow-text { filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)); }
        .animate-neon-pulse { animation: neon-pulse 1.5s ease-in-out infinite; }
        .glow-pink-subtle { animation: neon-pulse-pink 1.5s ease-in-out infinite; }
      `}</style>

    </div>
  )
}
