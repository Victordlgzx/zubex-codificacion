export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key no configurada" });

  try {
    const body = req.body;
    const image = body && body.image;
    const mimeType = (body && body.mimeType) || "image/jpeg";
    
    if (!image) return res.status(400).json({ error: "No imagen", body: JSON.stringify(body).substring(0,100) });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: image } },
            { type: "text", text: 'Analiza este comprobante Zubex. Responde SOLO con JSON sin markdown:\n{"id":"C-XXXX","ancho_mm":195,"largo_mts":95,"notas":"explicacion"}\nReglas: id=numero despues de # Solicitud (ID). Si Nuevo: toma Ancho y Largo directo. Si Modificacion: medidas al final de descripcion del codigo formato NxM.' }
          ]
        }]
      })
    });

    const claudeData = await resp.json();
    if (claudeData.error) return res.status(500).json({ error: claudeData.error.message, type: claudeData.error.type });

    const raw = (claudeData.content || []).map(c => c.text || "").join("").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: "Sin JSON en respuesta", raw: raw.substring(0,300) });

    const extracted = JSON.parse(match[0]);
    return res.status(200).json({ success: true, extracted });

  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack, type: e.constructor.name });
  }
}
