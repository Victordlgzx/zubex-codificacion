import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key no configurada" });

  const form = formidable({});
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = Array.isArray(files.image) ? files.image[0] : files.image;
    if (!file) return res.status(400).json({ error: "No se recibió imagen" });

    const buffer = fs.readFileSync(file.filepath);
    const base64 = buffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg";

    const prompt = `Eres el asistente de codificación de Zubex para CORRUGADO.
Analiza el comprobante y extrae:
- id: número después de "# Solicitud (ID):"
- tipo: "nuevo" o "modificacion"
- Si NUEVO: Ancho en MM y Largo en MTS del comprobante
- Si MODIFICACIÓN: medidas al final de la descripción del código (ej: BCO-5.25X50M = ancho 5.25, largo 50)
- ancho_mm y largo_mts: solo números

Responde ÚNICAMENTE con JSON:
{"id":"C-XXXX","tipo":"nuevo","ancho_mm":195,"largo_mts":95,"notas":"explicación"}`;

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            { type: "text", text: prompt }
          ]}]
        })
      });

      const data = await resp.json();
      const raw = data.content?.map(c => c.text || "").join("").trim();
      const extracted = JSON.parse(raw.replace(/```json|```/g, "").trim());
      return res.status(200).json({ success: true, extracted });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  });
}
}
