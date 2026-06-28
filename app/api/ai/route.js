export async function POST(request) {
  try {
    const { prompt } = await request.json();
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    
    if (!apiKey) {
      return Response.json({ error: "Missing API key" }, { status: 500 });
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
        })
      }
    );
    
    const data = await resp.json();
    
    if (data.error) {
      return Response.json({ error: data.error.message }, { status: 500 });
    }
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
