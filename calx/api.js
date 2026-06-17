/**
 * api.js — AI food scanning: image (upload/paste/camera) + text description
 */

const FoodAPI = (() => {

  // ─── Prompts ───────────────────────────────────────────────────────────────

  const JSON_FORMAT = `
Respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "name": "Meal name or combined dish label",
  "servingSize": "e.g. 2 rotis + 1 cup curd",
  "calories": 420,
  "protein": 18,
  "fat": 9,
  "carbs": 62,
  "confidence": "high|medium|low",
  "notes": "optional brief note"
}
All macros in grams. Calories in kcal.`;

  const IMAGE_SYSTEM = `You are a nutrition analysis assistant. Identify the food in the image and estimate nutritional content.${JSON_FORMAT}`;

  const TEXT_SYSTEM = `You are a nutrition analysis assistant. The user will describe a meal or list of foods in plain text (e.g. "2 rotis, curd, dal"). Estimate the combined nutritional content as accurately as possible for typical Indian/international portions. If multiple items are listed, sum them into one response.${JSON_FORMAT}`;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function parseResponse(text) {
    const cleaned   = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse nutrition data from the AI response. Try again.');
    const p = JSON.parse(jsonMatch[0]);
    return {
      name:        String(p.name        || 'Unknown Food'),
      servingSize: String(p.servingSize || '1 serving'),
      calories:    Math.max(0, Math.round(Number(p.calories) || 0)),
      protein:     Math.max(0, Math.round(Number(p.protein)  || 0)),
      fat:         Math.max(0, Math.round(Number(p.fat)      || 0)),
      carbs:       Math.max(0, Math.round(Number(p.carbs)    || 0)),
      confidence:  ['high','medium','low'].includes(p.confidence) ? p.confidence : 'medium',
      notes:       String(p.notes || ''),
    };
  }

  // ─── Image scan — OpenAI ───────────────────────────────────────────────────

  async function imageOpenAI(apiKey, b64, mime, userPrompt) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 600,
        messages: [
          { role: 'system', content: IMAGE_SYSTEM },
          { role: 'user', content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'low' } }
          ]}
        ]
      })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `OpenAI error ${res.status}`); }
    return parseResponse((await res.json()).choices?.[0]?.message?.content || '');
  }

  // ─── Image scan — Gemini ───────────────────────────────────────────────────

  async function imageGemini(apiKey, b64, mime, userPrompt) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: IMAGE_SYSTEM + '\n\n' + userPrompt },
          { inline_data: { mime_type: mime, data: b64 } }
        ]}],
        generationConfig: { maxOutputTokens: 600, temperature: 0.1 }
      })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Gemini error ${res.status}`); }
    return parseResponse((await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '');
  }

  // ─── Image scan — Custom (OpenAI-compatible) ───────────────────────────────

  async function imageCustom(settings, b64, mime, userPrompt) {
    const model = settings.customModel || 'openai/gpt-4o';
    const res = await fetch(settings.customEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
        'HTTP-Referer': location.origin,
        'X-Title': 'CalorieLens',
      },
      body: JSON.stringify({
        model, max_tokens: 600,
        messages: [
          { role: 'system', content: IMAGE_SYSTEM },
          { role: 'user', content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
          ]}
        ]
      })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Custom API error ${res.status}`); }
    return parseResponse((await res.json()).choices?.[0]?.message?.content || '');
  }

  // ─── Text scan — OpenAI ────────────────────────────────────────────────────

  async function textOpenAI(apiKey, description) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 600,
        messages: [
          { role: 'system', content: TEXT_SYSTEM },
          { role: 'user',   content: description }
        ]
      })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `OpenAI error ${res.status}`); }
    return parseResponse((await res.json()).choices?.[0]?.message?.content || '');
  }

  // ─── Text scan — Gemini ────────────────────────────────────────────────────

  async function textGemini(apiKey, description) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: TEXT_SYSTEM + '\n\nUser meal description: ' + description }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.1 }
      })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Gemini error ${res.status}`); }
    return parseResponse((await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '');
  }

  // ─── Text scan — Custom ────────────────────────────────────────────────────

  async function textCustom(settings, description) {
    const model = settings.customModel || 'openai/gpt-4o';
    const res = await fetch(settings.customEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
        'HTTP-Referer': location.origin,
        'X-Title': 'CalorieLens',
      },
      body: JSON.stringify({
        model, max_tokens: 600,
        messages: [
          { role: 'system', content: TEXT_SYSTEM },
          { role: 'user',   content: description }
        ]
      })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Custom API error ${res.status}`); }
    return parseResponse((await res.json()).choices?.[0]?.message?.content || '');
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async function scanFood(file, context = '') {
    const s = Storage.getApiSettings();
    if (!s.apiKey) throw new Error('No API key configured. Add one in Settings.');
    const mime = file.type || 'image/jpeg';
    const b64  = await fileToBase64(file);
    const prompt = context
      ? `Analyse this food image. User context: "${context}"`
      : 'Analyse this food image and estimate nutritional values.';
    switch (s.provider) {
      case 'openai': return imageOpenAI(s.apiKey, b64, mime, prompt);
      case 'gemini': return imageGemini(s.apiKey, b64, mime, prompt);
      case 'custom': return imageCustom(s, b64, mime, prompt);
      default: throw new Error(`Unknown provider: ${s.provider}`);
    }
  }

  async function scanText(description) {
    const s = Storage.getApiSettings();
    if (!s.apiKey) throw new Error('No API key configured. Add one in Settings.');
    if (!description?.trim()) throw new Error('Please describe your meal first.');
    switch (s.provider) {
      case 'openai': return textOpenAI(s.apiKey, description);
      case 'gemini': return textGemini(s.apiKey, description);
      case 'custom': return textCustom(s, description);
      default: throw new Error(`Unknown provider: ${s.provider}`);
    }
  }

  return { scanFood, scanText, parseResponse };
})();
