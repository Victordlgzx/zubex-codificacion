export const config = { runtime: "edge" };
 
export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
 
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return new Response(JSON.stringify({ error: "API key no configurada" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
 
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image");
    if (!imageFile) {
      return new Response(JSON.stringify({ error: "No se recibió imagen" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
 
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = imageFile.type || "image/jpeg";
 
    const prompt = `Eres el asistente de codificación de Zubex para el área de CORRUGADO.
Analiza este comprobante y extrae ÚNICAMENTE estos datos:
 
REGLAS ESTRICTAS:
- id: número después de "# Solicitud (ID):" (formato C-XXXX)
- tipo: "nuevo" si dice "Tipo de solicitud: Nuevo", "modificacion" si dice "Modificación"
- Si NUEVO: toma Ancho en MM y Largo en MTS directamente del comprobante
- Si MODIFICACIÓN: el campo "Código a modificar" tiene formato CÓDIGO seguido de DESCRIPCIÓN. Las medidas están AL FINAL de la descripción separadas por guión. Ejemplos: "BCO-5.25X50M" = ancho 5.25, largo 50. "NIA-BCO-8.5X100M" = ancho 8.5, largo 100. "BCO-195X95M" = ancho 195, largo 95.
- ancho_mm: solo el número (puede ser MM o pulgadas como 5.25, 8.5, 11)
- largo_mts: solo el número en metros
 
Responde ÚNICAMENTE con JSON válido sin ningún texto adicional:
{"id":"C-XXXX","tipo":"nuevo","ancho_mm":195,"largo_mts":95,"notas":"breve explicación"}`;
 
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
 
    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
