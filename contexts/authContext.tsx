"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createGFSClient } from "@/lib/supabase/gfs-client";

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

const supabase = createGFSClient();
const AuthContext = createContext<AuthContextType | null>(null)

// Retry helper dengan exponential backoff
async function ensureProfileWithRetry(
    currentUser: any,
    onSuccess: (profile: Profile) => void,
    onFallback: (profile: Profile) => void,
    maxRetries = 3
) {
    let retryCount = 0
    const baseDelay = 500 // 500ms

    const attempt = async (): Promise<void> => {
        try {
            // First, check if exists (quick select)
            const { data: existing, error: selectError } = await supabase
                .from('profiles')
                .select('id, username, email, nickname, fullname, avatar_url, auth_user_id, favorite_quiz, role')
                .eq('auth_user_id', currentUser.id)
                .single()

            if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = No rows found, itu normal jika belum ada profile
                throw selectError
            }

            if (existing) {
                onSuccess(existing)
                return // Done
            }

            // Create new if not exists
            const profileData = {
                auth_user_id: currentUser.id,
                username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'user',
                email: currentUser.email || '',
                fullname: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '',
                avatar_url: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || '',
                updated_at: new Date().toISOString()
            }

            const { data, error: insertError } = await supabase
                .from('profiles')
                .insert(profileData)
                .select()
                .single()

            if (insertError) throw insertError

            onSuccess(data)
        } catch (error: any) {
            retryCount++

            // Jika masih ada retry tersisa, tunggu dan coba lagi
            if (retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount - 1) // 500ms, 1s, 2s
                console.warn(
                    `⚠️ Profile fetch attempt ${retryCount} failed, retrying in ${delay}ms...`,
                    error.message
                )
                await new Promise(resolve => setTimeout(resolve, delay))
                return attempt() // Recursive retry
            }

            // Semua retry gagal, gunakan fallback
            console.error('❌ Profile fetch failed after retries, using fallback:', error)
            onFallback({
                id: 'fallback-' + currentUser.id,
                username: currentUser.email?.split('@')[0] || 'user',
                email: currentUser.email || '',
                nickname: '',
                fullname: '',
                avatar_url: '',
                auth_user_id: currentUser.id
            })
        }
    }

    return attempt()
}

// Helper: fetch profile lalu set state
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

    useEffect(() => {
        const init = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const currentUser = session?.user ?? null

                setUser(currentUser)

                if (currentUser && session) {
                    // Don't 'await' here to allow loading state to finish quickly
                    loadProfile(currentUser, setProfile, () => { }, setLoading)
                } else {
                    setLoading(false)
                }
            } catch (err) {
                console.error("Auth init error:", err)
                setLoading(false)
            }
        }

        init()

        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const currentUser = session?.user ?? null

                setUser(currentUser)

                if (currentUser) {
                    // Non-blocking load profile
                    loadProfile(currentUser, setProfile, () => {
                        setLoading(false)
                    })
                } else {
                    setProfile(null)
                    setLoading(false)
                }
            }
        )

        return () => {
            listener.subscription.unsubscribe()
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
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
