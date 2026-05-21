import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const REFRESH_THRESHOLD = 5 * 60 // 5 menit sebelum token expired
const LOCK_COOKIE = '__sb_refresh_lock'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next()

  // Supabase server client – tanpa auto-refresh
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Hanya membaca session (NO request ke Supabase)
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    const expiresAt = session.expires_at // epoch detik
    const now = Math.floor(Date.now() / 1000)
    const shouldRefresh = expiresAt && (expiresAt - now < REFRESH_THRESHOLD)

    if (shouldRefresh) {
      const lock = request.cookies.get(LOCK_COOKIE)?.value

      if (!lock) {
        // Pasang lock cookie lintas subdomain, httpOnly, 10 detik
        response.cookies.set(LOCK_COOKIE, '1', {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          domain: '.gameforsmart.com',
          path: '/',
          maxAge: 10,
        })

        try {
          // Hanya satu kali request ke /token
          await supabase.auth.refreshSession()
          // Refresh berhasil → hapus lock lebih awal
          response.cookies.delete({ name: LOCK_COOKIE, domain: '.gameforsmart.com', path: '/' })
        } catch (err) {
          console.error('Middleware refresh error:', err)
          // Biarkan lock expire sendiri
        }
      }
      // else: ada proses refresh lain, tunggu saja
    }
  }

  return response
}

export const config = {
  matcher: [
    // Hindari static files & assets
    '/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}