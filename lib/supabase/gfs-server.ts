import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export async function createGFSServer() {
    const cookieStore = await cookies();
    const host = (await headers()).get("host") || "";

    // Environment Checks
    const isProdDomain = host.endsWith("gameforsmart.com");
    const isVercel = host.endsWith(".vercel.app");
    
    // Cookie secure only on HTTPS domains
    const isSecureContext = isProdDomain || isVercel;

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        const cookieOptions = {
                            ...options,
                            secure: isSecureContext,
                            sameSite: "lax" as const,
                            httpOnly: isSecureContext,
                        };

                        cookieStore.set(name, value, cookieOptions);
                    });
                },
            },
        }
    );
}