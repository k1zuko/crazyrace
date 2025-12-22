"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

interface Profile {
  id: string
  username: string
  email: string
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
        .select('*')
        .eq('auth_user_id', currentUser.id)
        .single()

      if (selectError && selectError.code !== 'PGRST116') {
        // PGRST116 = not found, yang normal. Error lain = retry
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
        fullname: '',
        avatar_url: '',
        auth_user_id: currentUser.id
      })
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
            currentUser,
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
            currentUser,
            (profile) => {
              setProfile(profile)
              setIsProfileFetching(false)
            },
            (fallbackProfile) => {
              setProfile(fallbackProfile)
              setIsProfileFetching(false)
            }
          ).catch(console.error) // Catch any unhandled errors
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