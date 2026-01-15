// Server Component - Fetches data on the server before rendering
import { getSessionSettings } from "@/lib/supabase-server"
import SettingsForm from "./settings-form"

type Props = {
  params: { roomCode: string }
}

export default async function HostSettingsPage({ params }: Props) {
  const roomCode = params.roomCode;

  // ✅ Data fetching happens on the SERVER - instant for the client!
  const initialData = await getSessionSettings(roomCode);

  // Pass pre-fetched data to Client Component
  return <SettingsForm roomCode={roomCode} initialData={initialData} />
}
