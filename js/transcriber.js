/**
 * Story Atlas — Transcriber
 * Converts an audio blob/dataURL to a transcript.
 *
 * MVP: uses Web Speech API on the audio (not ideal — real transcription
 * needs a server-side ASR model). For now, this module simulates the
 * transcription state machine and provides the watsonx.ai / IBM Speech
 * hook clearly labelled below.
 *
 * ── IBM watsonx integration point ────────────────────────────────
 * When IBM Speech to Text or watsonx.ai is available, replace
 * `transcribeLocally()` with a call to:
 *
 *   POST https://api.au-syd.speech-to-text.watson.cloud.ibm.com/v1/recognize
 *   Authorization: Bearer {IAM_TOKEN}
 *   Content-Type: audio/webm
 *   Body: audio blob
 *
 * Or use watsonx.ai Granite-speech model:
 *   POST https://us-south.ml.cloud.ibm.com/ml/v1/text/generation
 *   with the audio base64 encoded and model_id: 'ibm/granite-speech-3b'
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * Transcribe audio. Returns a promise that resolves to:
 *   { status: 'done', lines: string[] }
 * or rejects with an error.
 *
 * @param {Blob}   audioBlob
 * @param {string} audioDataUrl     — base64 data URL
 * @param {(status: string) => void} onStatus  — called with 'transcribing' then 'done'|'failed'
 * @param {string} [liveTranscript] — real-time transcript captured by Recorder during recording
 */
export async function transcribe(audioBlob, audioDataUrl, onStatus, liveTranscript) {
  onStatus('transcribing');

  // ── IBM watsonx / Speech to Text hook ────────────────────────
  // if (window.WATSONX_SPEECH_KEY) {
  //   return transcribeWithWatsonx(audioBlob, onStatus);
  // }
  // ─────────────────────────────────────────────────────────────

  // Use the live transcript captured by Recorder if available
  if (liveTranscript && liveTranscript.trim().length > 0) {
    return transcribeFromLive(liveTranscript, onStatus);
  }

  // Fallback: no live transcript — mark as pending so user can type it in
  return transcribeFallback(onStatus);
}

/**
 * The Recorder captured a live transcript via Web Speech API.
 * Clean it up lightly and return it as lines.
 */
async function transcribeFromLive(rawTranscript, onStatus) {
  await delay(400); // brief pause so the UI shows "transcribing" state
  const lines = splitIntoLines(rawTranscript.trim());
  onStatus('done');
  return { status: 'done', lines };
}

/**
 * No live transcript available (non-Chrome browser, or mic permission denied).
 * Mark as pending — the user can type the transcript manually.
 */
async function transcribeFallback(onStatus) {
  await delay(800);
  onStatus('done');
  return {
    status: 'done',
    lines: [],
  };
}

/**
 * Split a raw spoken transcript into sentence-like lines.
 * Capitalises first letter, adds full stop if missing.
 */
function splitIntoLines(text) {
  if (!text) return [];
  // Capitalise first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);
  // Add trailing full stop if missing
  if (!/[.!?]$/.test(text)) text += '.';
  // Capitalise after sentence-ending punctuation
  text = text.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  // Remove filler words
  text = text.replace(/\b(uh|um|er|hmm|hm),?\s*/gi, '');
  // Collapse spaces
  text = text.replace(/\s{2,}/g, ' ').trim();
  // Split at sentence boundaries into lines
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map(s => s.trim()).filter(Boolean);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect place names in transcript text using simple heuristics.
 * Returns array of { name, quote } objects.
 *
 * ── WATSONX NER hook ─────────────────────────────────────────────
 * Replace this with a call to watsonx NLU entity extraction for
 * much better accuracy:
 *   POST https://api.us-south.natural-language-understanding.watson.cloud.ibm.com/v1/analyze
 *   features: { entities: { model: 'en-news' } }
 * ─────────────────────────────────────────────────────────────────
 */
export function detectPlaces(text) {
  if (!text) return [];
  const places = [];
  const seen = new Set();

  // Match prepositions followed by capitalised proper nouns
  const pattern = /\b(?:in|at|near|outside|around|from|to|by|through|across)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.length < 3 || seen.has(name)) continue;
    // Exclude common false positives
    if (/^(I|We|They|He|She|The|A|An|My|Our|His|Her|Their)$/.test(name)) continue;
    seen.add(name);
    // Extract surrounding quote (up to 60 chars around the match)
    const start = Math.max(0, m.index - 10);
    const end   = Math.min(text.length, m.index + m[0].length + 20);
    places.push({ name, quote: text.slice(start, end).trim() });
  }

  return places;
}
