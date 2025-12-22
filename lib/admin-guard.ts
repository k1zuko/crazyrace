"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useAdminGuard() {
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.user) {
                router.replace("/");
                return;
            }

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("auth_user_id", session.user.id)
                .single();

            if (profile?.role !== "admin") {
                router.replace("/");
                return;
            }

            setIsAdmin(true);
            setLoading(false);
        };

        checkAdmin();
    }, [router]);

    return { isAdmin, loading };
}
