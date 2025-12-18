"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Flag,
  Users,
  Menu,
  X,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Globe,
  Dices,
  ScanLine,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { mysupa, supabase } from "@/lib/supabase";
import Image from "next/image";
import { usePreloaderScreen } from "@/components/preloader-screen";
import LoadingRetroScreen from "@/components/loading-screnn";
import { useAuth } from "@/contexts/authContext";
import { generateXID } from "@/lib/id-generator";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import dynamic from "next/dynamic";
import { usePWAInstall } from "@/contexts/pwaContext";
import PWAInstallBanner from "@/components/ui/pwa-install-banner";

const Scanner = dynamic(
  () =>
    import("@yudiel/react-qr-scanner").then((mod) => ({
      default: mod.Scanner,
    })),
  { ssr: false }
);

const APP_NAME = "crazyrace";

function LogoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.replace("/login");
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ display: open ? "flex" : "none" }}
    >
      <div
        className="bg-black/80 backdrop-blur-sm w-full h-full absolute"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative bg-[#1a0a2a]/80 border border-cyan-400/30 p-6 rounded-lg text-white max-w-lg mx-auto">
        <h2 className="text-xl font-bold text-[#00ffff] mb-4 pixel-text">
          {t("logoutDialog.title")}
        </h2>
        <p className="text-gray-300 mb-6 pixel-text">
          {t("logoutDialog.message")}
        </p>
        <div className="flex gap-4 justify-end">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("logoutDialog.cancel")}
          </Button>
          <Button
            onClick={handleLogout}
            disabled={loading}
            className="bg-red-500"
          >
            {loading ? t("logoutDialog.loading") : t("logoutDialog.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { user, profile, loading: authLoading } = useAuth();
  const { installPrompt, handleInstall: handlePWAInstall } = usePWAInstall();

  const [isBannerVisible, setBannerVisible] = useState(false);
  const [joining, setJoining] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [showTryoutInput, setShowTryoutInput] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState("en");
  const [showAlert, setShowAlert] = useState(false);
  const [alertReason, setAlertReason] = useState<
    | "roomCode"
    | "nickname"
    | "both"
    | "general"
    | "duplicate"
    | "roomNotFound"
    | "pwaInstallUnavailable"
    | "sessionLocked"
    | ""
  >("");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const adjectives = [
    "Crazy",
    "Fast",
    "Speedy",
    "Turbo",
    "Neon",
    "Pixel",
    "Racing",
    "Wild",
    "Epic",
    "Flash",
  ];
  const nouns = [
    "Racer",
    "Driver",
    "Speedster",
    "Bolt",
    "Dash",
    "Zoom",
    "Nitro",
    "Gear",
    "Track",
    "Lap",
  ];
  const languages = [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩" },
  ];

  const isInstalled =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem("pwaBannerDismissed") === "true";
    if (installPrompt && !dismissed && !isInstalled) {
      setBannerVisible(true);
    }
  }, [installPrompt, isInstalled]);

  const handleDismissBanner = () => {
    localStorage.setItem("pwaBannerDismissed", "true");
    setBannerVisible(false);
  };

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const rawResult = detectedCodes[0].rawValue;
      let extractedCode = "";
      if (
        typeof rawResult === "string" &&
        (rawResult.startsWith("http://") || rawResult.startsWith("https://"))
      ) {
        try {
          const url = new URL(rawResult);
          const params = new URLSearchParams(url.search);
          extractedCode =
            params.get("code") || url.pathname.split("/").pop() || "";
        } catch (e) {
          extractedCode = rawResult.replace(/[^a-zA-Z0-9]/g, "");
        }
      } else if (typeof rawResult === "string") {
        extractedCode = rawResult.replace(/[^a-zA-Z0-9]/g, "");
      }

      extractedCode = extractedCode.toUpperCase().substring(0, 6);

      if (extractedCode.length === 6 && /^[A-Z0-9]{6}$/.test(extractedCode)) {
        setRoomCode(extractedCode);
        setOpen(false);
        setError(null);
      } else {
        setError(
          `Invalid QR code: "${extractedCode}". Must be 6 letters/numbers. Please scan again.`
        );
      }
    }
  };

  const handleError = (error: unknown) => {
    const errorAsError =
      error instanceof Error ? error : new Error(String(error));
    let message = "Scan error. Please try again!";
    if (errorAsError.name === "NotAllowedError") {
      message =
        "Please allow camera access in your browser. If you denied it, refresh the page and try again.";
    } else if (errorAsError.name === "NotFoundError") {
      message = "No camera found. Check your hardware or browser permissions.";
    } else if (errorAsError.message.includes("secure context")) {
      message =
        "Camera access requires a secure connection (HTTPS or localhost).";
    }
    setError(message);
  };

  const generateNickname = () => {
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${randomAdj}${randomNoun}`;
  };

  const getAlertMessage = (reason: string) => t(`alert.${reason}.message`);
  const closeAlert = () => {
    setShowAlert(false);
    setAlertReason("");
  };

  const steps = t("howToPlay.steps", { returnObjects: true }) as Array<{
    title: string;
    content: string;
  }>;
  const totalPages = steps.length;

  const handleLanguageSelect = (code: string, name: string) => {
    i18n.changeLanguage(code);
    setCurrentLanguage(code);
    localStorage.setItem("language", code);
    setShowLanguageMenu(false);
  };

  // Di useEffect yang set nickname
  useEffect(() => {
    if (authLoading) return;

    const setupNickname = async () => {
      try {
        let nick = generateNickname();

        // ✅ Priority order: fullname > username > fallback
        if (profile?.fullname && profile.fullname.trim()) {
          nick = profile.fullname;
        } else if (profile?.username && profile.username.trim()) {
          nick = profile.username;
        } else if (user?.email) {
          nick = user.email.split("@")[0];
        } else {
          nick = generateNickname();
        }

        setNickname(nick);
        localStorage.setItem("nickname", nick);
      } catch (error) {
        console.error("Error setting up nickname:", error);
        // Fallback to generated nickname
        const fallbackNick = generateNickname();
        setNickname(fallbackNick);
        localStorage.setItem("nickname", fallbackNick);
      }
    };

    setupNickname();
  }, [user, profile, authLoading]); // ✅ FIX: Removed unnecessary i18n dependency

  useEffect(() => {
    if (authLoading) return;
    const codelink = localStorage.getItem("roomCode");
    const code = searchParams.get("code");
    if (code) {
      setRoomCode(code.toUpperCase());
      router.replace(pathname, undefined);
    } else if (codelink) {
      setRoomCode(codelink.toUpperCase());
    }
    if (
      typeof window !== "undefined" &&
      window.location.hash.includes("access_token")
    ) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState({}, document.title, url.toString());
    }
  }, [authLoading, user, searchParams, pathname, router]);

  // REFACTORED: Uses the 'join_game_session' RPC for a safe, atomic join process.
  const handleJoin = async () => {
    // ✅ Validasi input
    if (roomCode.length !== 6 || !nickname.trim()) {
      setAlertReason(roomCode.length !== 6 ? "roomCode" : "nickname");
      setShowAlert(true);
      return;
    }

    // ✅ Validasi profile sudah ter-fetch dan valid
    if (!profile?.id || profile.id.startsWith('fallback-')) {
      console.warn('⚠️ Profile not fully loaded, retrying...');
      setAlertReason("general");
      setShowAlert(true);
      return;
    }

    // ✅ Validasi fullname/username sudah ter-fetch
    if (!profile?.fullname && !profile?.username) {
      console.warn('⚠️ Profile name not loaded properly');
      setAlertReason("general");
      setShowAlert(true);
      return;
    }

    setJoining(true);
    try {
      const { data, error } = await mysupa.rpc("join_game", {
        p_room_code: roomCode,
        p_user_id: profile.id,
        p_nickname: nickname.trim(),
      });

      if (!data || error) {
        console.error('❌ Join game RPC error:', error);
        setAlertReason("general");
        setShowAlert(true);
        setJoining(false);
        return;
      }

      if (data.error === "duplicate_nickname") {
        setAlertReason("duplicate");
        setShowAlert(true);
        setJoining(false);
        return;
      }

      if (data.error === "room_not_found") {
        setAlertReason("roomNotFound");
        setShowAlert(true);
        setJoining(false);
        return;
      }

      if (data.error === "session_locked") {
        // status = active / finished, user belum join sebelumnya
        setAlertReason("sessionLocked");
        setShowAlert(true);
        setJoining(false);
        return;
      }

      // ✅ Aman (reconnect / join baru)
      localStorage.setItem("nickname", data.nickname);
      localStorage.setItem("participantId", data.participant_id);
      localStorage.setItem("game_pin", roomCode);

      router.push(`/player/${roomCode}/lobby`);

    } catch (error: any) {
      console.error("❌ Join error:", error);
      setAlertReason("general");
      setShowAlert(true);
      setJoining(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleTryout = () => {
    if (!nickname.trim()) {
      setAlertReason("nickname");
      setShowAlert(true);
      return;
    }
    setJoining(true);
    localStorage.setItem("tryout_nickname", nickname.trim());
    router.push("/tryout");
  };

  const { isLoaded, progress } = usePreloaderScreen();
  if (!isLoaded) return <LoadingRetroScreen progress={progress} />;

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(console.warn);
    else document.exitFullscreen().catch(console.warn);
  };

  const closeHowToPlay = () => {
    setShowHowToPlay(false);
    setCurrentPage(0);
  };
  const goToNextPage = () => {
    if (currentPage === totalPages - 1) closeHowToPlay();
    else setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  return (
    <div
      className={`min-h-[100dvh] w-full relative overflow-hidden pixelated pixel-font ${isLoaded ? "p-2" : ""
        }`}
    >
      <Image
        src="/assets/background/1.webp"
        alt="Crazy Race Background"
        fill
        className="object-cover"
        priority
      />
      <h1 className="absolute top-6 md:top-4 left-4 w-42 md:w-50 lg:w-100">
        <Image
          src="/gameforsmartlogo.webp"
          alt="Gameforsmart Logo"
          width="256"
          height="64"
          priority
        />
      </h1>

      {isBannerVisible && (
        <PWAInstallBanner
          onInstall={() => {
            handlePWAInstall();
            setBannerVisible(false);
          }}
          onDismiss={handleDismissBanner}
        />
      )}

      <AnimatePresence>
        {showAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
              className="relative w-full max-w-md max-h-[70vh] overflow-hidden bg-[#1a0a2a]/60 border-4 border-[#ff6bff]/50 rounded-2xl shadow-2xl shadow-[#ff6bff]/40 backdrop-blur-md pixel-card text-center p-6"
              onClick={(e) => e.stopPropagation()}
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
              <CardTitle className="text-xl font-bold text-[#ff6bff] mb-2 pixel-text glow-pink">
                {t(`alert.${alertReason}.title`)}
              </CardTitle>
              <CardDescription className="text-[#00ffff]/80 mb-6 pixel-text glow-cyan-subtle">
                {getAlertMessage(alertReason)}
              </CardDescription>
              <Button
                onClick={closeAlert}
                className="w-full bg-gradient-to-r from-[#ff6bff] to-[#ff6bff] hover:from-[#ff8aff] text-white pixel-button glow-pink"
              >
                {t("alert.closeButton")}
              </Button>
              <button
                onClick={closeAlert}
                className="absolute top-3 right-3 p-2 bg-[#1a0a2a]/60 border-2 border-[#ff6bff]/50 rounded-lg text-[#00ffff] hover:bg-[#ff6bff]/20 glow-cyan-subtle"
                aria-label="Close alert"
              >
                <X size={20} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="absolute top-4 right-4 z-40 p-3 bg-[#1a0a2a]/60 border-2 border-[#ff6bff]/50 hover:border-[#ff6bff] pixel-button hover:bg-[#ff6bff]/20 glow-pink-subtle rounded-lg shadow-lg shadow-[#ff6bff]/30 min-w-[48px] min-h-[48px] flex items-center justify-center"
        aria-label="Toggle menu"
      >
        {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </motion.button>
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="absolute top-20 right-4 z-30 w-64 bg-[#1a0a2a]/60 border-4 border-[#ff6bff]/50 rounded-lg p-4 shadow-xl shadow-[#ff6bff]/30 backdrop-blur-sm scrollbar-themed max-h-[70vh] overflow-y-auto"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-[#1a0a2a]/80 border border-[#00ffff]/30 rounded-lg mb-5">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center overflow-hidden">
                  {authLoading ? (
                    <div className="flex items-center justify-center w-full h-full text-gray-400">
                      ...
                    </div>
                  ) : profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Profile"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-bold text-white pixel-text">
                      {profile?.fullname?.charAt(0)?.toUpperCase() ||
                        profile?.username?.charAt(0)?.toUpperCase() ||
                        user?.email?.charAt(0)?.toUpperCase() ||
                        "U"}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#00ffff] pixel-text truncate">
                    {profile?.fullname ||
                      profile?.username ||
                      user?.email?.split("@")[0] ||
                      t("menu.user")}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleFullscreen}
                className="w-full p-2 bg-[#1a0a2a]/60 border-2 border-[#00ffff]/50 hover:border-[#00ffff] pixel-button hover:bg-[#00ffff]/20 glow-cyan-subtle rounded text-center"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#00ffff] pixel-text glow-cyan">
                    {isFullscreen
                      ? t("menu.exitFullscreen")
                      : t("menu.fullscreen")}
                  </span>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowHowToPlay(true);
                  setIsMenuOpen(false);
                }}
                className="w-full p-2 bg-[#1a0a2a]/60 border-2 border-[#ff6bff]/50 hover:border-[#ff6bff] pixel-button hover:bg-[#ff6bff]/20 glow-pink-subtle rounded text-center"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#00ffff] pixel-text glow-cyan">
                    {t("menu.howToPlay")}
                  </span>
                </div>
              </button>
              <button
                onClick={() => setShowTryoutInput(!showTryoutInput)}
                className="w-full p-2 bg-[#1a0a2a]/60 border-2 border-[#ff6bff]/50 hover:border-[#ff6bff] pixel-button hover:bg-[#ff6bff]/20 glow-pink-subtle rounded text-center"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#ff6bff] pixel-text glow-pink">
                    {t("menu.soloTryout")}
                  </span>
                </div>
              </button>
              <AnimatePresence>
                {showTryoutInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <div className="relative">
                      <Input
                        placeholder={t("joinRace.nicknamePlaceholder")}
                        value={nickname}
                        maxLength={15}
                        onChange={(e) => setNickname(e.target.value)}
                        className="bg-[#1a0a2a]/50 border-[#ff6bff]/50 text-[#ff6bff] placeholder:text-[#ff6bff]/50 text-center text-xs pixel-text h-8 rounded focus:border-[#ff6bff] focus:ring-[#ff6bff]/30 pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setNickname(generateNickname())}
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 text-[#ff6bff] hover:bg-[#ff6bff]/20 hover:border-[#ff6bff] transition-all duration-200 glow-pink-subtle p-1"
                      >
                        <span className="text-sm">🎲</span>
                      </button>
                    </div>
                    <Button
                      onClick={() => {
                        handleTryout();
                        setIsMenuOpen(false);
                      }}
                      disabled={joining}
                      className={`w-full text-xs ${joining
                        ? "opacity-50 cursor-not-allowed"
                        : "bg-gradient-to-r from-[#ff6bff] to-[#ff6bff] hover:from-[#ff8aff] hover:to-[#ffb3ff] text-white border-[#ff6bff]/80 hover:border-[#ff8aff]/80 glow-pink cursor-pointer"
                        } pixel-button`}
                    >
                      {joining ? t("menu.starting") : t("menu.tryoutButton")}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                disabled={isInstalled || !installPrompt}
                onClick={handlePWAInstall}
                className="w-full p-2 bg-[#1a0a2a]/60 border-2 border-[#00ffff]/50 hover:border-[#00ffff] pixel-button hover:bg-[#00ffff]/20 glow-cyan-subtle rounded text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#00ffff] pixel-text glow-cyan">
                    {isInstalled
                      ? t("menu.appInstalled")
                      : t("menu.installApp")}
                  </span>
                </div>
              </button>
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="w-full p-2 bg-[#1a0a2a]/60 border-2 border-[#00ffff]/50 hover:border-[#00ffff] pixel-button hover:bg-[#00ffff]/20 glow-cyan-subtle rounded text-center"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#00ffff] pixel-text glow-cyan">
                    {t("menu.language")}
                  </span>
                </div>
              </button>
              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden grid grid-cols-2 gap-2"
                  >
                    {languages.map((lang) => (
                      <motion.button
                        key={lang.code}
                        onClick={() =>
                          handleLanguageSelect(lang.code, lang.name)
                        }
                        whileHover={{ scale: 1.02 }}
                        className={`flex items-center justify-center p-3 bg-[#1a0a2a]/80 border border-[#00ffff]/30 rounded-lg transition-all duration-200 hover:bg-[#00ffff]/20 hover:border-[#00ffff] ${currentLanguage === lang.code
                          ? "border-[#00ffff] bg-[#00ffff]/10"
                          : ""
                          }`}
                      >
                        <span className="text-3xl">{lang.flag}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  setShowLogoutDialog(true);
                }}
                className="w-full p-2 bg-[#1a0a2a]/60 border-2 border-[#ff6bff]/50 hover:border-[#ff6bff] pixel-button hover:bg-[#ff6bff]/20 glow-pink-subtle rounded text-center"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-[#ff0000] pixel-text glow-pink">
                    {t("menu.logout")}
                  </span>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showHowToPlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={closeHowToPlay}
          >
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-br from-[#1a0a2a]/70 via-[#1a0a2a]/50 to-[#1a0a2a]/70 border border-[#ff6bff]/30 rounded-3xl shadow-2xl shadow-[#ff6bff]/25 backdrop-blur-xl pixel-card scrollbar-themed book-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeHowToPlay}
                className="absolute top-4 right-4 z-10 p-2 bg-[#1a0a2a]/80 border border-[#00ffff]/40 rounded-xl text-[#00ffff] hover:bg-[#00ffff]/10 hover:border-[#00ffff]/60 transition-all duration-300 glow-cyan-subtle shadow-lg shadow-[#00ffff]/20 hover:shadow-[#00ffff]/40"
                aria-label="Close modal"
              >
                <X size={18} className="stroke-current" />
              </button>
              <CardHeader className="text-center border-b border-[#ff6bff]/15 p-6 pt-16 pb-4">
                <CardTitle className="text-2xl font-bold text-[#00ffff] pixel-text glow-cyan mb-3 tracking-wide">
                  {t("howToPlay.title")}
                </CardTitle>
                <CardDescription className="text-[#ff6bff]/70 text-sm pixel-text glow-pink-subtle leading-relaxed">
                  {t("howToPlay.description")}
                </CardDescription>
                <p className="text-xs text-gray-300 mt-3 pixel-text opacity-80">
                  Page {currentPage + 1} of {totalPages}
                </p>
              </CardHeader>
              <div className="flex-1 p-6 overflow-hidden min-h-[200px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPage}
                    initial={{ x: "100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "-100%", opacity: 0 }}
                    transition={{
                      duration: 0.5,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                    className="h-full flex flex-col justify-center items-center book-page"
                  >
                    <div className="text-center mb-6 w-full">
                      <h3 className="text-xl font-bold text-[#00ffff] mb-4 pixel-text glow-cyan tracking-wide">
                        {steps[currentPage].title}
                      </h3>
                      <p className="text-gray-200 leading-relaxed pixel-text text-center max-w-sm mx-auto text-base">
                        {steps[currentPage].content}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <CardFooter className="border-t border-[#ff6bff]/15 p-6 pt-4 bg-[#1a0a2a]/60 backdrop-blur-sm rounded-b-3xl">
                <div className="w-full flex items-center justify-between">
                  <Button
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className={`flex items-center gap-2 px-6 py-3 bg-transparent hover:bg-[#00ffff]/10 border-2 border-[#00ffff]/40 text-[#00ffff] pixel-button glow-cyan-subtle transition-all duration-300 shadow-md shadow-[#00ffff]/20 hover:shadow-[#00ffff]/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
                  >
                    <ArrowLeft size={18} className="stroke-current" />
                  </Button>
                  <div className="flex space-x-3">
                    {steps.map((_, index) => (
                      <motion.button
                        key={index}
                        onClick={() => setCurrentPage(index)}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.95 }}
                        className={`w-3 h-3 rounded-full transition-all duration-300 shadow-sm ${index === currentPage
                          ? "bg-[#a100ff] shadow-lg shadow-[#a100ff]/40 scale-125"
                          : "bg-white/20 hover:bg-white/40 hover:scale-110"
                          }`}
                      />
                    ))}
                  </div>
                  <Button
                    onClick={goToNextPage}
                    className="flex items-center gap-2 px-6 py-3 bg-transparent hover:bg-[#ff6bff]/10 border-2 border-[#ff6bff]/40 text-[#ff6bff] pixel-button glow-pink-subtle transition-all duration-300 shadow-md shadow-[#ff6bff]/20 hover:shadow-[#ff6bff]/40"
                  >
                    {currentPage === totalPages - 1 ? (
                      <BookOpen size={18} className="stroke-current" />
                    ) : (
                      <ArrowRight size={18} className="stroke-current" />
                    )}
                  </Button>
                </div>
              </CardFooter>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
        <div className="text-center relative pb-5 sm:pt-3 pt-16 space-y-3 flex flex-col items-center">
          <Image src="/crazyrace-logo-utama.png" alt="Crazy Race Logo" width={400} height={400} style={{ imageRendering: 'auto' }} className="w-[250px] sm:w-[300px] md:w-[350px] lg:w-[400px] h-auto mx-auto drop-shadow-xl" />
          <div
            className="pixel-border-small inline-block"
            style={{
              border: "2px solid #ff6bff",
              boxShadow: "0 0 10px #ff6bff, 0 0 20px #ff6bff",
              borderRadius: "4px",
            }}
          >
            <p className="text-xs md:text-base px-4 py-2 bg-[#1a0a2a] text-white">
              {t("mainTitle.subtitle")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl w-full px-4 grid-rows-none sm:grid-flow-row grid-flow-dense max-sm:[grid-template-areas:'join'_'host']">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            whileHover={{ scale: 1.02 }}
            className="group max-sm:[grid-area:host]"
          >
            <Card className="bg-[#1a0a2a]/70 border-[#00ffff]/70 hover:border-[#00ffff] transition-all duration-300 sm:h-full shadow-[0_0_15px_rgba(255,107,255,0.3)] pixel-card">
              <CardHeader className="text-center">
                <motion.div
                  className="w-16 h-16 bg-gradient-to-br from-[#00ffff] to-[#120512] border-2 border-white rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:shadow-[0_0_15px_rgba(255,107,255,0.7)] transition-all duration-300"
                  whileHover={{ rotate: 5 }}
                >
                  <Flag className="w-8 h-8 text-white" />
                </motion.div>
                <CardTitle className="text-base md:text-xl font-bold text-[#00ffff] pixel-text glow-pink">
                  {t("hostGame.title")}
                </CardTitle>
                <CardDescription className="text-xs md:text-sm text-[#00ffff]/80 pixel-text glow-pink-subtle">
                  {t("hostGame.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push("/host")} className="w-full bg-gradient-to-r from-[#3ABEF9] to-[#3ABEF9] hover:from-[#3ABEF9] hover:to-[#A7E6FF] text-white focus:ring-[#00ffff]/30 transition-all duration-200 cursor-pointer">
                  {t("hostGame.button")}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            whileHover={{ scale: 1.02 }}
            className="group max-sm:[grid-area:join]"
          >
            <Card className="bg-[#1a0a2a]/70 border-[#00ffff]/70 hover:border-[#00ffff] transition-all duration-300 h-full shadow-[0_0_15px_rgba(0,255,255,0.3)] pixel-card gap-4 md:gap-5">
              <CardHeader className="text-center">
                <motion.div
                  className="w-16 h-16 bg-gradient-to-br from-[#00ffff] to-[#1a0a2a] group-hover:shadow-[0_0_15px_rgba(0,255,255,0.7)] border-2 border-white rounded-xl flex items-center justify-center mx-auto mb-4 transition-all duration-300"
                  whileHover={{ rotate: -5 }}
                >
                  <Users className="w-8 h-8 text-white" />
                </motion.div>
                <CardTitle className="text-base md:text-xl font-bold text-[#00ffff] glow-cyan pixel-text">
                  {t("joinRace.title")}
                </CardTitle>
                <CardDescription className="text-xs md:text-sm text-[#00ffff]/80 glow-cyan-subtle pixel-text">
                  {t("joinRace.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="relative flex items-center">
                  <Input
                    placeholder={t("joinRace.roomCodePlaceholder")}
                    value={roomCode}
                    maxLength={6}
                    onChange={(e) => {
                      const value = e.target.value
                        .replace(/[^a-zA-Z0-9]/g, "")
                        .toUpperCase();
                      setRoomCode(value);
                    }}
                    className="bg-[#1a0a2a]/50 border-[#00ffff]/50 text-[#00ffff] placeholder:text-[#00ffff]/50 text-center text-xs md:text-sm pixel-text h-10 rounded-xl focus:border-[#00ffff] focus:ring-[#00ffff]/30 pr-10"
                    aria-label="Room Code"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#00ffff] hover:bg-[#00ffff]/20 transition-all duration-200 glow-cyan-subtle p-1"
                    aria-label="Scan QR"
                  >
                    <ScanLine className="w-5 h-5" />
                  </button>
                </div>
                <div className="relative flex items-center">
                  <Input
                    placeholder={t("joinRace.nicknamePlaceholder")}
                    value={nickname}
                    maxLength={15}
                    onChange={(e) => setNickname(e.target.value)}
                    className="bg-[#1a0a2a]/50 border-[#00ffff]/50 text-[#00ffff] placeholder:text-[#00ffff]/50 text-center text-xs md:text-sm pixel-text h-10 rounded-xl focus:border-[#00ffff] focus:ring-[#00ffff]/30 pr-10"
                    aria-label="Nickname"
                  />
                  <button
                    type="button"
                    onClick={() => setNickname(generateNickname())}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#00ffff] hover:bg-[#00ffff]/20 transition-all duration-200 glow-cyan-subtle p-1"
                    aria-label="Generate Nickname"
                  >
                    <Dices className="w-5 h-5" />
                  </button>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleJoin}
                  disabled={joining || authLoading}
                  className={`w-full transition-all duration-300 ease-in-out pixel-button-large retro-button ${joining
                    ? "opacity-50 cursor-not-allowed"
                    : `bg-gradient-to-r from-[#3ABEF9] to-[#3ABEF9] hover:from-[#3ABEF9] hover:to-[#A7E6FF] text-white border-[#0070f3]/80 hover:border-[#0ea5e9]/80 glow-cyan cursor-pointer`
                    }`}
                >
                  {joining ? t("joinRace.joining") : t("joinRace.joinButton")}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0a0a0a]/90 border-[#00ffff]/50 max-w-md mx-auto p-0">
          <DialogHeader className="p-4 border-b border-[#00ffff]/20">
            <DialogTitle className="text-[#00ffff] text-center text-sm pixel-text">
              Scan QR Code Room
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 flex flex-col items-center space-y-4">
            <div className="relative w-full max-w-xs">
              <Scanner
                onScan={handleScan}
                onError={handleError}
                constraints={{ facingMode: "environment" }}
                classNames={{
                  container:
                    "rounded-lg overflow-hidden border border-[#00ffff]/30",
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[#00ffff]/70 hover:text-[#00ffff] text-sm transition-colors"
            >
              Batal
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <LogoutDialog
        open={showLogoutDialog}
        onOpenChange={setShowLogoutDialog}
      />
      <style jsx>{`
        .pixel-text { image-rendering: pixelated; text-shadow: 2px 2px 0px #000; }
        .pixel-text-outline { color: white; text-shadow: 3px 0px 0px #000, -3px 0px 0px #000, 0px 3px 0px #000, 0px -3px 0px #000, 2px 2px 0px #000, -2px -2px 0px #000; }
        .pixel-button { image-rendering: pixelated; box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8); transition: all 0.1s ease; }
        .pixel-button:hover { transform: translate(2px, 2px); box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.8); }
        .pixel-button-large { image-rendering: pixelated; box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.8); transition: all 0.1s ease; }
        .pixel-button-large:hover { transform: translate(3px, 3px); box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.8); }
        .retro-button { position: relative; padding: 12px; font-size: 1.1rem; text-transform: uppercase; image-rendering: pixelated; border-radius: 8px; transition: all 0.2s ease; animation: pulse-retro 1.5s ease-in-out infinite; background: #1a0a2a; border: 2px solid #00ffff; }
        .retro-button:hover { transform: scale(1.05); box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 255, 255, 0.6); filter: brightness(1.2); }
        .pixel-border-large { border: 4px solid #00ffff; position: relative; background: linear-gradient(45deg, #1a0a2a, #2d1b69); padding: 2rem; box-shadow: 0 0 20px rgba(0, 255, 255, 0.3); }
        .pixel-border-large::before { content: ''; position: absolute; top: -8px; left: -8px; right: -8px; bottom: -8px; border: 2px solid #00ffff; z-index: -1; }
        .pixel-border-small { border: 2px solid #00ffff; background: #1a0a2a; box-shadow: 0 0 10px rgba(0, 255, 255, 0.3); }
        .pixel-card { box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.8), 0 0 15px rgba(0, 255, 255, 0.2); transition: all 0.2s ease; }
        .pixel-card:hover { box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 255, 255, 0.4); }
        .book-modal { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 255, 255, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
        .book-page { background: linear-gradient(135deg, #2d1b69 0%, #1a0a2a 100%); border-radius: 12px; padding: 2rem; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 4px 8px rgba(0, 255, 255, 0.1); }
        .glow-pink { animation: glow-pink 1.5s ease-in-out infinite; }
        .glow-pink-subtle { animation: glow-pink 2s ease-in-out infinite; filter: drop-shadow(0 0 3px rgba(255, 107, 255, 0.5)); }
        .glow-cyan { animation: glow-cyan 1.5s ease-in-out infinite; }
        .glow-cyan-subtle { animation: glow-cyan 2s ease-in-out infinite; filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.5)); }
        @keyframes scanline { 0% { background-position: 0 0; } 100% { background-position: 0 100%; } }
        @keyframes glow-cyan { 0%, 100% { filter: drop-shadow(0 0 5px #00ffff); } 50% { filter: drop-shadow(0 0 15px #00ffff); } }
        @keyframes glow-pink { 0%, 100% { filter: drop-shadow(0 0 5px #ff6bff); } 50% { filter: drop-shadow(0 0 15px #ff6bff); } }
        @keyframes pulse-retro { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
        .scrollbar-themed::-webkit-scrollbar { width: 8px; }
        .scrollbar-themed::-webkit-scrollbar-track { background: linear-gradient(to bottom, #1a0a2a, #2d1b69); border: 1px solid rgba(0, 255, 255, 0.3); border-radius: 4px; box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.5); }
        .scrollbar-themed::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #00ffff, #ff6bff); border-radius: 4px; border: 2px solid #1a0a2a; box-shadow: 0 0 8px rgba(0, 255, 255, 0.6), inset 0 0 4px rgba(255, 255, 255, 0.2); animation: glow-scrollbar 2s ease-in-out infinite alternate; }
        .scrollbar-themed::-webkit-scrollbar-thumb:hover { background: linear-gradient(to bottom, #33ffff, #ff8aff); box-shadow: 0 0 12px rgba(0, 255, 255, 0.8), inset 0 0 4px rgba(255, 255, 255, 0.3); }
        @keyframes glow-scrollbar { 0% { box-shadow: 0 0 8px rgba(0, 255, 255, 0.6), inset 0 0 4px rgba(255, 255, 255, 0.2); } 100% { box-shadow: 0 0 12px rgba(0, 255, 255, 0.6), inset 0 0 4px rgba(255, 255, 255, 0.4); } }
        .scrollbar-themed { scrollbar-width: thin; scrollbar-color: #00ffff #1a0a2a; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        @media (max-width: 768px) { .pixel-border-large { padding: 1rem; } .pixel-button-large { padding: 1rem 1.5rem; font-size: 0.9rem; } .retro-button { padding: 10px; font-size: 0.9rem; } .pixel-button { min-width: 52px; min-height: 52px; } .book-modal { max-w-full max-h-[95vh]; } }
      `}</style>
    </div>
  );
}
