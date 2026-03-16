import { mysupa, supabase } from "@/lib/supabase"

let serverTimeOffset: number | null = null
let lastSyncTime = 0
const SYNC_INTERVAL = 10000

export async function getServerTime(): Promise<number> {
  try {
    const start = Date.now()
    const { data, error } = await mysupa.rpc("get_server_time")
    if (error) throw error
    const end = Date.now()
    const latency = (end - start) / 2
    const serverTime = new Date(data).getTime()
    return serverTime + latency
  } catch (err) {
    console.warn("Fallback ke client time:", err)
    return Date.now()
  }
}

export async function syncServerTime() {
  const now = Date.now()
  if (serverTimeOffset && now - lastSyncTime < SYNC_INTERVAL) return
  const serverNow = await getServerTime()
  serverTimeOffset = serverNow - now
  lastSyncTime = now
  console.log("🕒 Synced server offset:", serverTimeOffset)
}

export function getSyncedServerTime(): number {
  return serverTimeOffset ? Date.now() + serverTimeOffset : Date.now()
}