export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: "API key no configurada" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const boundary = req.headers["content-type"].split("boundary=")[1];
    const parts = buffer.toString("binary").split("--" + boundary);
    
    let base64 = "";
    let mimeType = "image/jpeg";
    
    for (const part of parts) {
      if (part.includes("Content-Disposition") && part.includes('name="image"')) {
        const match = part.match(/Content-Type: ([^\r\n]+)/);
        if (match) mimeType = match[1].trim();
        const bodyStart = part.indexOf("\r\n\r\n") + 4;
        const bodyEnd = part.lastIndexOf("\r\n");
        const binary = part.substring(bodyStart, bodyEnd);
        base64 = Buffer.from(binary, "binary").toString("base64");
      }
    }

    if (!base64) return res.status(400).json({ error: "No se recibió imagen" });

    const prompt = `Eres el asistente de codificación de Zubex para el área de CORRUGADO.
Analiza este comprobante y extrae ÚNICAMENTE estos datos:
- id: número después de "# Solicitud (ID):" (formato C-XXXX)
- tipo: "nuevo" o "modificacion"
- Si NUEVO: toma Ancho en MM y Largo en MTS directamente
- Si MODIFICACIÓN: las medidas están AL FINAL de la descripción del código (ej: BCO-5.25X50M = ancho 5.25, largo 50)
- ancho_mm: solo el número
- largo_mts: solo el número en metros

Responde ÚNICAMENTE con JSON válido:
{"id":"C-XXXX","tipo":"nuevo","ancho_mm":195,"largo_mts":95,"notas":"explicación breve"}`;

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
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const data = await resp.json();
    const raw = data.content?.map(c => c.text || "").join("").trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(clean);

    return res.status(200).json({ success: true, extracted });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
}
