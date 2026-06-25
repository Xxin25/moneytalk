import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

// 正确初始化手动申请的 Upstash Redis 客户端
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export async function POST(request) {
  try {
    const headersList = request.headers
    const globalPassword = headersList.get('x-global-password')
    const userToken = headersList.get('x-user-token')

    // 1. 第一层全站防御：校验全局密码
    if (!globalPassword || globalPassword !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Global Password' }, { status: 401 })
    }

    // 2. 校验用户专属暗号
    if (!userToken) {
      return NextResponse.json({ error: 'Missing User Token' }, { status: 400 })
    }

    const { key, value } = await request.json()
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    
    // 3. 第二层数据隔离：强制拼装专属暗号前缀沙盒
    const sandboxKey = `mt3_user:${userToken}:${key}`
    
    // 序列化后安全存入 Redis
    await redis.set(sandboxKey, JSON.stringify(value))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Storage POST Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    
    const headersList = request.headers
    const globalPassword = headersList.get('x-global-password')
    const userToken = headersList.get('x-user-token')

    // 1. 第一层全站防御
    if (!globalPassword || globalPassword !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Global Password' }, { status: 401 })
    }

    // 2. 校验参数与暗号
    if (!key || !userToken) {
      return NextResponse.json({ error: 'Missing key or user token' }, { status: 400 })
    }

    // 3. 提取专属沙盒数据
    const sandboxKey = `mt3_user:${userToken}:${key}`
    const data = await redis.get(sandboxKey)

    return NextResponse.json({ 
      data: data ? (typeof data === 'string' ? JSON.parse(data) : data) : null 
    })
  } catch (error) {
    console.error('Storage GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    const headersList = request.headers
    const globalPassword = headersList.get('x-global-password')
    const userToken = headersList.get('x-user-token')

    if (!globalPassword || globalPassword !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!key || !userToken) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

    const sandboxKey = `mt3_user:${userToken}:${key}`
    await redis.del(sandboxKey)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
