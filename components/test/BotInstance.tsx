"use client";

import { useEffect, useMemo, useRef } from "react";
import { mysupa } from "@/lib/supabase";
import { generateXID } from "@/lib/id-generator";

// ========== BOT BRAIN (IQ-based intelligence) ==========
class BotBrain {
    iq: number;

    constructor() {
        // Bell curve distribution: mean=100, stddev=15, range 70-130
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        this.iq = Math.max(70, Math.min(130, Math.round(100 + z * 15)));
    }

    // Join delay: IQ 70 → 8-10s, IQ 130 → 1-3s
    getJoinDelay(): number {
        const factor = (130 - this.iq) / 60; // 0-1 (lower IQ = higher factor)
        const min = 1000 + factor * 7000;
        const max = 3000 + factor * 7000;
        return min + Math.random() * (max - min);
    }

    // Answer delay: IQ 70 → 8-15s, IQ 130 → 2-5s
    getAnswerDelay(): number {
        const factor = (130 - this.iq) / 60;
        const min = 2000 + factor * 6000;  // 2s to 8s min
        const max = 5000 + factor * 10000; // 5s to 15s max
        return min + Math.random() * (max - min);
    }

    // Accuracy: IQ 70 → 40%, IQ 130 → 95%
    getAccuracy(): number {
        return 0.4 + ((this.iq - 70) / 60) * 0.55;
    }

    // Returns correct answer if "smart enough", otherwise random
    chooseAnswer(correctIndex: number, totalOptions: number = 4): number {
        if (Math.random() < this.getAccuracy()) {
            return correctIndex;
        }
        return Math.floor(Math.random() * totalOptions);
    }

    // Lobby activity: higher IQ = more car changes (reduced intensity)
    shouldChangeCar(): boolean {
        // Reduced from 10-50% to 5-15% to minimize DB load
        const chance = 0.05 + ((this.iq - 70) / 60) * 0.1;
        return Math.random() < chance;
    }
}

// ========== HELPER ==========
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ========== BOT INSTANCE COMPONENT ==========
export interface BotInstanceProps {
    botId: number;
    sessionId: string;
    roomCode: string;
    carOptions: string[];
    nicknameGenerator: { generate: () => string };
    onJoined: (nickname: string) => void;
    onAnswered: (nickname: string, questionIndex: number) => void;
    onCompleted: (nickname: string) => void;
    onError: (nickname: string, error: string) => void;
    stopSignal: React.MutableRefObject<boolean>;
    gameStatus: React.MutableRefObject<string>;
}

export function BotInstance({
    botId,
    sessionId,
    roomCode,
    carOptions,
    nicknameGenerator,
    onJoined,
    onAnswered,
    onCompleted,
    onError,
    stopSignal,
    gameStatus,
}: BotInstanceProps) {
    const brain = useMemo(() => new BotBrain(), []);
    const odorIdref = useRef(generateXID());
    const nicknameRef = useRef("");
    const hasStarted = useRef(false);

    useEffect(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        let mounted = true;

        const runBot = async () => {
            try {
                // ========== PHASE 1: JOIN ==========
                await delay(brain.getJoinDelay());
                if (!mounted || stopSignal.current) return;

                nicknameRef.current = nicknameGenerator.generate();
                const car = carOptions[Math.floor(Math.random() * carOptions.length)];

                const { error: joinError } = await mysupa.from("participants").insert({
                    id: odorIdref.current,
                    session_id: sessionId,
                    nickname: nicknameRef.current,
                    car,
                    score: 0,
                    answers: [],
                    current_question: 0,
                    completion: false,
                    racing: false,
                });

                if (joinError) {
                    onError(nicknameRef.current || `Bot#${botId}`, joinError.message);
                    return;
                }

                onJoined(nicknameRef.current);

                // ========== PHASE 2: LOBBY (wait for game to start) ==========
                while (gameStatus.current === "waiting" && !stopSignal.current && mounted) {
                    // Increased delay from 1-3s to 3-5s to reduce lobby activity
                    await delay(3000 + Math.random() * 2000);

                    // Maybe change car based on personality
                    if (brain.shouldChangeCar() && gameStatus.current === "waiting") {
                        const newCar = carOptions[Math.floor(Math.random() * carOptions.length)];
                        await mysupa
                            .from("participants")
                            .update({ car: newCar })
                            .eq("id", odorIdref.current);
                    }
                }

                // Wait for game to be active (skip countdown)
                while (gameStatus.current !== "active" && !stopSignal.current && mounted) {
                    await delay(500);
                }

                if (!mounted || stopSignal.current) return;

                // ========== PHASE 3: FETCH QUESTIONS FROM SERVER ==========
                // Questions are only available after game starts, so we fetch them here
                const { data: sessData, error: sessError } = await mysupa
                    .from("sessions")
                    .select("current_questions")
                    .eq("id", sessionId)
                    .single();

                if (sessError || !sessData?.current_questions?.length) {
                    onError(nicknameRef.current, "No questions available");
                    return;
                }

                const questions = sessData.current_questions;
                const totalQuestions = questions.length;
                const scorePerQuestion = Math.max(1, Math.floor(100 / totalQuestions));
                let runningTotalScore = 0; // Track running total to cap at 100

                // ========== PHASE 4: ANSWER QUESTIONS ==========
                const maxQuestions = Math.min(totalQuestions, questions.length); // Explicit boundary
                for (let qIndex = 0; qIndex < maxQuestions; qIndex++) {
                    if (!mounted || stopSignal.current) break;

                    // Thinking time based on IQ
                    await delay(brain.getAnswerDelay());
                    if (!mounted || stopSignal.current) break;

                    const question = questions[qIndex];
                    const correctIndex = parseInt(question.correct, 10);
                    const chosenAnswer = brain.chooseAnswer(correctIndex, 4);
                    const isCorrect = chosenAnswer === correctIndex;
                    // Cap score to ensure total never exceeds 100
                    const rawScore = isCorrect ? scorePerQuestion : 0;
                    const score = Math.min(rawScore, 100 - runningTotalScore);
                    runningTotalScore += score;

                    const newAnswer = {
                        id: generateXID(),
                        correct: isCorrect,
                        answer_id: chosenAnswer.toString(),
                        question_id: question.id,
                    };

                    const isLastQuestion = qIndex === totalQuestions - 1;
                    const shouldRace = (qIndex + 1) % 3 === 0 && !isLastQuestion;

                    try {
                        await mysupa.rpc("submit_quiz_answer_batch", {
                            p_participant_id: odorIdref.current,
                            p_new_answers: [newAnswer],
                            p_total_score_add: score,
                            p_total_correct_add: isCorrect ? 1 : 0,
                            p_next_index: qIndex + 1,
                            p_is_finished: isLastQuestion,
                            p_is_racing: shouldRace,
                        });

                        onAnswered(nicknameRef.current, qIndex + 1);

                        // Handle minigame (racing) - just wait a bit then continue
                        if (shouldRace) {
                            await delay(1000 + Math.random() * 2000);
                            await mysupa
                                .from("participants")
                                .update({ racing: false })
                                .eq("id", odorIdref.current);
                        }

                        if (isLastQuestion) {
                            onCompleted(nicknameRef.current);
                        }
                    } catch (err: any) {
                        onError(nicknameRef.current, err.message || "Answer failed");
                    }
                }
            } catch (err: any) {
                onError(nicknameRef.current || `Bot#${botId}`, err.message || "Unknown error");
            }
        };

        runBot();

        return () => {
            mounted = false;
        };
    }, [
        brain,
        botId,
        sessionId,
        roomCode,
        carOptions,
        nicknameGenerator,
        onJoined,
        onAnswered,
        onCompleted,
        onError,
        stopSignal,
        gameStatus,
    ]);

    return null; // No UI - logic only
}
