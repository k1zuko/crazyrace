"use server"

import { createGFSServer } from "@/lib/supabase/gfs-server";
import { redirect } from "next/navigation";

async function resolveEmail(input: string): Promise<string> {
    if (input.includes("@")) return input.toLowerCase();

    const supabase = await createGFSServer();
    const { data, error } = await supabase
        .from("profiles")
        .select("email")
        .eq("username", input)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Username tidak ditemukan!");

    return data.email.toLowerCase();
};

export async function signInAction(identifier: string, password: string) {
    try {
        const resolvedEmail = await resolveEmail(identifier);

        const supabase = await createGFSServer();
        const { error } = await supabase.auth.signInWithPassword({
            email: resolvedEmail,
            password,
        })

        if (error) throw error;

        redirect("/");
    } catch (err: any) {
        return { error: err.message || "Terjadi kesalahan, coba lagi!" };
    }
}

export async function signOutAction() {
    const supabase = await createGFSServer();
    await supabase.auth.signOut();
    redirect("/login");
}