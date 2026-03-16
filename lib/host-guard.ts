// lib/host-guard.ts
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { mysupa } from "@/lib/supabase";

export function useHostGuard(roomCode: string) {
  const router = useRouter();

  useEffect(() => {
    // 1. Pastikan jalan di browser
    if (typeof window === "undefined") return;

    const hostId = sessionStorage.getItem("currentHostId");

    if (!hostId) {
      // Tidak ada host ID, redirect ke home
      router.replace("/");
      return;
    }

    (async () => {
      try {
        const { data: session, error } = await mysupa
          .from("sessions")
          .select("host_id")
          .eq("game_pin", roomCode)
          .single();

        if (error || !session) {
          console.error("Session not found:", error);
          router.replace("/");
          return;
        }

        // Verifikasi host ID cocok
        if (session.host_id !== hostId) {
          console.error("Host ID mismatch");
          router.replace("/");
          return;
        }
      } catch (err) {
        console.error("Host guard error:", err);
        router.replace("/");
      }
    })();
  }, [roomCode, router]);
}
