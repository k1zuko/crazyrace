import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * ============================================================
 * NEXT.JS PROXY — SUPABASE SSR SESSION MANAGEMENT
 * ============================================================
 * Berjalan di setiap request SEBELUM halaman dimuat.
 * Fungsinya:
 *   1. Membaca token auth dari cookies
 *   2. Merefresh token jika sudah expired
 *   3. Menulis token baru ke response cookies
 *
 * Ini memungkinkan Server Components mengakses sesi user
 * yang sudah terotentikasi tanpa perlu localStorage.
 * ============================================================
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh token jika sudah expired
  // IMPORTANT: urutan ini wajib dipertahankan
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    // Match semua paths kecuali static files dan images
    '/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
