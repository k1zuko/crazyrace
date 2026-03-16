import { NextResponse } from "next/server"
import crypto from "crypto"
import { spawn } from "child_process"

const SECRET = "e694k3dRoH/lbYM5Ze/2SkCpLpT9UgB6+6wGIBx0Dk0="

export async function POST(req: Request) {

  const signature = req.headers.get("x-hub-signature-256")

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 401 })
  }

  const body = await req.arrayBuffer()
  const rawBody = Buffer.from(body)

  const hash =
    "sha256=" +
    crypto
      .createHmac("sha256", SECRET)
      .update(rawBody)
      .digest("hex")

  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
  }

  const payload = JSON.parse(rawBody.toString())

  if (payload.ref !== "refs/heads/main") {
    return NextResponse.json({ message: "Not main branch" })
  }

  const commit = payload.head_commit || payload.commits?.[0]

  const author = commit?.author?.name || "Unknown"
  const message = commit?.message || "-"
  const hashShort = commit?.id?.substring(0, 7) || "N/A"

  spawn(
    "bash",
    [
      "/www/wwwroot/Bot-Deploy/deploy-crazyrace.sh",
      author,
      hashShort,
      message
    ],
    {
      detached: true,
      stdio: "ignore",
    }
  ).unref()

  return NextResponse.json({ success: true })
}