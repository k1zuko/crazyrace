import { createGFSServer } from "@/lib/supabase/gfs-server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const next = searchParams.get("next") ?? "/"

    if (code) {
        const supabase = await createGFSServer()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        // ✅ Cookie di-set dari server → HttpOnly otomatis
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
}