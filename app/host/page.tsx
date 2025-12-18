"use client"

import { Button } from "@/components/ui/button"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ArrowLeft, HelpCircle, Heart, User } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { mysupa, supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import LoadingRetro from "@/components/loadingRetro"
import Image from "next/image"
import { useAuth } from "@/contexts/authContext"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranslation } from "react-i18next"
import { t } from "i18next"
import { generateXID } from "@/lib/id-generator"

// List of background GIFs in filename order
const backgroundGifs = [
  "/assets/background/2_v2.webp",
]

// UPDATE: generateRoomCode - rename ke generateGamePin (sama logic)
export function generateGamePin(length = 6) {
  const digits = "0123456789";
  return Array.from({ length }, () => digits[Math.floor(Math.random() * digits.length)]).join("");
}


export default function QuestionListPage() {
  const router = useRouter()
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [currentPage, setCurrentPage] = useState(1)
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0) // NEW: Total count from server
  const [loading, setLoading] = useState(true) // Initial load only
  const [isFetching, setIsFetching] = useState(false) // Subtle loading for filter/page changes
  const [currentBgIndex, setCurrentBgIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingQuizId, setCreatingQuizId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [profile, setProfile] = useState<any>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesMode, setFavoritesMode] = useState(false);
  const [myQuizzesMode, setMyQuizzesMode] = useState(false);
  const [categories, setCategories] = useState<string[]>(["All"]); // NEW: Categories from server

  const itemsPerPage = 9;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Fetch profile (unchanged)
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, favorite_quiz')
        .eq('auth_user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(profileData);
        if (profileData?.favorite_quiz) {
          try {
            let parsed;
            if (typeof profileData.favorite_quiz === 'string') {
              parsed = JSON.parse(profileData.favorite_quiz);
            } else {
              parsed = profileData.favorite_quiz;
            }
            setFavorites(parsed.favorites || []);
          } catch (e) {
            console.error('Error parsing favorites:', e);
            setFavorites([]);
          }
        } else {
          setFavorites([]);
        }
      }
    };

    if (user) {
      fetchProfile();
    } else {
      setFavorites([]);
      setProfile(null);
    }
  }, [user]);

  // Fetch categories once
  useEffect(() => {
    const fetchCategories = async () => {
      if (!profile?.id) return;
      const { data, error } = await supabase
        .from('quizzes')
        .select('category')
        .or(`is_public.eq.true,creator_id.eq.${profile.id}`);

      if (!error && data) {
        const uniqueCats = ["All", ...new Set(data.map(q => q.category).filter(Boolean))];
        setCategories(uniqueCats);
      }
    };
    fetchCategories();
  }, [profile?.id]);

  // NEW: Fetch quizzes with server-side pagination
  useEffect(() => {
    const fetchQuizzes = async () => {
      if (!profile?.id) return;

      setIsFetching(true); // Subtle loading indicator

      try {
        const offset = (currentPage - 1) * itemsPerPage;

        const { data, error } = await supabase
          .rpc('get_quizzes_paginated', {
            p_user_id: profile.id,
            p_search_query: searchQuery || null,
            p_category_filter: selectedCategory === "All" ? null : selectedCategory,
            p_favorites_filter: favoritesMode ? favorites : null,
            p_creator_filter: myQuizzesMode ? profile.id : null,
            p_limit: itemsPerPage,
            p_offset: offset
          });

        if (error) {
          console.error("Error fetching quizzes:", error);
        } else {
          setQuizzes(data || []);
          // Extract total_count from first row
          if (data && data.length > 0) {
            setTotalCount(Number(data[0].total_count) || 0);
          } else {
            setTotalCount(0);
          }
        }
      } catch (error) {
        console.error("Unexpected error:", error);
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    };

    fetchQuizzes();
  }, [profile?.id, currentPage, searchQuery, selectedCategory, favoritesMode, myQuizzesMode, favorites]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, favoritesMode, myQuizzesMode]);

  const toggleMyQuizzes = () => {
    setMyQuizzesMode(!myQuizzesMode);
    setSelectedCategory("All");
    setFavoritesMode(false)
  };

  const toggleFavorites = () => {
    setFavoritesMode(!favoritesMode);
    setMyQuizzesMode(false)
    setSelectedCategory("All");
  };

  // Generate pagination numbers with ellipsis
  const getPaginationItems = () => {
    const items: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) items.push(i);
    } else {
      // Always show first page
      items.push(1);

      if (currentPage <= 3) {
        // Near start: 1 2 3 4 ... last
        for (let i = 2; i <= 4; i++) items.push(i);
        items.push('...');
        items.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near end: 1 ... last-3 last-2 last-1 last
        items.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) items.push(i);
      } else {
        // Middle: 1 ... curr-1 curr curr+1 ... last
        items.push('...');
        items.push(currentPage - 1);
        items.push(currentPage);
        items.push(currentPage + 1);
        items.push('...');
        items.push(totalPages);
      }
    }

    return items;
  };

  // ✅ OPTIMIZED: handleSelectQuiz - parallel insert + optimistic navigation
  async function handleSelectQuiz(quizId: string, router: any) {
    if (creating) return;
    setCreating(true);
    setCreatingQuizId(quizId); // ✅ Track which quiz is being created

    const gamePin = generateGamePin();
    const sessId = generateXID();
    const hostId = profile?.id || user?.id;

    const primarySession = {
      id: sessId,
      quiz_id: quizId,
      host_id: hostId,
      game_pin: gamePin,
      total_time_minutes: 5,
      question_limit: 5,
      difficulty: "easy",
      current_questions: [],
      status: "waiting",
    }

    const newMainSession = {
      ...primarySession,
      game_end_mode: "manual",
      allow_join_after_start: false,
      participants: [],
      responses: [],
      application: "crazyrace"
    };

    try {
      const [mainResult, gameResult] = await Promise.allSettled([
        supabase
          .from("game_sessions")
          .insert(newMainSession),
        mysupa
          .from("sessions")
          .insert(primarySession)
      ]);

      const mainError = mainResult.status === 'rejected' ? mainResult.reason : mainResult.value.error;
      const gameError = gameResult.status === 'rejected' ? gameResult.reason : gameResult.value.error;

      if (mainError) {
        console.error("Error creating session (main):", mainError);
        // Rollback mysupa jika berhasil
        if (!gameError) {
          await mysupa.from("sessions").delete().eq("id", sessId);
        }
        setCreating(false);
        setCreatingQuizId(null);
        return;
      }

      if (gameError) {
        console.error("Error creating session (mysupa):", gameError);
        // Rollback supabase utama
        await supabase.from("game_sessions").delete().eq("id", sessId);
        setCreating(false);
        setCreatingQuizId(null);
        return;
      }

      // ✅ OPTIMIZATION 2: Simpan ke localStorage dulu (instant)
      localStorage.setItem("hostGamePin", gamePin);
      sessionStorage.setItem("currentHostId", hostId);

      // ✅ OPTIMIZATION 3: Navigate immediately (optimistic navigation)
      router.replace(`/host/${gamePin}/settings`);

      // setCreating akan di-reset saat component unmount
    } catch (err) {
      console.error("Unexpected error:", err);
      setCreating(false);
      setCreatingQuizId(null);
    }
  }


  // Background image cycling with smooth transition
  useEffect(() => {
    const bgInterval = setInterval(() => {
      setIsTransitioning(true)

      // Start fade out
      setTimeout(() => {
        setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length)

        // Complete fade in
        setTimeout(() => {
          setIsTransitioning(false)
        }, 500)
      }, 500)

    }, 5000) // Total cycle: 5 seconds

    return () => clearInterval(bgInterval)
  }, [])

  // Handle quiz selection
  const handleQuizSelect = async (quizId: string) => {
    await handleSelectQuiz(quizId, router);   // panggil yang bikin room + redirect
  };

  // Only show full loading on initial load or creating
  if ((loading && quizzes.length === 0) || creating) return <LoadingRetro />

  return (
    <div className="h-screen bg-[#1a0a2a] relative overflow-hidden"> {/* Fixed height */}

      {/* Background Image with Smooth Transition */}
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

      {(loading || creating) && (
        <LoadingRetro />
      )}

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
              aria-label="Back to Home"
              onClick={() => router.push('/')}
            >
              <ArrowLeft size={20} className="text-white" />
            </motion.button>

            <div className="hidden md:block">
              <Image src="/crazyrace-logo.png" alt="Crazy Race" width={270} height={50} style={{ imageRendering: 'auto' }} className="h-auto drop-shadow-xl" />
            </div>
          </div>

          {/* Right side: Gameforsmart logo */}
          <div className="hidden md:block">
            <Image
              src="/gameforsmartlogo.webp"
              alt="Gameforsmart Logo"
              width={256}
              height={64}
            />
          </div>
        </div>

        <div className="relative container mx-auto px-6 py-8 pt-0 max-w-6xl">
          {/* Title */}
          <div className="text-center sm:m-7">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="pixel-border-large inline-block p-6"
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#ffefff] pixel-text glow-pink">
                {t('soal.title')}
              </h1>
            </motion.div>
          </div>

          {/* Search & Filter Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-[#1a0a2a]/60 border-4 border-[#ff6bff]/50 rounded-xl p-4 sm:p-6 mb-8 pixel-card glow-pink-subtle"
          >
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1">
                <Input
                  placeholder="Search Quiz..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSearchQuery(searchInput);
                  }}
                  className="w-full pr-12 py-3 sm:py-4 bg-[#0a0a0f] border-4 border-[#6a4c93] text-white placeholder:text-gray-400 focus:border-[#00ffff] focus:ring-0 text-base sm:text-lg pixel-text glow-cyan-subtle"
                />

                {/* Tombol Search diperbesar area kliknya */}
                <button
                  type="button"
                  onClick={() => setSearchQuery(searchInput)}
                  className="absolute right-0 inset-y-0 flex items-center justify-center px-2 sm:px-3 text-[#00ffff] hover:text-[#33ffff] transition-all cursor-pointer rounded-r-sm"
                  aria-label="Cari Quiz"
                >
                  <Search className="h-5 w-5" />
                </button>
              </div>

              {/* Category Select */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-40 lg:w-63 bg-[#0a0a0f] border-4 border-[#6a4c93] text-white focus:border-[#00ffff] cursor-pointer focus:ring-0 text-sm sm:text-lg pixel-text glow-cyan-subtle py-3 px-3 sm:px-4 h-auto capitalize">
                  <SelectValue placeholder="All Categories" className="capitalize" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a0a2a] border-4 border-[#ff6bff]/50 text-white capitalize">
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="pixel-text capitalize cursor-pointer">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Favorites & My Quizzes Buttons (stack on mobile, row on sm+) */}
              <div className="flex flex-row gap-2 sm:gap-2">
                {/* Favorites Heart Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleFavorites}
                      className={`flex items-center justify-center w-full sm:w-10 h-10 rounded-full border-2 transition-all duration-300 cursor-pointer ${favoritesMode
                        ? 'bg-[#ff6bff] border-[#ff6bff] text-white hover:bg-[#ff6bff]/90'
                        : 'bg-transparent border-[#ff6bff] text-[#ff6bff] hover:bg-[#ff6bff]/10'
                        }`}
                      aria-label={favoritesMode ? "Show all quizzes" : "Show favorites"}
                    >
                      <Heart className={`h-5 w-5 ${favoritesMode ? 'fill-current' : ''}`} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#1a0a2a] text-white border-[#ff6bff]/50">
                    Favorites
                  </TooltipContent>
                </Tooltip>

                {/* My Quizzes Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleMyQuizzes}
                      className={`flex items-center justify-center w-full sm:w-10 h-10 rounded-full border-2 transition-all duration-300 cursor-pointer ${myQuizzesMode
                        ? 'bg-[#00ffff] border-[#00ffff] text-black hover:bg-[#33ffff]'
                        : 'bg-transparent border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff]/10'
                        }`}
                      aria-label={myQuizzesMode ? "Show all quizzes" : "Show my quizzes"}
                    >
                      <User className={`h-5 w-5 ${myQuizzesMode ? 'fill-filled' : ''}`} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#1a0a2a] text-white border-[#00ffff]/50">
                    My Quizzes
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </motion.div>

          {/* Questions Grid with Pagination in AnimatePresence */}
          <AnimatePresence mode="wait">
            {quizzes.length > 0 ? (
              <motion.div
                key={`filter-${selectedCategory}-${favoritesMode}-${myQuizzesMode}-${searchQuery}-${currentPage}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                {/* Subtle loading indicator */}
                {isFetching && (
                  <div className="flex justify-center mb-4">
                    <div className="w-6 h-6 border-3 border-[#00ffff] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${isFetching ? 'opacity-50' : 'opacity-100'}`}>
                  {quizzes.map((quiz: any, index: number) => {
                    const isThisQuizCreating = creatingQuizId === quiz.id;

                    return (
                      <motion.div
                        key={quiz.id}
                        whileHover={!isThisQuizCreating ? { scale: 1.03 } : {}}
                        whileTap={!isThisQuizCreating ? { scale: 0.98 } : {}}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                      >
                        <Card
                          className={`relative bg-[#1a0a2a]/60 border-4 pixel-card h-full justify-end gap-3 transition-all duration-200
                        ${isThisQuizCreating
                              ? "opacity-70 cursor-wait border-[#00ffff]/70 glow-cyan"
                              : creating
                                ? "opacity-50 cursor-not-allowed border-[#888]/40"
                                : "border-[#ff6bff]/50 hover:border-[#ff6bff] glow-pink-subtle cursor-pointer"
                            }`}

                          onClick={() => {
                            if (!creating) handleQuizSelect(quiz.id);
                          }}
                        >
                          {isThisQuizCreating && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#1a0a2a]/80 rounded-lg z-10">
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-4 border-[#00ffff] border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-xs text-[#00ffff] pixel-text">Creating...</p>
                              </div>
                            </div>
                          )}

                          <TooltipProvider>
                            <Tooltip delayDuration={500}>
                              <TooltipTrigger asChild>
                                <div>
                                  <CardHeader>
                                    <CardTitle className="text-base text-[#00ffff] pixel-text glow-cyan md:line-clamp-3 ">
                                      {quiz.title}
                                    </CardTitle>
                                  </CardHeader>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="text-xs bg-black/80 text-cyan-300 max-w-xs border border-cyan-500/50 whitespace-normal break-words"
                              >
                                {quiz.title}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <CardFooter className="flex justify-between items-center">
                            {quiz.category && (
                              <div className="text-xs text-[#ff6bff] pixel-text glow-pink-subtle capitalize">{quiz.category}</div>
                            )}
                            <div className="flex items-center gap-2 text-[#ff6bff] text-sm pixel-text glow-pink-subtle">
                              <HelpCircle className="h-4 w-4" /> {quiz.question_count ?? 0}
                            </div>
                          </CardFooter>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Flexible Pagination with Ellipsis */}
                {totalPages > 1 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="flex justify-center items-center gap-2 mt-8 flex-wrap"
                  >
                    <Button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || loading}
                      className="pixel-button bg-[#ff6bff] border-4 border-white hover:bg-[#ff8aff] glow-pink disabled:opacity-50 disabled:cursor-not-allowed"
                      variant="outline"
                    >
                      {t('soal.previous')}
                    </Button>

                    {getPaginationItems().map((item, idx) => (
                      typeof item === 'number' ? (
                        <Button
                          key={`page-${item}`}
                          onClick={() => setCurrentPage(item)}
                          disabled={loading}
                          variant={item === currentPage ? "default" : "outline"}
                          className={`pixel-button ${item === currentPage
                            ? 'bg-[#00ffff] border-4 border-white hover:bg-[#33ffff] glow-cyan'
                            : 'bg-[#ff6bff] border-4 border-white hover:bg-[#ff8aff] glow-pink'
                            }`}
                        >
                          {item}
                        </Button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="text-white pixel-text px-2">...</span>
                      )
                    ))}

                    <Button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || loading}
                      className="pixel-button bg-[#ff6bff] border-4 border-white hover:bg-[#ff8aff] glow-pink disabled:opacity-50 disabled:cursor-not-allowed"
                      variant="outline"
                    >
                      {t('soal.next')}
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty" // Key for empty state animation
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="col-span-full text-center py-12"
              >
                <Search className="h-12 w-12 mx-auto mb-4 text-[#ff6bff] opacity-50" />
                <p className="text-[#ff6bff] pixel-text glow-pink-subtle">No quizzes found</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <style jsx>{`
        .pixel-text {
          image-rendering: pixelated;
          text-shadow: 2px 2px 0px #000;
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
        .pixel-border-large {
          border: 4px solid #00ffff;
          background: linear-gradient(45deg, #1a0a2a, #2d1b69);
          box-shadow: 0 0 20px rgba(255, 107, 255, 0.3);
        }
        .pixel-border-large::before {
          content: '';
          position: absolute;
          top: -8px;
          left: -8px;
          right: -8px;
          bottom: -8px;
          border: 2px solid #ff6bff;
          z-index: -1;
        }
        .pixel-card {
          box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 107, 255, 0.2);
          transition: all 0.2s ease;
        }
        .pixel-card:hover {
          box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.9), 0 0 25px rgba(255, 107, 255, 0.4);
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
        .glow-pink {
          animation: glow-pink 1.5s ease-in-out infinite;
        }
        .glow-pink-subtle {
          animation: glow-pink 2s ease-in-out infinite;
          filter: drop-shadow(0 0 3px rgba(255, 107, 255, 0.5));
        }
        .glow-cyan {
          animation: glow-cyan 1.5s ease-in-out infinite;
        }
        .glow-cyan-subtle {
          animation: glow-cyan 2s ease-in-out infinite;
          filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.5));
        }
        @keyframes scanline {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
        @keyframes glow-cyan {
          0%, 100% { filter: drop-shadow(0 0 5px #00ffff); }
          50% { filter: drop-shadow(0 0 15px #00ffff); }
        }
        @keyframes glow-pink {
          0%, 100% { filter: drop-shadow(0 0 5px #ff6bff); }
          50% { filter: drop-shadow(0 0 15px #ff6bff); }
        }
        /* Responsive */
        @media (max-width: 768px) {
          .pixel-border-large {
            padding: 1rem;
          }
          .pixel-button {
            padding: 0.5rem;
          }
        }
      `}</style>

      </div>
    </div>
  )
}