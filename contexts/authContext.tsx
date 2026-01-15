"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getUserProfile } from "@/app/actions/profile"

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

const AuthContext = createContext<AuthContextType | null>(null)

// Retry helper dengan exponential backoff
async function ensureProfileWithRetry(
  onSuccess: (profile: Profile) => void,
  onFallback: (profile: Profile) => void,
  maxRetries = 3
) {
  let retryCount = 0
  const baseDelay = 1000

  const attempt = async (): Promise<void> => {
    try {
      // Panggil Server Action
      const result = await getUserProfile()

      if ((result.status === 200 || result.status === 201) && result.profile) {
        onSuccess(result.profile)
        return
      }

      if (result.error && result.status !== 401) {
        throw new Error(result.error)
      }

      // Fallback if user exists but profile missing/failed
      if (result.user) {
        onFallback({
          id: 'fallback-' + result.user.id,
          username: result.user.email?.split('@')[0] || 'user',
          email: result.user.email || '',
          nickname: '',
          fullname: '',
          avatar_url: '',
          auth_user_id: result.user.id
        })
        return
      }

    } catch (error: any) {
      retryCount++

      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount - 1)
        console.warn(
          `⚠️ Profile fetch attempt ${retryCount} failed, retrying in ${delay}ms...`,
          error.message
        )
        await new Promise(resolve => setTimeout(resolve, delay))
        return attempt()
      }

      console.error('❌ Profile fetch failed after retries:', error)
    }
  }

  return attempt()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProfileFetching, setIsProfileFetching] = useState(false) // Track fetch state

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser) {
          setIsProfileFetching(true)
          await ensureProfileWithRetry(
            (profile) => {
              setProfile(profile)
              setIsProfileFetching(false)
            },
            (fallbackProfile) => {
              setProfile(fallbackProfile)
              setIsProfileFetching(false)
            }
          )
        } else {
          setProfile(null)
          setIsProfileFetching(false)
        }
        setLoading(false)
      } catch (error) {
        console.error('Session error:', error)
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    }
    getUser()

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (event === 'SIGNED_IN' && currentUser) {
          // Fire-and-forget retry logic di background
          setIsProfileFetching(true)
          ensureProfileWithRetry(
            (profile) => {
              setProfile(profile)
              setIsProfileFetching(false)
            },
            (fallbackProfile) => {
              setProfile(fallbackProfile)
              setIsProfileFetching(false)
            }
          ).catch(console.error)
        } else if (!currentUser) {
          setProfile(null)
          setIsProfileFetching(false)
        }
      }
    )

    return () => listener.subscription.unsubscribe()
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