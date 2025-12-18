"use client"

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { mysupa, supabase } from '@/lib/supabase';
import LoadingRetro from '@/components/loadingRetro';
import { formatTime } from '@/utils/game';
import { syncServerTime, getSyncedServerTime } from '@/utils/serverTime';

const APP_NAME = "crazyrace"; // Safety check for multi-tenant DB

export default function RacingGame() {
  const router = useRouter();
  const { roomCode } = useParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [participantId, setParticipantId] = useState<string>("");
  const [gameSrc, setGameSrc] = useState('/racing-game/v4.final.html');
  const [session, setSession] = useState<any>(null);

  const [totalTimeRemaining, setTotalTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    // Sync time once on component load to get the offset
    syncServerTime();
  }, []);

  useEffect(() => {
    const pid = localStorage.getItem("participantId") || "";
    if (!pid) {
      router.replace(`/`);
      return;
    }
    setParticipantId(pid);
  }, [router]);

  const fetchMiniGameData = useCallback(async (retryCount = 0) => {
    if (!roomCode) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionError } = await mysupa
        .from("sessions")
        .select("id, started_at, total_time_minutes, difficulty")
        .eq("game_pin", roomCode)
        .single();

      if (sessionError || !sessionData) {
        throw new Error(`Session error: ${sessionError?.message || 'Invalid session or app'}`);
      }

      setSession(sessionData);

      let src = '/racing-game/v4.final.html';
      switch (sessionData.difficulty) {
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
      setLoading(false);

    } catch (err: any) {
      console.error("Error fetching mini game data:", err);
      setError(err.message);
      if (retryCount < 3) {
        setTimeout(() => fetchMiniGameData(retryCount + 1), 1000 * (retryCount + 1));
      } else {
        router.replace(`/player/${roomCode}/game`);
      }
    }
  }, [roomCode, router]);

  useEffect(() => {
    if (roomCode) fetchMiniGameData();
  }, [roomCode, fetchMiniGameData]);

  const saveAndRedirectToResult = async () => {
    if (!participantId) return;

    await mysupa
      .from("participants")
      .update({
        completion: true,
        racing: false,
        finished_at: new Date(getSyncedServerTime()).toISOString()
      })
      .eq("id", participantId);

    router.push(`/player/${roomCode}/result`);
  };

  // Timer logic
  useEffect(() => {
    if (loading || !session) return;

    const gameStartTime = new Date(session.started_at).getTime();
    const gameDuration = session.total_time_minutes * 60;

    const updateRemaining = () => {
      const elapsed = Math.floor((getSyncedServerTime() - gameStartTime) / 1000);
      const remaining = gameDuration - elapsed;
      setTotalTimeRemaining(Math.max(0, remaining));

      if (remaining <= 0) {
        saveAndRedirectToResult();
      }
    };

    updateRemaining();
    timerIntervalRef.current = setInterval(updateRemaining, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [loading, session, saveAndRedirectToResult]);

  // Listen for game session changes
  useEffect(() => {
    if (!roomCode || !saveAndRedirectToResult) return;

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
            saveAndRedirectToResult();
          }
        }
      )
      .subscribe();

    return () => {
      mysupa.removeChannel(channel);
    };
  }, [roomCode, saveAndRedirectToResult]);

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

        // Ambil nextQuestionIndex dari localStorage
        const nextIdx = localStorage.getItem("nextQuestionIndex");
        if (nextIdx) {
          localStorage.removeItem("nextQuestionIndex");
        }

        router.replace(`/player/${roomCode}/game`);
      } catch (err) {
        console.error("Gagal update racing status:", err);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [participantId, roomCode, router]);

  iframeRef.current?.contentWindow?.focus();

  if (loading) return <LoadingRetro />;
  if (error) return <div className="w-full h-screen flex justify-center items-center text-red-500">Error: {error}</div>;

  const getTimeColor = () => {
    if (totalTimeRemaining <= 30) return "text-red-500 animate-pulse";
    if (totalTimeRemaining <= 60) return "text-[#ff6bff] glow-pink-subtle";
    return "text-[#00ffff] glow-cyan";
  };

  return (
    <div className="w-full h-screen relative flex justify-center items-center overflow-hidden">
      {totalTimeRemaining > 0 && (
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
  );
}
