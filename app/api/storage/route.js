import { kv } from "@vercel/kv";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
    const data = await kv.get(key);
    return Response.json({ data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { key, value } = await request.json();
    if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
    await kv.set(key, value);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
    await kv.del(key);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
