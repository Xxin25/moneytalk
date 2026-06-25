import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

// 兼容所有可能的名字，哪个有就用哪个！
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
})

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get("key")
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 })

    const data = await redis.get(key)
    return NextResponse.json({ data: data || [] })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { key, value } = await request.json()
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 })

    await redis.set(key, value)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get("key")
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 })

    await redis.del(key)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
