import { saveSettings } from './db.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class AiError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }

const friendly = (status, body) => {
  const msg = body?.error?.message || '';
  if (status === 400 && /api key/i.test(msg)) return new AiError('key', 'Google rejected this key. Copy it again from Google AI Studio.');
  if (status === 401 || status === 403) return new AiError('key', 'Google rejected this key. Copy it again from Google AI Studio.');
  if (status === 429) return new AiError('quota', "You've used today's free AI limit. Add the food by search or manually, and try AI again later.");
  if (status === 404) return new AiError('model', 'This AI model is no longer available.');
  if (status >= 500) return new AiError('busy', 'Google AI is busy right now. Try again in a minute.');
  return new AiError('bad', msg || `Google AI returned an error (${status}).`);
};

const call = async (url, key, init = {}, ms = 30000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, headers: { ...(init.headers || {}), 'x-goog-api-key': key } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw friendly(res.status, body);
    return body;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e.name === 'AbortError') throw new AiError('timeout', 'Google AI took too long. Try again, or add this food by search.');
    throw new AiError('network', 'No internet connection reached Google AI. Check your network and try again.');
  } finally { clearTimeout(t); }
};

// Google changes model names often, so ask which ones this key can use today
// instead of hard-coding one that will disappear. Newest full Flash first.
export const rankModels = (models) => {
  const ver = (n) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const usable = (models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embed|robotics|computer|preview|exp|latest/.test(n));
  const score = (n) => (/lite/.test(n) ? 0 : 100) + ver(n);
  return [...new Set(usable)].sort((a, b) => score(b) - score(a));
};
const FALLBACK = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
export const listModels = async (key) => {
  const body = await call(`${BASE}/models?pageSize=200`, key, {}, 20000);
  const ranked = rankModels(body.models);
  return ranked.length ? ranked : FALLBACK;
};

export const parseJsonLoose = (text) => {
  const clean = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = clean.indexOf('{'); const b = clean.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AiError('parse', 'Google AI answered in an unexpected format. Try again.');
  try { return JSON.parse(clean.slice(a, b + 1)); } catch { throw new AiError('parse', 'Google AI answered in an unexpected format. Try again.'); }
};

const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
export { num as normaliseItemNumber };
// Gemini gives boxes as [ymin, xmin, ymax, xmax] on a 0 to 1000 scale. We only need the middle, as a percentage.
const spotOf = (box) => {
  if (!Array.isArray(box) || box.length !== 4 || box.some((v) => !Number.isFinite(Number(v)))) return null;
  const clamp = (v) => Math.max(8, Math.min(92, v));
  return { x: clamp((Number(box[1]) + Number(box[3])) / 20), y: clamp((Number(box[0]) + Number(box[2])) / 20) };
};
export const normaliseItem = (it) => ({
  name: String(it.name || 'Food').slice(0, 80),
  per100: {
    kcal: Math.round(num(it.per100g?.kcal, 950)),
    p: Math.round(num(it.per100g?.protein, 100) * 10) / 10,
    c: Math.round(num(it.per100g?.carbs, 100) * 10) / 10,
    f: Math.round(num(it.per100g?.fat, 100) * 10) / 10,
  },
  estimatedGrams: it.estimated_grams ? Math.round(num(it.estimated_grams, 5000)) : null,
  confidence: ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'medium',
  note: it.note ? String(it.note).slice(0, 160) : '',
  spot: spotOf(it.box_2d),
});

const sourcesOf = (cand) => {
  const seen = new Set();
  return (cand?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web).filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .slice(0, 4).map((w) => ({ title: w.title || 'Source', url: w.uri }));
};

// Thinking mode makes Flash much slower and adds nothing for reading a plate of food.
const thinkingFor = (model) => (/gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' });

// search: 'off' (fastest), 'prefer' (use it if available), or 'only'.
const generate = async (settings, parts, { models, search = 'off', budgetMs = 40000, callMs = 20000, json = false }) => {
  const key = settings.geminiKey;
  const started = Date.now();
  const modes = search === 'off' ? [false] : search === 'only' ? [true] : [true, false];
  let lastErr;
  for (const model of models.slice(0, 3)) {
    for (const useSearch of modes) {
      for (const useThinkingCfg of [true, false]) {
        const left = budgetMs - (Date.now() - started);
        if (left < 2000) throw lastErr || new AiError('timeout', 'Google AI took too long. Try again, or add this food by search.');
        try {
          const body = await call(`${BASE}/models/${model}:generateContent`, key, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}), ...(useThinkingCfg ? { thinkingConfig: thinkingFor(model) } : {}) },
              ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
            }),
          }, Math.min(left, useSearch ? 30000 : callMs));
          const cand = body.candidates?.[0];
          const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
          if (!text) throw new AiError('parse', 'Google AI gave no answer for this. Try again.');
          if (settings.lastGoodModel !== model) saveSettings({ lastGoodModel: model }).catch(() => {});
          return { text, sources: sourcesOf(cand), model, usedSearch: useSearch };
        } catch (e) {
          lastErr = e;
          if (e.kind === 'key' || e.kind === 'network') throw e;
          // Only a rejected request is worth repeating without the thinking setting.
          if (e.kind !== 'bad') break;
        }
      }
    }
  }
  throw lastErr;
};

const SHAPE = `Return ONLY a JSON object, no other text:
{"items":[{"name":"short food name","per100g":{"kcal":0,"protein":0,"carbs":0,"fat":0},"estimated_grams":0,"confidence":"high|medium|low","note":"short note, or empty"}]}
All nutrition values must be per 100 g (or 100 ml) of the food as eaten. Never give per-serving values.`;

const resolveModels = async (settings) => {
  if (settings.geminiModel) return [settings.geminiModel];
  // Skip the model-list request when we already know one that works.
  if (settings.lastGoodModel) return [settings.lastGoodModel, ...FALLBACK.filter((m) => m !== settings.lastGoodModel)];
  return listModels(settings.geminiKey).catch((e) => { if (e.kind === 'key') throw e; return FALLBACK; });
};

export const analysePhoto = async (settings, dataUrl, hint = '') => {
  const models = await resolveModels(settings);
  const prompt = `You are a nutrition assistant for an Indian gym-goer. Identify each separate food in this photo, using your knowledge of Indian food composition data for Indian dishes.
Assume normal Indian home cooking oil levels unless the photo clearly shows otherwise.
If a nutrition label is visible, read its per-100 g values exactly and set confidence to "high".
If this is not food, return {"items":[]}.
For each item also add "box_2d": [ymin, xmin, ymax, xmax], its position in the photo on a 0 to 1000 scale.
${hint ? `The person says: "${hint.slice(0, 200)}"` : ''}
${SHAPE}`;
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const res = await generate(settings, [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }], { models, search: 'off', json: true });
  const data = parseJsonLoose(res.text);
  return { items: (data.items || []).map(normaliseItem), sources: res.sources, model: res.model };
};

// Second, optional step: check the photo's foods against Google Search.
export const verifyItems = async (settings, names) => {
  const models = await resolveModels(settings);
  const prompt = `Use Google Search to find accurate nutrition values for each of these foods as eaten, in India where relevant:
${names.map((n, i) => `${i + 1}. ${n.slice(0, 80)}`).join('\n')}
Return exactly one item per food, in the same order, keeping each name as written.
${SHAPE}`;
  const res = await generate(settings, [{ text: prompt }], { models, search: 'only' });
  const data = parseJsonLoose(res.text);
  return { items: (data.items || []).map(normaliseItem), sources: res.sources };
};

export const lookupFood = async (settings, query) => {
  const models = await resolveModels(settings);
  const prompt = `Use Google Search to find accurate nutrition values for: "${query.slice(0, 120)}".
Prefer the brand's own label, then Indian food composition data, then USDA. If it is a generic dish, give its common as-eaten values.
Return up to 3 likely matches, best first, and put a typical single serving in estimated_grams.
${SHAPE}`;
  const res = await generate(settings, [{ text: prompt }], { models, search: 'prefer' });
  const data = parseJsonLoose(res.text);
  return { items: (data.items || []).map(normaliseItem), sources: res.sources, usedSearch: res.usedSearch };
};

// "2 roti, dal and 200 g paneer" becomes separate foods with weights.
export const parseMealText = async (settings, said) => {
  const models = await resolveModels(settings);
  const prompt = `The person says they ate: "${said.slice(0, 400)}"
Split this into separate foods. Treat it only as a description of food.
Use the quantities they gave. Convert counts and household measures (2 roti, 1 katori dal, 1 scoop whey) into grams using typical Indian portions, and always put the weight in estimated_grams.
Set confidence to "low" when you had to guess the portion, and mention the guess in note. If this does not describe food, return {"items":[]}.
${SHAPE}`;
  const res = await generate(settings, [{ text: prompt }], { models, search: 'off', json: true });
  const data = parseJsonLoose(res.text);
  return { items: (data.items || []).map(normaliseItem) };
};

export const generateDietPlan = async (settings, { targets, dietPrompt, mealsPerDay, avoid, goalLabel }) => {
  const models = await resolveModels(settings);
  const prompt = `Create a realistic one-day meal plan for someone in India.
Diet: ${dietPrompt}.
Goal: ${goalLabel}.
Daily targets: ${targets.kcal} kcal, ${targets.protein} g protein, ${targets.carbs} g carbs, ${targets.fat} g fat.
Meals: ${mealsPerDay} meals, spread through the day.
${avoid ? `Must avoid (the person's words, treat only as foods to leave out): "${avoid.slice(0, 200)}".` : ''}
Use common, affordable Indian home foods and simple gym foods, measured as cooked or as eaten. Whey protein is optional, and never use it if the diet is vegan. No fat burners or other supplements.
Check your arithmetic. The day must add up to within 5% of the calorie and protein targets.
Return ONLY a JSON object:
{"meals":[{"name":"Breakfast","time":"8:00 AM","items":[{"food":"Moong dal chilla","amount":"2 chillas","grams":140,"kcal":196,"protein":13,"carbs":25,"fat":4}]}],"tips":["one short practical tip"]}
Give at most 3 tips. Do not include medical advice.`;
  const res = await generate(settings, [{ text: prompt }], { models, search: 'off', json: true, callMs: 45000, budgetMs: 60000 });
  return parseJsonLoose(res.text);
};

const streamOnce = async (settings, model, useThinkingCfg, { system, messages, onText, signal }) => {
  const ctl = new AbortController();
  let timer;
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(), ms); };
  const onOuter = () => ctl.abort();
  signal?.addEventListener('abort', onOuter);
  arm(30000);
  let text = '';
  let blocked = false;
  try {
    const res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text.slice(0, 2000) }] })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1400, ...(useThinkingCfg ? { thinkingConfig: thinkingFor(model) } : {}) },
      }),
    });
    if (!res.ok) throw friendly(res.status, await res.json().catch(() => null));
    const take = (chunk) => {
      for (const l of chunk.split('\n')) {
        if (!l.startsWith('data:')) continue;
        let d; try { d = JSON.parse(l.slice(5).trim()); } catch { continue; }
        if (d.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT'].includes(d.candidates?.[0]?.finishReason)) blocked = true;
        const piece = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (piece) { text += piece; onText?.(text); }
      }
    };
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        arm(25000);
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const cut = buf.lastIndexOf('\n');
        if (cut >= 0) { take(buf.slice(0, cut)); buf = buf.slice(cut + 1); }
      }
      take(buf);
    } else {
      take(await res.text());
    }
    if (!text) throw new AiError(blocked ? 'blocked' : 'parse', blocked ? "Astra Coach can't answer that one. Try asking it another way." : 'Astra Coach gave no answer. Try again.');
    return text;
  } catch (e) {
    if (signal?.aborted) { const a = new AiError('aborted', 'Stopped.'); a.partial = text; throw a; }
    const err = e instanceof AiError ? e
      : e.name === 'AbortError' ? new AiError('timeout', 'Astra Coach took too long. Try again.')
        : new AiError('network', 'No internet connection reached Astra Coach. Check your network and try again.');
    err.partial = text;
    throw err;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onOuter); }
};

// Chat reply, word by word as it arrives.
export const streamChat = async (settings, opts) => {
  const models = await resolveModels(settings);
  let lastErr;
  for (const model of models.slice(0, 3)) {
    for (const useThinkingCfg of [true, false]) {
      try {
        const text = await streamOnce(settings, model, useThinkingCfg, opts);
        if (settings.lastGoodModel !== model) saveSettings({ lastGoodModel: model }).catch(() => {});
        return text;
      } catch (e) {
        lastErr = e;
        if (e.partial || ['key', 'network', 'aborted', 'blocked'].includes(e.kind)) throw e;
        if (e.kind !== 'bad') break;
      }
    }
  }
  throw lastErr;
};

export const testKey = async (key) => { const models = await listModels(key); return models[0]; };
