"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Clock, Hash, Play, Settings } from "lucide-react"
import { useRouter, useParams } from "next/navigation"
import { motion } from "framer-motion"
import { mysupa, supabase } from "@/lib/supabase"
import LoadingRetro from "@/components/loadingRetro"
import Image from "next/image"
import { t } from "i18next"
import { useHostGuard } from "@/lib/host-guard"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle } from "@/components/ui/dialog"

const APP_NAME = "crazyrace";

const backgroundGif = "/assets/background/host/7.webp"

export function shuffleArray(array: any[]) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled
}

export default function HostSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const roomCode = params.roomCode as string

  // Security: Verify host access
  useHostGuard(roomCode)

  const [duration, setDuration] = useState("300")
  const [questionCount, setQuestionCount] = useState("5")
  const [quiz, setQuiz] = useState<any>(null);
  const [quizDetail, setQuizDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedDifficulty, setSelectedDifficulty] = useState("easy");
  const [sessData, setSessData] = useState([] as any)
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Memoize question count options to prevent re-calculation on every render
  const questionCountOptions = useMemo(() => {
    const totalQuestions = quiz?.questions?.length || 0;
    if (totalQuestions === 0) return [5, 10, 20];
    const baseOptions = [5, 10, 20];
    return baseOptions.filter((count) => count <= totalQuestions);
  }, [quiz]);

  // Main fetch effect - runs only when roomCode changes
  useEffect(() => {
    const fetchSessionDetails = async () => {
      setLoading(true);

      const { data: sessionData, error: sessionError } = await supabase
        .from("game_sessions")
        .select("id, quiz_id, host_id, quiz_detail, total_time_minutes, question_limit, difficulty")
        .eq("game_pin", roomCode)
        .single();

      if (sessionError || !sessionData) {
        console.error("Error fetching game session:", sessionError);
        setLoading(false);
        router.push('/host');
        return;
      }

      setSessData(sessionData)

      if (sessionData.total_time_minutes) setDuration((sessionData.total_time_minutes * 60).toString());
      if (sessionData.question_limit) setQuestionCount(sessionData.question_limit.toString());
      if (sessionData.difficulty) setSelectedDifficulty(sessionData.difficulty);

      try {
        const parsedDetail = typeof sessionData.quiz_detail === 'string'
          ? JSON.parse(sessionData.quiz_detail)
          : sessionData.quiz_detail;
        setQuizDetail(parsedDetail);
      } catch (e) {
        console.error("Error parsing quiz_detail:", e);
      }

      const { data: quizData, error: quizError } = await supabase
        .from("quizzes")
        .select("questions")
        .eq("id", sessionData.quiz_id)
        .single();

      if (quizError) {
        console.error("Error fetching quiz:", quizError);
      } else {
        setQuiz(quizData);
      }
      setLoading(false);
    };

    if (roomCode) {
      fetchSessionDetails();
    }
  }, [roomCode, router]);

  // Effect to set default question count after quiz data is loaded
  useEffect(() => {
    if (!quiz) return;

    const totalQuestions = quiz.questions?.length || 0;
    if (totalQuestions > 0) {
      if (questionCountOptions.includes(5)) {
        setQuestionCount("5");
      } else if (questionCountOptions.length > 0) {
        const smallest = Math.min(...questionCountOptions);
        setQuestionCount(smallest.toString());
      }
    }
  }, [quiz, questionCountOptions]);

  const handleCreateRoom = async () => {
    if (saving || loading || !quiz) return;
    setSaving(true);

    const settings = {
      total_time_minutes: Math.floor(parseInt(duration) / 60),
      question_limit: parseInt(questionCount),
      difficulty: selectedDifficulty,
      current_questions: shuffleArray(quiz.questions).slice(
        0,
        parseInt(questionCount)
      ),
    };

    const { error } = await mysupa
      .from("sessions")
      .update(settings)
      .eq("game_pin", roomCode);

    if (error) {
      console.error("Gagal menyimpan pengaturan");
      setSaving(false);
      return;
    }

    localStorage.setItem("hostroomCode", roomCode);
    router.push(`/host/${roomCode}/lobby`);
  };

  const handleCancelSession = async () => {
    setIsDeleting(true);

    try {
      // Delete from both databases in parallel
      await Promise.allSettled([
        supabase.from("game_sessions").delete().eq("game_pin", roomCode),
        mysupa.from("sessions").delete().eq("game_pin", roomCode)
      ]);

      console.log("✅ Session deleted from both databases");

      // Clear localStorage
      localStorage.removeItem("hostGamePin");
      sessionStorage.removeItem("currentHostId");

      // Navigate back
      router.push('/host');
    } catch (err) {
      console.error("❌ Error deleting session:", err);
      router.push('/host');
    } finally {
      setIsDeleting(false);
      setShowCancelDialog(false);
    }
  };

  if (saving || loading) return <LoadingRetro />

  return (
    <div className="h-screen bg-[#1a0a2a] relative overflow-hidden">
      <motion.div
        className="absolute inset-0 w-full h-full bg-cover bg-center"
        style={{ backgroundImage: `url(${backgroundGif})` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 1, ease: "easeInOut" }}
      />
      {saving && <LoadingRetro />}
      {/* Scrollable Content Wrapper */}
      <div className="absolute inset-0 overflow-y-auto z-10">
        {/* Header - Full width, ikut scroll */}
        <div className="w-full px-4 py-4 pb-0 flex items-center justify-between">
          {/* Left side: Back button + Crazy Race logo */}
          <div className="flex items-center gap-4">
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }}
              className="p-3 bg-[#00ffff]/20 border-2 border-[#00ffff] pixel-button hover:bg-[#33ffff]/30 glow-cyan rounded-lg shadow-lg shadow-[#00ffff]/30 min-w-[48px] min-h-[48px] flex items-center justify-center"
              aria-label="Back to Host"
              onClick={() => setShowCancelDialog(true)}
            >
              <ArrowLeft size={20} className="text-white" />
            </motion.button>

            <div className="hidden md:block">
              <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
            </div>
          </div>

          {/* Right side: Gameforsmart logo */}
          <div className="hidden md:block">
            <Image src="/gameforsmartlogo.webp" alt="Gameforsmart Logo" width={256} height={64} />
          </div>
        </div>

        <div className="relative container mx-auto px-4 sm:px-6 py-6 pt-0 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-8">
            <div className="p-4 sm:p-6 pt-0"><h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#ffefff] pixel-text glow-pink">{t('settings.title')}</h1></div>
          </motion.div>
          {!quizDetail ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="text-center text-gray-400 pixel-text  text-sm sm:text-base">
              {t('settings.loadingSession')}
            </motion.p>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
              <Card className="bg-[#1a0a2a]/60 border-2 sm:border-4 border-[#ff87ff]/50 pixel-card glow-pink-subtle p-6 sm:p-8">
                <div className="space-y-6 sm:space-y-8">
                  <div className="p-3 sm:p-4 bg-[#0a0a0f] border-2 border-[#ff87ff]/30 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-1"><Hash className="h-5 w-5 text-[#ff87ff]" /></div>
                      <div className="flex-1 space-y-1">
                        <p className="text-base sm:text-lg text-[#ff87ff] pixel-text font-semibold">{quizDetail.title || t('settings.unknownQuiz')}</p>
                        <p className="text-[#00ffff] pixel-text text-xs sm:text-sm overflow-y-auto max-h-[60px]">{quizDetail.description || t('settings.noDescription')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2 sm:space-y-3">
                      <Label className="text-base sm:text-lg font-semibold flex items-center space-x-2 text-[#00ffff] pixel-text glow-cyan"><Clock className="h-4 w-4" /><span>{t('settings.title')}</span></Label>
                      <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger className="text-base sm:text-lg p-3 sm:p-5 bg-[#0a0a0f] border-2 border-[#00ffff]/30 text-white pixel-text focus:border-[#00ffff] w-full transition-all"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0a0a0f] border-2 sm:border-4 border-[#6a4c93] text-white pixel-text">
                          {Array.from({ length: 6 }, (_, i) => (i + 1) * 5).map((min) => (<SelectItem key={min} value={(min * 60).toString()}>{min} {t('settings.minutes')}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      <Label className="text-base sm:text-lg font-semibold flex items-center space-x-2 text-[#00ffff] pixel-text glow-cyan"><Hash className="h-4 w-4" /><span>{t('settings.questions')}</span></Label>
                      <Select value={questionCount} onValueChange={setQuestionCount}>
                        <SelectTrigger className="text-base sm:text-lg p-3 sm:p-5 bg-[#0a0a0f] border-2 border-[#00ffff]/30 text-white pixel-text focus:border-[#00ffff] w-full transition-all"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0a0a0f] border-2 sm:border-4 border-[#6a4c93] text-white pixel-text">
                          {questionCountOptions.map((count) => (<SelectItem key={count} value={count.toString()}>{count}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-4 sm:space-y-6">
                    <Label className="text-base sm:text-lg font-semibold flex items-center justify-center space-x-2 text-[#00ffff] pixel-text glow-cyan mb-4"><Settings className="h-4 w-4" /><span>{t('settings.difficulty')}</span></Label>
                    <div className="flex justify-center space-x-3 sm:space-x-6">
                      {["Easy", "Medium", "Hard"].map((diff) => (
                        <Button key={diff} onClick={() => setSelectedDifficulty(diff.toLowerCase().replace('medium', 'normal'))} className={`pixel-button text-sm sm:text-base px-6 sm:px-8 py-3 font-bold w-24 sm:w-28 transition-all duration-200 border-2 capitalize ${selectedDifficulty === diff.toLowerCase().replace('medium', 'normal') ? "bg-[#ff6bff] hover:bg-[#ff8aff] glow-pink text-white border-white shadow-lg shadow-[#ff6bff]/50" : "bg-[#0a0a0f] border-[#00ffff]/40 text-[#00ffff] hover:bg-[#00ffff]/10 hover:border-[#00ffff] hover:shadow-md hover:shadow-[#00ffff]/30"}`}>{t(`settings.difficultyOptions.${diff}`)}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-[#ff87ff]/20">
                    <Button onClick={handleCreateRoom} disabled={saving} className="w-full text-base sm:text-xl py-4 sm:py-6 bg-[#00ffff] pixel-button hover:bg-[#33ffff] glow-cyan text-black font-bold disabled:bg-[#6a4c93] disabled:cursor-not-allowed cursor-pointer transition-all shadow-lg shadow-[#00ffff]/30"><Play className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />{t('settings.start')}</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* ✅ Delete Confirmation Dialog */}
          <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
            <DialogOverlay className="bg-black/50 backdrop-blur-sm fixed inset-0 z-50" />
            <DialogContent className="bg-[#1a0a2a]/95 border-4 border-[#ff6bff] pixel-card max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl text-[#ff6bff] pixel-text glow-pink text-center">
                  {t("settings.deleteSession.title")}
                </DialogTitle>
                <DialogDescription className="text-center text-gray-300 pixel-text text-sm mt-4">
                  {t("settings.deleteSession.description")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowCancelDialog(false)}
                  disabled={isDeleting}
                  className="flex-1 pixel-button bg-[#0a0a0f] border-2 border-[#00ffff]/50 text-[#00ffff] hover:text-[#00ffff]/50 hover:bg-[#00ffff]/10"
                >
                  {t("settings.deleteSession.cancelButton")}
                </Button>
                <Button
                  onClick={handleCancelSession}
                  disabled={isDeleting}
                  className="flex-1 pixel-button bg-[#ff6bff] hover:bg-[#ff8aff] text-white border-2 border-white glow-pink"
                >
                  {isDeleting ? t("settings.deleteSession.deletingButton") : t("settings.deleteSession.deleteButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
        <style jsx>{`
        .pixel-text { image-rendering: pixelated; text-shadow: 2px 2px 0px #000; }
        .pixel-button { image-rendering: pixelated; box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8); transition: all 0.1s ease; }
        .pixel-button:hover:not(:disabled) { transform: translate(2px, 2px); box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.8); }
        .pixel-card { box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 107, 255, 0.2); transition: all 0.2s ease; }
        .pixel-card:hover { box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.9), 0 0 25px rgba(255, 107, 255, 0.4); }
        .glow-pink { animation: glow-pink 1.5s ease-in-out infinite; }
        .glow-cyan { animation: glow-cyan 1.5s ease-in-out infinite; }
        @keyframes glow-cyan { 0%, 100% { filter: drop-shadow(0 0 5px #00ffff); } 50% { filter: drop-shadow(0 0 15px #00ffff); } }
        @keyframes glow-pink { 0%, 100% { filter: drop-shadow(0 0 5px #ff6bff); } 50% { filter: drop-shadow(0 0 15px #ff6bff); } }
      `}</style>

      </div>
    </div>
  )
}
