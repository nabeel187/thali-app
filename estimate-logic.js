// Shared logic for calling an OpenRouter LLM to estimate a meal's calories and protein.
// Used by both server.js (Render / any Node host) and api/estimate.js (Vercel).
//
// OpenRouter exposes an OpenAI-compatible /chat/completions endpoint, so this uses
// the "image_url" (data URL) format for photos rather than Anthropic's native format.

const SYSTEM_INSTRUCTION = `You are a nutrition estimator. Given a description or photo, first decide whether it actually
describes food or drink meant to be eaten (a meal, snack, ingredient, or beverage). Gibberish, random
words, objects, people, places, or anything that isn't food/drink should be treated as NOT food.

Respond with ONLY a JSON object, no markdown fences, no preamble, in exactly this shape:
{"is_food": true|false, "name": "short meal name, max 6 words", "calories": <number>, "protein_g": <number>, "confidence": "low"|"medium"|"high"}

If is_food is false, still include the other fields but set calories and protein_g to 0.
If is_food is true, use your best real-world estimate for typical portion sizes if not specified.
Never respond with anything except the JSON object.`;

async function estimateMeal({ mode, text, imageBase64, mediaType }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  if (!apiKey) {
    const err = new Error("Server is missing OPENROUTER_API_KEY.");
    err.status = 500;
    throw err;
  }

  let userContent;
  if (mode === "image") {
    if (!imageBase64) {
      const err = new Error("Missing imageBase64.");
      err.status = 400;
      throw err;
    }
    const dataUrl = `data:${mediaType || "image/jpeg"};base64,${imageBase64}`;
    userContent = [
      { type: "text", text: SYSTEM_INSTRUCTION },
      { type: "image_url", image_url: { url: dataUrl } }
    ];
  } else {
    if (!text || !text.trim()) {
      const err = new Error("Missing text.");
      err.status = 400;
      throw err;
    }
    userContent = SYSTEM_INSTRUCTION + "\n\nMeal: " + text.trim();
  }

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  };
  // Optional but recommended by OpenRouter for analytics/rate-limit attribution.
  if (process.env.APP_URL) headers["HTTP-Referer"] = process.env.APP_URL;
  headers["X-Title"] = "Thali";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error("OpenRouter API error: " + errText);
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const messageContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!messageContent) {
    const err = new Error("No content in model response.");
    err.status = 502;
    throw err;
  }

  const clean = messageContent
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    const err = new Error("Could not parse the model's response as JSON.");
    err.status = 502;
    throw err;
  }

  if (parsed.is_food === false) {
    const err = new Error();
    err.status = 422;
    err.code = "not_food";
    throw err;
  }

  return {
    name: String(parsed.name || "Meal").slice(0, 80),
    calories: Number(parsed.calories) || 0,
    protein_g: Number(parsed.protein_g) || 0,
    confidence: parsed.confidence || "medium"
  };
}

module.exports = { estimateMeal, SYSTEM_INSTRUCTION };
