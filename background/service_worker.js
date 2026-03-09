// ─────────────────────────────────────────────
// Email Threat Detector — Service Worker
// Gemini AI-powered email threat analysis
// ─────────────────────────────────────────────

import { CONFIG } from '../config.js';

// ─── GEMINI RESPONSE CACHE ───────────────────
const geminiCache = new Map();
const CACHE_TTL   = 10 * 60 * 1000; // 10 minutes

function hashEmail(email) {
  const raw = `${email.sender}|${email.subject}|${(email.body || "").substring(0, 500)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function getCachedResult(key) {
  const entry = geminiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    geminiCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedResult(key, result) {
  geminiCache.set(key, { result, timestamp: Date.now() });
  if (geminiCache.size > 50) {
    const oldest = geminiCache.keys().next().value;
    geminiCache.delete(oldest);
  }
}

// ─── MESSAGE HANDLER ─────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_EMAIL") {
    analyzeEmail(message.emailData)
      .then(result => sendResponse({ success: true, result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── MAIN ANALYSIS ──────────────────────────
async function analyzeEmail(emailData) {
  const geminiKey = CONFIG.GEMINI_API_KEY || "";

  if (!geminiKey || geminiKey === "PASTE_YOUR_GEMINI_API_KEY_HERE") {
    throw new Error("No Gemini API key configured. Add your key in config.js.");
  }

  // Check cache
  const cacheKey = hashEmail(emailData);
  const cached   = getCachedResult(cacheKey);
  if (cached) return cached;

  const prompt  = buildPrompt(emailData);
  const result  = await callGemini(geminiKey, prompt);

  setCachedResult(cacheKey, result);
  return result;
}

// ─── GEMINI API CALL ─────────────────────────
const GEMINI_MODEL = "gemini-2.5-flash";

async function callGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature      : 0.1,
          maxOutputTokens  : 2048,
          responseMimeType : "application/json",
          thinkingConfig   : { thinkingBudget: 0 }
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please wait a minute and try again.");
    }
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const data  = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];

  // Gemini 2.5+ may include "thought" parts — find the actual text
  const textParts = parts.filter(p => p.text !== undefined && !p.thought);
  const rawText   = textParts.length > 0
    ? textParts.map(p => p.text).join("")
    : (parts.find(p => p.text)?.text || "{}");

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  // Normalize verdict
  const rawVerdict = (parsed.verdict || "").toUpperCase();
  let verdict;
  if (rawVerdict === "HIGH"   || rawVerdict === "PHISHING")   verdict = "HIGH";
  else if (rawVerdict === "MEDIUM" || rawVerdict === "SUSPICIOUS") verdict = "MEDIUM";
  else verdict = "LOW";

  return {
    verdict,
    confidence : parsed.confidence  || 0,
    summary    : parsed.summary     || "",
    indicators : (parsed.indicators || []).map(ind => ({
      label  : ind.label  || "",
      detail : ind.detail || "",
      score  : Math.max(0, Math.min(100, parseInt(ind.score, 10) || 0))
    }))
  };
}

// ─── PROMPT ──────────────────────────────────
function buildPrompt(email) {
  return `You are a cybersecurity expert specializing in phishing and email threat detection.

Analyze the following email and return a JSON object ONLY (no markdown, no code fences, pure JSON).

EMAIL TO ANALYZE:
- Subject: ${email.subject || "(none)"}
- From: ${email.senderName || ""} <${email.sender || ""}>
- Body:
${(email.body || "").substring(0, 3000)}
${email.links?.length ? `\n- Links found in email:\n${email.links.slice(0, 10).join("\n")}` : ""}
${email.attachments?.length ? `\n- Attachments found:\n${email.attachments.slice(0, 10).join("\n")}` : "- No attachments found."}

Return exactly this JSON structure:
{
  "verdict": "LOW" | "MEDIUM" | "HIGH",
  "confidence": <integer 0-100>,
  "summary": "<one sentence describing what this email is and its threat level>",
  "indicators": [
    { "label": "<short indicator name>", "detail": "<brief explanation>", "score": <integer 0-100> }
  ]
}

Indicator rules:
- Always include exactly these 5 indicators in this order:
  1. "Sender Legitimacy" - does the sender domain match who they claim to be?
  2. "Link Safety" - are URLs suspicious, IP-based, shortened, or brand-impersonating?
  3. "Attachment Safety" - are attachment filenames suspicious (e.g. .exe, .zip, .scr, double extensions, urgency keywords)? If no attachments, score 0 and note none were found.
  4. "Language Tone" - urgency, threats, fear tactics, pressure to act?
  5. "Request Type" - asking for credentials, payment info, personal data?
- Each indicator gets a "score" from 0 (no risk) to 100 (maximum risk).

Verdict guide:
- LOW = email appears safe, no significant threats detected
- MEDIUM = some suspicious elements found, user should be cautious
- HIGH = strong phishing or threat indicators, do not interact with this email

Be concise. Be accurate. Always return valid JSON.`;
}
