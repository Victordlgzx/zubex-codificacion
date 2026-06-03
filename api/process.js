export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key no configurada" });

  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "No se recibió imagen" });

    const prompt = `Eres el asistente de codificación de Zubex para CORRUGADO.
Analiza el comprobante y extrae:
- id: número después de "# Solicitud (ID):"
- tipo: "nuevo" o "modificacion"  
- Si NUEVO: Ancho en MM y Largo en MTS del comprobante
- Si MODIFICACIÓN: medidas al final de la descripción del código (ej: BCO-5.25X50M = ancho 5.25, largo 50)

Responde ÚNICAMENTE con JSON:
{"id":"C-XXXX","tipo":"nuevo","ancho_mm":195,"largo_mts":95,"notas":"explicación"}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: image } },
          { type: "text", text: prompt }
        ]}]
      })
    });

    const data = await resp.json();
if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
const raw = data.content?.map(c => c.text || "").join("").trim();
if (!raw) return res.status(500).json({ error: "Claude no respondió", data });
try {
  const extracted = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return res.status(200).json({ success: true, extracted });
} catch(e) {
  return res.status(500).json({ error: "JSON inválido: " + raw });
}
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
