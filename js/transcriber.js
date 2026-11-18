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
export function splitIntoLines(text) {
  if (!text) return [];
  // Remove filler words first, so the word after "um" gets capitalised
  text = text.replace(/\b(uh|um|er|hmm|hm),?\s*/gi, '');
  // Collapse spaces
  text = text.replace(/\s{2,}/g, ' ').trim();
  if (!text) return [];
  // Capitalise first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);
  // Add trailing full stop if missing
  if (!/[.!?]$/.test(text)) text += '.';
  // Capitalise after sentence-ending punctuation
  text = text.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
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

  // Words that end a place name or can never start one.
  const STOP = new Set(('i we they he she you it the a an my our his her their your this that these those ' +
    'which what who there here some any all just then when where while with and but or so because if as ' +
    'was were is are am be been had has have did do does would could should will can got get went go came ' +
    'come for of on in at to from by near until till after before during about every each one two three ' +
    'not no very really also too back again once still always never maybe').split(' '));
  // Capitalised words that are not places.
  const DATES = new Set(('january february march april may june july august september october november december ' +
    'monday tuesday wednesday thursday friday saturday sunday christmas easter thanksgiving halloween').split(' '));
  const NOT_PLACE = new Set(('god dad mom mum mother father grandma grandpa mama papa mr mrs ms dr').split(' '));
  // Lower-case words that follow "in/at/to" all the time and are not places on their own.
  const GENERIC = new Set(('school home work church bed town college class night day time first last fact front ' +
    'love trouble charge order general particular case line touch law mind high').split(' '));
  const JOINERS = new Set(['of', 'the', 'de', 'la', 'del', 'du', 'on', 'upon']);

  const isCap = w => /^[A-Z]/.test(w);
  const bare  = w => w.replace(/[^A-Za-z0-9'’-]/g, '');
  const title = w => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);

  // Speech recognisers either capitalise proper nouns or return everything in
  // lower case. If any word is capitalised mid-sentence we can trust capitals.
  const hasCaps = /[a-z,]\s+(?!I\b)[A-Z][a-z]/.test(text);

  function add(words, index, length) {
    while (words.length && JOINERS.has(words[words.length - 1].toLowerCase())) words.pop();
    if (!words.length) return;
    // "in June" is a date, but "Cape May" is a place.
    if (words.every(w => DATES.has(bare(w).toLowerCase()))) return;
    const name = words.map(title).join(' ').replace(/\s+,/g, ',');
    const key  = name.toLowerCase();
    if (key.length < 3 || seen.has(key)) return;
    seen.add(key);
    const start = Math.max(0, index - 20);
    const end   = Math.min(text.length, index + length + 30);
    places.push({ name, quote: text.slice(start, end).trim() });
  }

  // Street addresses first: "at 12 Beach Avenue", optionally followed by a town.
  const SUFFIX = 'street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|place|pl|court|ct|circle|cir|highway|hwy';
  const addrRe = new RegExp(
    '\\b(\\d+\\s+(?:[a-zA-Z]+\\s+){1,3}(?:' + SUFFIX + ')\\b)(?:,?\\s+in\\b)?((?:,?\\s+[a-zA-Z]+){0,3})', 'gi');
  const addrSpans = [];
  let m;
  while ((m = addrRe.exec(text)) !== null) {
    // The town after the street: capitalised words, or (in all-lower-case
    // text) the words up to the first one that cannot be part of a name.
    const town = [];
    for (const raw of (m[2] || '').trim().split(/\s+/).filter(Boolean)) {
      const w = bare(raw), lw = w.toLowerCase();
      if (STOP.has(lw) || NOT_PLACE.has(lw)) break;
      if (hasCaps ? !isCap(w) : GENERIC.has(lw)) break;
      town.push(w);
    }
    const words = m[1].split(/\s+/);
    if (town.length) { words[words.length - 1] += ','; words.push(...town); }
    add(words, m.index, m[0].length);
    addrSpans.push([m.index, m.index + m[0].length]);
  }

  // Then "in / at / near … <place>".
  const prepRe = /\b(?:in|at|near|outside|around|from|to|by|through|across)\s+((?:[A-Za-z0-9'’.-]+,?\s*){1,6})/gi;
  while ((m = prepRe.exec(text)) !== null) {
    prepRe.lastIndex = m.index + m[0].indexOf(m[1]);   // the next match may start inside this one
    if (addrSpans.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const tokens = m[1].trim().split(/\s+/);
    const words = [];
    for (let t = 0; t < tokens.length && words.length < 5; t++) {
      const raw = tokens[t], w = bare(raw), lw = w.toLowerCase();
      if (!w) break;
      // "St. Louis" keeps going; any other full stop ends the name.
      const sentenceEnd = /[.!?]$/.test(raw) && !/^(st|mt|ft)\.$/i.test(raw);
      if (hasCaps) {
        // Take the run of capitalised words ("Lincoln High School", "Springfield, Illinois").
        if (isCap(w) && !STOP.has(lw) && !NOT_PLACE.has(lw)) words.push(w + (raw.endsWith(',') ? ',' : ''));
        else if (words.length && JOINERS.has(lw) && tokens[t + 1] && isCap(bare(tokens[t + 1]))) words.push(lw);
        else if (!words.length && lw === 'the') continue;
        else break;
      } else {
        // All lower case: take words until one that cannot be part of a name.
        if (STOP.has(lw) || NOT_PLACE.has(lw) || /^\d/.test(w)) break;
        if (!words.length && GENERIC.has(lw)) break;
        words.push(w);
        if (words.length === 4) break;
      }
      if (sentenceEnd) break;
    }
    if (words.length) words[words.length - 1] = words[words.length - 1].replace(/,$/, '');
    add(words, m.index, m[0].length);
  }

  return places;
}
