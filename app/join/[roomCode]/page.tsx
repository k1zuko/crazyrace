"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { mysupa } from "@/lib/supabase";
import { useAuth } from "@/contexts/authContext";
import { useGlobalLoading } from "@/contexts/globalLoadingContext";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardTitle, CardDescription } from "@/components/ui/card";
import Image from "next/image";
import { useTranslation } from "react-i18next";

export default function CodePage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
  const roomCode = (params.roomCode as string)?.toUpperCase();
  const { user, profile, loading: authLoading } = useAuth();
  const { showLoading, hideLoading } = useGlobalLoading();

  const [showAlert, setShowAlert] = useState(false);
  const [alertReason, setAlertReason] = useState<
    | "general"
    | "duplicate"
    | "roomNotFound"
    | "sessionLocked"
    | "roomFull"
    | ""
  >("");
  const hasAttempted = useRef(false);

  const closeAlert = () => {
    setShowAlert(false);
    setAlertReason("");
    hideLoading();
    router.replace("/");
  };

  useEffect(() => {
    // Show global loading immediately on mount
    showLoading();

    return () => {
      // Cleanup: hide loading if component unmounts without completing
      // But don't hide if we're navigating to lobby (success case)
    };
  }, []);

  useEffect(() => {
    if (!roomCode || authLoading || hasAttempted.current) return;

    // Jika belum login, redirect ke login dengan pending code
    if (!user) {
      localStorage.setItem("pendingRoomCode", roomCode);
      hideLoading(); // Hide before redirect so login page can show its own UI
      router.replace("/login");
      return;
    }

    // Tunggu profile loaded
    if (!profile?.id || profile.id.startsWith('fallback-')) return;

    hasAttempted.current = true;

    const autoJoin = async () => {
      try {
        // Generate nickname: priority nickname > fullname > username > email
        const nickname =
          profile.nickname?.trim() ||
          profile.fullname?.trim() ||
          profile.username?.trim() ||
          user.email?.split("@")[0] ||
          "Player";

        // Call join_game RPC
        const { data, error } = await mysupa.rpc("join_game", {
          p_room_code: roomCode,
          p_user_id: profile.id,
          p_nickname: nickname,
        });

        if (!data || error) {
          console.error("Join RPC error:", error);
          setAlertReason("general");
          setShowAlert(true);
          hideLoading();
          return;
        }

        // Handle specific errors from RPC
        if (data.error) {
          switch (data.error) {
            case "duplicate_nickname":
              setAlertReason("duplicate");
              break;
            case "room_not_found":
              setAlertReason("roomNotFound");
              break;
            case "session_locked":
              setAlertReason("sessionLocked");
              break;
            case "room_full":
              setAlertReason("roomFull");
              break;
            default:
              setAlertReason("general");
          }
          setShowAlert(true);
          hideLoading();
          return;
        }

        // Success! Save data and redirect to lobby
        // Keep global loading visible during navigation!
        localStorage.setItem("nickname", data.nickname);
        localStorage.setItem("participantId", data.participant_id);
        localStorage.setItem("game_pin", roomCode);
        localStorage.removeItem("pendingRoomCode");
        localStorage.removeItem("roomCode");

        // Navigate to lobby - loading will be hidden by lobby when it's ready
        router.replace(`/player/${roomCode}/lobby`);
      } catch (err) {
        console.error("Auto-join error:", err);
        setAlertReason("general");
        setShowAlert(true);
        hideLoading();
      }
    };

    autoJoin();
  }, [roomCode, user, profile, authLoading, router, showLoading, hideLoading]);

  // Return empty div - global loading is shown via context
  return (
    <>
      {/* Alert Modal - same style as HomePage */}
      <AnimatePresence>
        {showAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            onClick={closeAlert}
          >
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md max-h-[70vh] overflow-hidden bg-[#1a0a2a]/60 border-4 border-[#ff6bff]/50 rounded-2xl shadow-2xl shadow-[#ff6bff]/40 backdrop-blur-md text-center p-6"
              onClick={(e) => e.stopPropagation()}
              style={{ boxShadow: '8px 8px 0px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 107, 255, 0.3)' }}
            >
              <div className="mb-4">
                <Image
                  src="/assets/car/car3_v2.webp"
                  alt="Car alert animation"
                  width={200}
                  height={150}
                  className="mx-auto rounded-lg"
                />
              </div>
              <CardTitle className="text-xl font-bold text-[#ff6bff] mb-2" style={{ textShadow: '2px 2px 0px #000', filter: 'drop-shadow(0 0 8px #ff6bff) drop-shadow(0 0 16px #ff6bff)' }}>
                {t(`alert.${alertReason}.title`)}
              </CardTitle>
              <CardDescription className="text-[#00ffff]/80 mb-6" style={{ textShadow: '2px 2px 0px #000' }}>
                {t(`alert.${alertReason}.message`)}
              </CardDescription>
              <Button
                onClick={closeAlert}
                className="w-full bg-gradient-to-r from-[#ff6bff] to-[#ff6bff] hover:from-[#ff8aff] text-white cursor-pointer"
                style={{ boxShadow: '6px 6px 0px rgba(0, 0, 0, 0.8)' }}
              >
                {t("alert.closeButton")}
              </Button>
              <button
                onClick={closeAlert}
                className="absolute top-3 right-3 p-2 bg-[#1a0a2a]/60 border-2 border-[#ff6bff]/50 rounded-lg text-[#00ffff] hover:bg-[#ff6bff]/20 cursor-pointer"
                aria-label="Close alert"
              >
                <X size={20} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
