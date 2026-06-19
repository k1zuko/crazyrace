"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { createGFSClient } from "@/lib/supabase/gfs-client"

interface Profile {
    id: string
    username: string
    email: string
    nickname?: string
    fullname?: string
    avatar_url?: string
    auth_user_id: string
    role?: string
}

interface AuthContextType {
    user: any | null
    profile: Profile | null
    loading: boolean
}

const supabase = createGFSClient()
const AuthContext = createContext<AuthContextType | null>(null)

async function ensureProfileWithRetry(
    currentUser: any,
    onSuccess: (profile: Profile) => void,
    onFallback: (profile: Profile) => void,
    maxRetries = 3
) {
    let retryCount = 0
    const baseDelay = 500

    const attempt = async (): Promise<void> => {
        try {
            const { data: existing, error: selectError } = await supabase
                .from("profiles")
                .select("id, username, email, nickname, fullname, avatar_url, auth_user_id, favorite_quiz, role")
                .eq("auth_user_id", currentUser.id)
                .single()

            if (selectError && selectError.code !== "PGRST116") throw selectError

            if (existing) {
                onSuccess(existing)
                return
            }

            const profileData = {
                auth_user_id: currentUser.id,
                username: currentUser.user_metadata?.username || currentUser.email?.split("@")[0] || "user",
                email: currentUser.email || "",
                fullname: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || "",
                avatar_url: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || "",
                updated_at: new Date().toISOString(),
            }

            const { data, error: insertError } = await supabase
                .from("profiles")
                .insert(profileData)
                .select()
                .single()

            if (insertError) throw insertError

            onSuccess(data)
        } catch (error: any) {
            retryCount++
            if (retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount - 1)
                console.warn(`[Auth] Retry ${retryCount} in ${delay}ms...`, error.message)
                await new Promise((resolve) => setTimeout(resolve, delay))
                return attempt()
            }
            console.error("[Auth] Profile fetch failed, using fallback:", error)
            onFallback({
                id: "fallback-" + currentUser.id,
                username: currentUser.email?.split("@")[0] || "user",
                email: currentUser.email || "",
                nickname: "",
                fullname: "",
                avatar_url: "",
                auth_user_id: currentUser.id,
            })
        }
    }

    return attempt()
}

async function loadProfile(
    currentUser: any,
    setProfile: (p: Profile | null) => void,
    setIsProfileFetching: (v: boolean) => void,
    setLoading?: (v: boolean) => void
) {
    setIsProfileFetching(true)
    await ensureProfileWithRetry(
        currentUser,
        (profile) => {
            setProfile(profile)
            setIsProfileFetching(false)
            if (setLoading) setLoading(false)
        },
        (fallbackProfile) => {
            setProfile(fallbackProfile)
            setIsProfileFetching(false)
            if (setLoading) setLoading(false)
        }
    )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const lastSyncRef = useRef<number>(0)

    useEffect(() => {
        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const currentUser = session?.user ?? null

                // ✅ INITIAL_SESSION — handle pertama kali mount, hapus init()
                if (event === "INITIAL_SESSION") {
                    setUser(currentUser)
                    if (currentUser) {
                        await loadProfile(currentUser, setProfile, () => { }, setLoading)
                    } else {
                        setLoading(false)
                    }
                    return
                }

                if (event === "SIGNED_IN" && currentUser) {
                    setUser(currentUser)
                    loadProfile(currentUser, setProfile, () => { setLoading(false) })
                    return
                }

                if (event === "SIGNED_OUT") {
                    setUser(null)
                    setProfile(null)
                    setLoading(false)
                    return
                }

                if (event === "USER_UPDATED" && currentUser) {
                    setUser(currentUser)
                    loadProfile(currentUser, setProfile, () => { })
                    return
                }

                // ✅ TOKEN_REFRESHED — sync token dari middleware ke client memory
                // Karena autoRefreshToken: false, middleware yang refresh
                // event ini fire kalau cookie berubah dan client detect
                if (event === "TOKEN_REFRESHED" && currentUser) {
                    setUser(currentUser)
                    return
                }
            }
        )

        // ✅ Visibility sync — deteksi logout di tab lain
        // Karena autoRefreshToken: false, ini juga jadi satu-satunya
        // cara client tau kalau session sudah berubah
        const handleVisibilityChange = async () => {
            if (document.visibilityState !== "visible") return

            const now = Date.now()
            if (now - lastSyncRef.current < 10_000) return // throttle 10 detik
            lastSyncRef.current = now

            try {
                // ✅ getSession() — tidak hit network, baca cookie lokal
                // Cukup untuk deteksi logout, tidak perlu getUser() di sini
                const { data: { session } } = await supabase.auth.getSession()
                const currentUser = session?.user ?? null

                setUser((prev: any) => {
                    if (currentUser?.id !== prev?.id) {
                        if (currentUser) {
                            loadProfile(currentUser, setProfile, () => { })
                        } else {
                            setProfile(null)
                        }
                        return currentUser
                    }
                    return prev
                })
            } catch (err) {
                console.error("[Auth] Visibility sync error:", err)
            }
        }

        window.addEventListener("visibilitychange", handleVisibilityChange)

        return () => {
            listener.subscription.unsubscribe()
            window.removeEventListener("visibilitychange", handleVisibilityChange)
        }
    }, [])

    return (
        <AuthContext.Provider value={{ user, profile, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === null) {
        throw new Error("useAuth must be used within an AuthProvider")
    }
    return context
}