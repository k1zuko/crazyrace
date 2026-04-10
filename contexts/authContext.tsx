"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { getSessionFromCookie, supabase, syncSessionCookie } from "@/lib/supabase"

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
  const [isProfileFetching, setIsProfileFetching] = useState(false) // Track fetch state

  useEffect(() => {
    const getUser = async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          const cookieSession = getSessionFromCookie()
          if (cookieSession) {
            console.log('[SSO] Mencoba pulihkan sesi dari shared cookie (setSession)...')
            // PENTING: Pakai setSession(), BUKAN refreshSession()!
            // setSession() tidak merotasi token → semua app tetap sinkron
            const { data, error } = await supabase.auth.setSession(cookieSession)
            if (!error && data.session) {
              session = data.session
              console.log('[SSO] Sesi berhasil dipulihkan!')
            } else {
              // Token sudah expired/invalid, hapus cookie
              console.warn('[SSO] Token expired, menghapus cookie')
              syncSessionCookie(null)
            }
          }
        }

        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser && session) {
          // Sync tokens ke shared cookie
          syncSessionCookie({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          })
          await loadProfile(currentUser, setProfile, setIsProfileFetching, setLoading)
        } else {
          setProfile(null)
          setLoading(false)
        }
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

        if (event === 'SIGNED_IN' && currentUser && session) {
          syncSessionCookie({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          })
          loadProfile(currentUser, setProfile, setIsProfileFetching).catch(console.error)
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Update cookie saat token di-refresh (token baru untuk semua app)
          syncSessionCookie({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          })
        } else if (!currentUser) {
          // Hapus shared cookie saat logout → semua app ikut logout
          syncSessionCookie(null)
          setProfile(null)
          setIsProfileFetching(false)
        }
      }
    )

    const syncFromCookie = async () => {
            const cookieSession = getSessionFromCookie()

            // Logout sync: cookie kosong tapi kita masih login
            if (!cookieSession) {
                const { data: { session: localSession } } = await supabase.auth.getSession()
                if (localSession) {
                    console.log('[SSO] Logout terdeteksi di app lain, sinkronisasi...')
                    await supabase.auth.signOut()
                    window.location.reload()
                }
                return
            }

            // Token sync: cookie ada dan berbeda dari lokal kita
            const { data: { session: localSession } } = await supabase.auth.getSession()
            if (!localSession) {
                // Kita belum login tapi cookie ada → login sync
                console.log('[SSO] Login terdeteksi di app lain, sinkronisasi...')
                await supabase.auth.setSession(cookieSession)
                window.location.reload()
            } else if (localSession.access_token !== cookieSession.access_token) {
                // Token berbeda → update tanpa reload
                console.log('[SSO] Token baru terdeteksi, mengupdate session lokal...')
                await supabase.auth.setSession(cookieSession)
            }
        }

        // Event-based: langsung sinkron saat user kembali ke tab
        window.addEventListener('focus', syncFromCookie)
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') syncFromCookie()
        }
        window.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            listener.subscription.unsubscribe()
            window.removeEventListener('focus', syncFromCookie)
            window.removeEventListener('visibilitychange', onVisibilityChange)
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