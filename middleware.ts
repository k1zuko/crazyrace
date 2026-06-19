import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const REFRESH_THRESHOLD = 5 * 60
const LOCK_COOKIE = '__sb_refresh_lock'

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url)

  let response = NextResponse.next({
    request, // ✅ forward request headers
  })

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/auth/")


  // ✅ Cek lock SEBELUM buat supabase client
  const lock = request.cookies.get(LOCK_COOKIE)?.value
  if (lock) {
    // ✅ Cek protected meski ada lock
    if (!isPublic) {
      const session = lock // kalau ada lock berarti session ada, lanjut
    }
    return response
  }

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

  const { data: { session } } = await supabase.auth.getSession()

  // ✅ Guard dulu sebelum apapun
  if (!isPublic && !session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (!session) return response

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = session.expires_at ?? 0
  const shouldRefresh = expiresAt - now < REFRESH_THRESHOLD

  if (!shouldRefresh) return response

  // ✅ Set lock SEBELUM refresh
  const host = request.headers.get('host') ?? ''
  const isProd = host.endsWith('gameforsmart.com')

  response.cookies.set(LOCK_COOKIE, '1', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: isProd ? '.gameforsmart.com' : undefined,
    path: '/',
    maxAge: 10,
  })

  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) throw error

    // ✅ Hapus lock setelah berhasil
    response.cookies.delete(LOCK_COOKIE)
  } catch (err) {
    console.error('[Middleware] Refresh error:', err)
    // lock expire sendiri dalam 10 detik
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}