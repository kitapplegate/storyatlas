/**
 * StoryAtlas — Grammar cleanup
 *
 * MVP: rule-based cleanup that corrects common transcription artifacts
 * without changing the storyteller's voice or wording.
 *
 * ── IBM Bob / watsonx integration point ─────────────────────────────────────
 * Replace `cleanWithRules()` with a call to watsonx.ai (ibm/granite-13b-chat-v2
 * or similar) using the prompt template below.  The function signature stays
 * identical so the rest of the app needs zero changes.
 *
 * Prompt template (system):
 *   "You are a copyeditor, not a ghostwriter. Fix grammar, punctuation,
 *    and transcription errors in the following spoken text. Never change the
 *    storyteller's word choices, facts, place names, or voice. Do not add
 *    information. Do not summarise. Return only the corrected text."
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Clean up transcript text.
 * @param {string} text - raw speech-to-text output
 * @returns {string} lightly corrected text
 */
function cleanGrammar(text) {
  if (!text || !text.trim()) return text;
  return cleanWithRules(text);
}

function cleanWithRules(text) {
  let t = text.trim();

  // 1. Capitalise first letter
  t = t.charAt(0).toUpperCase() + t.slice(1);

  // 2. Add full stop if none at end
  if (!/[.!?…]$/.test(t)) t += '.';

  // 3. Capitalise "i" as standalone pronoun
  t = t.replace(/\bi\b/g, 'I');

  // 4. Fix common transcription run-ons: "uh", "um", "er" fillers
  t = t.replace(/\b(uh|um|er|hmm|hm),?\s*/gi, '');

  // 5. Collapse multiple spaces
  t = t.replace(/\s{2,}/g, ' ');

  // 6. Capitalise first word after sentence-ending punctuation
  t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());

  // 7. Capitalise after ellipsis
  t = t.replace(/(…\s*)([a-z])/g, (_, p, c) => p + c.toUpperCase());

  return t.trim();
}

export { cleanGrammar };
