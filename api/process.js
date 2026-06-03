export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
 
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key no configurada" });
 
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "No se recibio imagen" });
 
    const prompt = `Analiza este comprobante Zubex. Responde UNICAMENTE con JSON puro sin markdown:
{"id":"C-XXXX","ancho_mm":195,"largo_mts":95,"notas":"de donde obtuviste los datos"}
 
- id: numero despues de # Solicitud (ID):
- Si dice Tipo de solicitud Nuevo: toma Ancho y Largo directamente
- Si dice Modificacion: las medidas estan al final de la descripcion del codigo, formato NxM donde N=ancho M=largo`;
 
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
            { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: image } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
 
    const claudeData = await resp.json();
    
    if (claudeData.error) return res.status(500).json({ error: claudeData.error.message || JSON.stringify(claudeData.error) });
 
    const raw = (claudeData.content || []).map(c => c.text || "").join("").trim();
    if (!raw) return res.status(500).json({ error: "Claude no respondio", debug: JSON.stringify(claudeData) });
 
    // Limpiar cualquier markdown
    const clean = raw.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
    
    // Encontrar el JSON dentro del texto
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "No se encontro JSON en: " + clean.substring(0,200) });
    
    const extracted = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ success: true, extracted });
 
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
