export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key no configurada" });

  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "No se recibio imagen" });

    const prompt = `Analiza este comprobante de solicitud Zubex y responde SOLO con este JSON, sin texto adicional, sin comillas de codigo:
{"id":"C-XXXX","tipo":"nuevo","ancho_mm":195,"largo_mts":95,"notas":"explicacion"}

Reglas:
- id: numero despues de # Solicitud (ID):
- tipo: nuevo o modificacion
- Si NUEVO: Ancho en MM y Largo en MTS del comprobante
- Si MODIFICACION: medidas al final de la descripcion del codigo separadas por X (ej BCO-5.25X50M significa ancho=5.25 largo=50)
- Solo numeros en ancho_mm y largo_mts`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: image } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const claudeData = await resp.json();
    
    if (claudeData.error) {
      return res.status(500).json({ error: "Claude error: " + JSON.stringify(claudeData.error) });
    }

    const raw = (claudeData.content || []).map(c => c.text || "").join("").trim();
    
    if (!raw) {
      return res.status(500).json({ error: "Claude no respondio nada", debug: claudeData });
    }

    let extracted;
    try {
      extracted = JSON.parse(raw);
    } catch(e) {
      return res.status(500).json({ error: "JSON invalido de Claude: " + raw.substring(0, 200) });
    }

    return res.status(200).json({ success: true, extracted });

  } catch(e) {
    return res.status(500).json({ error: "Error general: " + e.message });
  }
}
