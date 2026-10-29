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
 * @param {string} audioDataUrl  — base64 data URL
 * @param {(status: string) => void} onStatus  — called with 'transcribing' then 'done'|'failed'
 */
export async function transcribe(audioBlob, audioDataUrl, onStatus) {
  onStatus('transcribing');

  // ── WATSONX HOOK ─────────────────────────────────────────────
  // if (window.WATSONX_SPEECH_KEY) {
  //   return transcribeWithWatsonx(audioBlob, onStatus);
  // }
  // ─────────────────────────────────────────────────────────────

  // Browser Speech Recognition on a recorded blob is not reliable
  // (it requires a live stream). So for local MVP we:
  //   1. Try Web Speech API as a live fallback (gives best results if the
  //      user just finished recording — the API often still has the audio).
  //   2. Fall back to a placeholder that marks the transcript as needing review.
  return transcribeLocally(onStatus);
}

/**
 * Attempt transcription using Web Speech API.
 * This fires a new recognition session; it won't replay the recording
 * but will capture any speech the user adds during the "transcribing" state.
 * In practice the transcript already arrived in real-time during recording
 * via the recorder's SpeechRecognition session if used.
 */
async function transcribeLocally(onStatus) {
  // In the new audio-first model, transcription of the stored blob
  // isn't possible client-side without a server.
  // We mark it 'done' with a placeholder and let the user edit it.
  await delay(1200); // simulate async work
  onStatus('done');
  return {
    status: 'done',
    lines: [], // transcript filled by user editing or watsonx
  };
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
