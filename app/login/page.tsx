"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/authContext"
import { FcGoogle } from 'react-icons/fc';
import { FaHandPointRight } from 'react-icons/fa';
import { useTranslation } from "react-i18next"
import Image from "next/image"

// Background GIFs - Sesuai tema retro neon, optimized for mobile (smaller files if possible)
const backgroundGifs = [
  "/assets/background/host/10.webp",
]

export default function LoginPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { t } = useTranslation()
  const [currentBgIndex, setCurrentBgIndex] = useState(0)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [identifier, setIdentifier] = useState("");

  const registerUrl =
    typeof window !== "undefined" &&
      window.location.hostname.includes("gameforsmart.com")
      ? "https://gameforsmart.com/auth/register"
      : "https://gameforsmart2025.vercel.app/auth/register";


  useEffect(() => {
    if ((user || profile) && !loading) { // Cek user ATAU profile (biar tunggu profile ready)
      router.replace('/')
    }
  }, [user, profile, loading, router])

  // Cycling background setiap 5 detik, dengan smoother transition untuk mobile
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const resolveEmail = async (input: string) => {
    // Kalau input mengandung @ → berarti email
    if (input.includes("@")) return input.toLowerCase();

    // Kalau username → cari di tabel profiles
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("username", input)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Username tidak ditemukan!");

    return data.email.toLowerCase();
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim() || !password.trim()) {
      setError("Email/Username dan Password harus diisi!")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const resolvedEmail = await resolveEmail(identifier.trim());

      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      })

      if (error) throw error;

    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan, coba lagi!")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    setIsLoading(true)
    setError("")

    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,  // Sesuaikan callback URL
      },
    }).catch((err: any) => {
      setIsLoading(false)
      setError(err.message || "Gagal login dengan Google!")
    })
  }

  return (
    <div className="min-h-screen bg-[#1a0a2a] relative overflow-hidden">
      {/* Background Cycling - Optimized untuk mobile dengan fixed aspect */}
      <AnimatePresence mode="wait">
        <motion.video
          key="background-video"
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        >
          <source src="/assets/background/host/10.webm" type="video/webm" />
          <source src="/assets/background/host/10.mp4" type="video/mp4" />
        </motion.video>

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
        <div className="hidden md:block">
          <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
        </div>
      </div>

      {/* Logo & Title - Responsive untuk mobile */}
      <div className="relative z-10 flex flex-col justify-center items-center md:min-h-screen px-4 sm:px-6">

        <div className="text-center mx-auto py-10 md:hidden">
          <Image
            src="/crazyrace-logo-utama.png"
            alt="Crazy Race"
            width={200}
            height={70}
            className="h-auto mx-auto"
          />
        </div>

        {/* Login Card - Lebih compact dan touch-friendly pada mobile */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-sm sm:max-w-lg"
        >
          <Card className="bg-[#1a0a2a]/70 backdrop-blur-md border-2 border-[#ff6bff]/60 pixel-card p-4 sm:p-6 md:p-8 shadow-2xl">
            <CardHeader className="space-y-3 sm:space-y-2">
              <CardTitle className="text-xl sm:text-2xl font-bold text-[#00ffff] pixel-text glow-cyan text-center leading-tight">
                {t("login.title")}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/30 border border-red-500/60 text-red-200 p-3 sm:p-4 rounded-lg text-xs sm:text-sm pixel-text text-center shadow-md"
                >
                  {error}
                </motion.div>
              )}

              <div className="relative">
                <motion.div
                  className="absolute -left-7 md:-left-10 top-1/2 -translate-y-1/2 text-2xl md:text-3xl text-[#ff6bff]"
                  animate={{ x: [0, 10, 0] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "easeInOut",
                  }}
                >
                  <FaHandPointRight />
                </motion.div>
                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full min-h-12 sm:min-h-10 border-[#ff6bff]/60 text-[#ff6bff] hover:text-[#ff6bff] hover:bg-[#ff6bff]/20 hover:border-[#ff8aff] pixel-button flex items-center justify-center gap-2 sm:gap-3 px-4 py-5 transition-all duration-200 cursor-pointer"
                >
                  {/* Icon Google — ukuran responsif */}
                  <FcGoogle className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" />

                  {/* Teks kondisional: mobile = "Google", desktop = "Continue with Google" */}
                  <span className="text-center font-medium">
                    <span className="sm:hidden">{t("login.googleMobile")}</span>
                    <span className="hidden sm:inline">{t("login.googleDesktop")}</span>
                  </span>
                </Button>
              </div>

              {/* Divider - Lebih subtle pada mobile */}
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#ff6bff]/40" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-[#1a0a2a]/80 px-3 py-1 text-[#ff6bff]/90 rounded-full">
                    {t("login.or")}
                  </span>
                </div>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4 mt-4">
                <div className="space-y-1">
                  <Input
                    type="text"
                    placeholder={t("login.emailPlaceholder")}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="bg-[#0a0a0f]/70 border-[#ff6bff]/60 text-white placeholder-[#ff6bff]/60 pixel-input focus:border-[#00ffff] focus:ring-[#00ffff]/30 text-xs md:text-sm transition-all duration-200 shadow-inner h-11"
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-1">
                  <Input
                    type="password"
                    placeholder={t("login.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[#0a0a0f]/70 border-[#ff6bff]/60 text-white placeholder-[#ff6bff]/60 pixel-input focus:border-[#00ffff] focus:ring-[#00ffff]/30 text-xs md:text-sm transition-all duration-200 shadow-inner h-11"
                    disabled={isLoading}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || !identifier.trim() || !password.trim()}
                  className="w-full bg-gradient-to-r from-[#00ffff] via-[#00ffff]/80 to-[#ff6bff] hover:from-[#33ffff] hover:to-[#ff8aff] text-black font-bold pixel-button-large glow-cyan text-base sm:text-lg py-3.5 sm:py-4 h-12 sm:h-auto transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg hover:shadow-xl"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                      {t("login.signingIn")}
                    </span>
                  ) : (
                    <>
                      {t("login.signIn")}
                    </>
                  )}
                </Button>
              </form>

              {/* REGISTER LINK — WAJIB ADA! */}
              <div
                className="mt-6 text-center"
              >
                <p className="text-[#ff6bff]/90 text-xs sm:text-sm pixel-text">
                  {t("login.noAccount")}{" "}
                  <a
                    href={registerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00ffff] underline glow-cyan-subtle hover:text-[#33ffff] transition-all duration-200 hover:scale-105 inline-block"
                  >
                    {t("login.registerHere")}
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Bottom Spacer untuk menghindari keyboard overlap pada mobile */}
        <div className="h-16 sm:h-0" />
      </div>

      {/* Custom Styles - Enhanced untuk mobile dengan smoother glow dan shadows */}
      <style jsx>{`
        .pixel-text {
          image-rendering: pixelated;
          text-shadow: 1px 1px 0px #000, 2px 2px 0px #000;
          -webkit-text-stroke: 0.5px rgba(0,0,0,0.5);
        }
        .pixel-input {
          font-size: 0.7rem;
          padding: 0.75rem 1rem;
          border: 2px solid;
          letter-spacing: 0.5px;
        }
        .pixel-button-large {
          box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.7), 0 0 10px rgba(0, 255, 255, 0.3);
          transition: all 0.2s ease;
          border-radius: 4px;
        }
        .pixel-button-large:hover:not(:disabled) {
          transform: translate(1px, 1px);
          box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.7), 0 0 15px rgba(0, 255, 255, 0.5);
        }
        .pixel-card {
          box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 107, 255, 0.2), inset 0 1px 0px rgba(255,255,255,0.1);
          border-radius: 8px;
        }
        .glow-cyan {
          filter: drop-shadow(0 0 8px #00ffff) drop-shadow(0 0 16px #00ffff);
          animation: glow-cyan 2s ease-in-out infinite alternate;
        }
        .glow-cyan-subtle {
          filter: drop-shadow(0 0 4px rgba(0, 255, 255, 0.4));
        }
        .glow-pink {
          filter: drop-shadow(0 0 8px #ff6bff) drop-shadow(0 0 16px #ff6bff);
          animation: glow-pink 2s ease-in-out infinite alternate;
        }
        @keyframes glow-cyan {
          from { filter: drop-shadow(0 0 5px #00ffff) drop-shadow(0 0 10px #00ffff); }
          to { filter: drop-shadow(0 0 12px #00ffff) drop-shadow(0 0 20px #00ffff); }
        }
        @keyframes glow-pink {
          from { filter: drop-shadow(0 0 5px #ff6bff) drop-shadow(0 0 10px #ff6bff); }
          to { filter: drop-shadow(0 0 12px #ff6bff) drop-shadow(0 0 20px #ff6bff); }
        }
        /* Mobile-specific optimizations */
        @media (max-width: 640px) {
          .pixel-text {
            text-shadow: 1px 1px 0px #000;
          }
          .pixel-input {
            font-size: 0.65rem;
            padding: 1rem;
          }
          .glow-cyan, .glow-pink {
            filter: drop-shadow(0 0 6px currentColor);
          }
        }
      `}</style>

    </div>
  )
}