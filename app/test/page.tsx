"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAdminGuard } from "@/lib/admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { mysupa } from "@/lib/supabase";
import { Play, Trash2, StopCircle } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogTitle,
} from "@/components/ui/dialog";
import { BotInstance } from "@/components/test/BotInstance";

const CAR_OPTIONS = ["purple", "white", "black", "aqua", "blue"];

// Import Indonesian names from JSON (more efficient, easier to maintain)
import indonesianNames from "@/data/indonesian-names.json";

// Helper to pick random from array
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Unique nickname generator class to avoid duplicates
class UniqueNicknameGenerator {
    private usedNames: Set<string> = new Set();
    private firstNames: string[];
    private middleNames: string[];
    private lastNames: string[];

    constructor() {
        this.firstNames = indonesianNames.firstNames;
        this.middleNames = indonesianNames.middleNames;
        this.lastNames = indonesianNames.lastNames;
    }

    generate(): string {
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            // Random format: 1-4 words
            const wordCount = Math.floor(Math.random() * 4) + 1;
            let nickname: string;

            if (wordCount === 1) {
                // Just first name
                nickname = pickRandom(this.firstNames);
            } else if (wordCount === 2) {
                // First + Last
                nickname = `${pickRandom(this.firstNames)} ${pickRandom(this.lastNames)}`;
            } else if (wordCount === 3) {
                // First + Middle + Last
                nickname = `${pickRandom(this.firstNames)} ${pickRandom(this.middleNames)} ${pickRandom(this.lastNames)}`;
            } else {
                // First + Middle1 + Middle2 + Last
                nickname = `${pickRandom(this.firstNames)} ${pickRandom(this.middleNames)} ${pickRandom(this.middleNames)} ${pickRandom(this.lastNames)}`;
            }

            if (!this.usedNames.has(nickname)) {
                this.usedNames.add(nickname);
                return nickname;
            }
            attempts++;
        }

        // Fallback: use full 4-word format for guaranteed uniqueness
        const fallback = `${pickRandom(this.firstNames)} ${pickRandom(this.middleNames)} ${pickRandom(this.middleNames)} ${pickRandom(this.lastNames)}`;
        this.usedNames.add(fallback);
        return fallback;
    }

    reset(): void {
        this.usedNames.clear();
    }
}

// Background GIFs like host pages
const backgroundGifs = [
    "/assets/background/host/1.webp",
    "/assets/background/host/3.webp",
    "/assets/background/host/7.webp",
];

interface SessionData {
    id: string;
    status: string;
    total_time_minutes: number;
    current_questions: any[];
}

export default function TestPage() {
    const { isAdmin, loading } = useAdminGuard();
    const [roomCode, setRoomCode] = useState("");
    const [userCount, setUserCount] = useState(100);
    const [isRunning, setIsRunning] = useState(false);
    const [session, setSession] = useState<SessionData | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [currentBgIndex, setCurrentBgIndex] = useState(0);

    const [joinedCount, setJoinedCount] = useState(0);
    const [answeringCount, setAnsweringCount] = useState(0);
    const [completedCount, setCompletedCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);
    const [showCleanupDialog, setShowCleanupDialog] = useState(false);
    const [isCleaningUp, setIsCleaningUp] = useState(false);

    // Refs for BotInstance communication
    const stopRef = useRef(false);
    const gameStatusRef = useRef<string>("waiting");
    const sessionChannelRef = useRef<any>(null);
    const nicknameGeneratorRef = useRef(new UniqueNicknameGenerator());
    const botIdsRef = useRef<string[]>([]);

    // Background cycling
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentBgIndex(prev => (prev + 1) % backgroundGifs.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const addLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 199)]);
    }, []);

    // Fetch session
    const fetchSession = async (code: string): Promise<SessionData | null> => {
        const { data, error } = await mysupa
            .from("sessions")
            .select("id, status, total_time_minutes, current_questions")
            .eq("game_pin", code)
            .single();

        if (error || !data) {
            addLog(`❌ Session not found: ${code}`);
            return null;
        }
        return data;
    };

    // Subscribe to session changes (detect game start/end)
    const subscribeToSession = (sessionId: string) => {
        sessionChannelRef.current = mysupa
            .channel(`test-session-${sessionId}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
                (payload) => {
                    const newStatus = payload.new?.status;
                    gameStatusRef.current = newStatus;

                    if (newStatus === "finished") {
                        addLog("🛑 Host ended the game!");
                        stopRef.current = true;
                        setIsRunning(false);
                    } else if (newStatus === "active") {
                        addLog("🎮 Game started by host!");
                        // Update session with questions
                        setSession(prev => prev ? { ...prev, ...payload.new } : null);
                    } else if (newStatus === "countdown") {
                        addLog("⏱️ Countdown started!");
                    }
                }
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
                () => {
                    addLog("🗑️ Session deleted by host!");
                    stopRef.current = true;
                    setIsRunning(false);
                }
            )
            .subscribe();
    };

    // Bot callbacks
    const handleBotJoined = useCallback((nickname: string) => {
        setJoinedCount(prev => prev + 1);
        addLog(`✅ ${nickname} joined`);
    }, [addLog]);

    const handleBotAnswered = useCallback((nickname: string, questionIndex: number) => {
        setAnsweringCount(prev => Math.max(prev, questionIndex));
        addLog(`${nickname} → Q${questionIndex}`);
    }, [addLog]);

    const handleBotCompleted = useCallback((nickname: string) => {
        setCompletedCount(prev => prev + 1);
        addLog(`🏁 ${nickname} finished!`);
    }, [addLog]);

    const handleBotError = useCallback((nickname: string, error: string) => {
        setErrorCount(prev => prev + 1);
        addLog(`❌ ${nickname}: ${error}`);
    }, [addLog]);

    // Main test runner
    const startTest = async () => {
        if (!roomCode.trim()) {
            addLog("❌ Enter room code");
            return;
        }

        setIsRunning(true);
        stopRef.current = false;
        gameStatusRef.current = "waiting";
        setLogs([]);
        setJoinedCount(0);
        setAnsweringCount(0);
        setCompletedCount(0);
        setErrorCount(0);
        botIdsRef.current = [];
        nicknameGeneratorRef.current.reset();

        addLog(`🧪 Starting test: ${roomCode}`);

        const sess = await fetchSession(roomCode);
        if (!sess) {
            setIsRunning(false);
            return;
        }

        setSession(sess);
        gameStatusRef.current = sess.status;
        subscribeToSession(sess.id);
        addLog(`✅ Session found: ${sess.status}`);
        addLog(`🤖 Spawning ${userCount} bots with IQ-based AI...`);
    };

    const stopTest = () => {
        stopRef.current = true;
        if (sessionChannelRef.current) {
            mysupa.removeChannel(sessionChannelRef.current);
        }
        addLog("⛔ Test stopped");
        setIsRunning(false);
    };

    const cleanupUsers = async () => {
        if (!session?.id) return;
        setIsCleaningUp(true);
        addLog("🧹 Cleaning up bots...");

        // Delete all participants in this session
        await mysupa
            .from("participants")
            .delete()
            .eq("session_id", session.id);

        addLog("✅ Cleanup complete");
        setJoinedCount(0);
        setCompletedCount(0);
        setIsCleaningUp(false);
        setShowCleanupDialog(false);
    };

    // Block rendering until admin check completes
    if (loading || !isAdmin) {
        return null;
    }

    return (
        <div className="min-h-screen bg-[#1a0a2a] relative overflow-hidden">
            {/* Background Animation */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentBgIndex}
                    className="absolute inset-0 w-full h-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${backgroundGifs[currentBgIndex]})` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                />
            </AnimatePresence>

            {/* Scrollable Content Wrapper (Header + Content scroll together) */}
            <div className="absolute inset-0 overflow-y-auto z-10">
                {/* Header */}
                <div className="w-full px-4 py-4 flex items-center justify-between">
                    {/* Left side: Back button + Crazy Race logo */}
                    <div className="flex items-center gap-4">
                        <div className="hidden md:block">
                            <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
                        </div>
                    </div>

                    {/* Right side: Gameforsmart logo */}
                    <div className="hidden md:block">
                        <Image
                            src="/gameforsmart-logo.png"
                            alt="Gameforsmart Logo"
                            width={300}
                            height={100}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-4xl mx-auto p-4 pt-0 space-y-4">
                    {/* Title */}
                    <div className="text-center">
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="pixel-border-large inline-block pb-2"
                        >
                            <h1 className="text-4xl font-bold text-[#ffefff] pixel-text glow-pink">
                                TEST
                            </h1>
                        </motion.div>
                    </div>

                    {/* Control Panel */}
                    <Card className="bg-[#1a0a2a]/80 border-[#ff6bff]/50 pixel-card backdrop-blur-sm">
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-[#00ffff] pixel-text">Room Code</label>
                                    <Input
                                        value={roomCode}
                                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                                        placeholder="XXXXXX"
                                        className="bg-[#0a0a1a] border-[#ff6bff]/50 text-white pixel-text mt-1"
                                        disabled={isRunning}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-[#00ffff] pixel-text">
                                        Bots: <span className="text-[#ff6bff]">{userCount}</span>
                                    </label>
                                    <Slider
                                        value={[userCount]}
                                        onValueChange={([v]) => setUserCount(v)}
                                        min={100}
                                        max={1000}
                                        step={100}
                                        disabled={isRunning}
                                        className="mt-3"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                {!isRunning ? (
                                    <Button
                                        onClick={startTest}
                                        className="flex-1 bg-[#00ffff]/20 border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff]/40 pixel-button glow-cyan"
                                    >
                                        <Play className="w-4 h-4 mr-2" /> Start
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={stopTest}
                                        className="flex-1 bg-red-500/20 border-2 border-red-500 text-red-400 hover:bg-red-500/40 pixel-button"
                                    >
                                        <StopCircle className="w-4 h-4 mr-2" /> Stop
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setShowCleanupDialog(true)}
                                    className="bg-[#ff6bff]/20 border-2 border-[#ff6bff] text-[#ff6bff] hover:bg-[#ff6bff]/40 pixel-button glow-pink"
                                    disabled={isRunning || !session}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" /> Cleanup
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card className="bg-[#1a0a2a]/80 border-[#00ffff]/50 pixel-card">
                            <CardContent className="p-2 text-center">
                                <div className="text-3xl font-bold text-[#00ffff] pixel-text glow-cyan">{joinedCount}</div>
                                <div className="text-xs text-[#00ffff]/70 pixel-text">Joined</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-[#1a0a2a]/80 border-[#ff6bff]/50 pixel-card">
                            <CardContent className="p-2 text-center">
                                <div className="text-3xl font-bold text-[#ff6bff] pixel-text glow-pink">{answeringCount}</div>
                                <div className="text-xs text-[#ff6bff]/70 pixel-text">Question</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-[#1a0a2a]/80 border-green-500/50 pixel-card">
                            <CardContent className="p-2 text-center">
                                <div className="text-3xl font-bold text-green-400 pixel-text">{completedCount}</div>
                                <div className="text-xs text-green-400/70 pixel-text">Completed</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-[#1a0a2a]/80 border-red-500/50 pixel-card">
                            <CardContent className="p-2 text-center">
                                <div className="text-3xl font-bold text-red-400 pixel-text">{errorCount}</div>
                                <div className="text-xs text-red-400/70 pixel-text">Errors</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Logs */}
                    <Card className="bg-[#1a0a2a]/80 border-[#ff6bff]/30 pixel-card gap-3">
                        <CardHeader>
                            <CardTitle className="text-sm text-[#ff6bff] pixel-text">📜 Logs</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-64 overflow-y-auto bg-black/60 rounded-lg p-3 font-mono text-xs space-y-0.5 border border-[#ff6bff]/20">
                                {logs.length === 0 ? (
                                    <div className="text-gray-500">Waiting for test to start...</div>
                                ) : (
                                    logs.map((log, i) => (
                                        <div
                                            key={i}
                                            className={`${log.includes("✓") ? "text-green-400" :
                                                log.includes("✗") ? "text-red-400" :
                                                    log.includes("❌") ? "text-red-400" :
                                                        log.includes("🏁") ? "text-yellow-400" :
                                                            log.includes("🎮") ? "text-purple-400" :
                                                                "text-gray-300"
                                                }`}
                                        >
                                            {log}
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Render Bot Instances (no UI, logic only) */}
            {isRunning && session && (
                <>
                    {Array.from({ length: userCount }, (_, i) => (
                        <BotInstance
                            key={`bot-${i}-${session.id}`}
                            botId={i}
                            sessionId={session.id}
                            roomCode={roomCode}
                            carOptions={CAR_OPTIONS}
                            nicknameGenerator={nicknameGeneratorRef.current}
                            onJoined={handleBotJoined}
                            onAnswered={handleBotAnswered}
                            onCompleted={handleBotCompleted}
                            onError={handleBotError}
                            stopSignal={stopRef}
                            gameStatus={gameStatusRef}
                        />
                    ))}
                </>
            )}

            {/* Cleanup Confirmation Dialog */}
            <Dialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
                <DialogOverlay className="bg-black/70 backdrop-blur-sm fixed inset-0 z-50" />
                <DialogContent className="bg-[#1a0a2a]/95 border-4 border-[#ff6bff] pixel-card max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-[#ff6bff] pixel-text glow-pink text-center">
                            🗑️ Cleanup Bots
                        </DialogTitle>
                        <DialogDescription className="text-center text-gray-300 pixel-text text-sm mt-4">
                            Are you sure you want to delete bots from this session?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-3 mt-6">
                        <Button
                            variant="outline"
                            onClick={() => setShowCleanupDialog(false)}
                            disabled={isCleaningUp}
                            className="flex-1 pixel-button bg-[#0a0a0f] border-2 border-[#00ffff]/50 text-[#00ffff] hover:bg-[#00ffff]/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={cleanupUsers}
                            disabled={isCleaningUp}
                            className="flex-1 pixel-button bg-red-500/20 border-2 border-red-500 text-red-400 hover:bg-red-500/40"
                        >
                            {isCleaningUp ? "Cleaning..." : "Delete All"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx>{`
                .pixel-text {
                    image-rendering: pixelated;
                    text-shadow: 2px 2px 0px #000;
                }
                .pixel-card {
                    box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 107, 255, 0.2);
                }
                .pixel-button {
                    image-rendering: pixelated;
                    box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
                    transition: all 0.1s ease;
                }
                .pixel-button:hover:not(:disabled) {
                    transform: translate(2px, 2px);
                    box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.8);
                }
                .glow-cyan {
                    filter: drop-shadow(0 0 8px #00ffff);
                }
                .glow-pink {
                    filter: drop-shadow(0 0 8px #ff6bff);
                }
            `}</style>
        </div>
    );
}
