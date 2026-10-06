/**
 * StoryAtlas — AI Interviewer
 *
 * Manages the question queue, voice capture (Web Speech API),
 * the single ordering question per session, and place detection.
 *
 * IBM Bob / watsonx integration point:
 * The question selection logic (pickNextQuestion / detectPlace) can be
 * replaced with calls to watsonx.ai for:
 *   - Dynamic follow-up questions based on prior answers (context-aware).
 *   - More reliable place NER (named entity recognition).
 * Function signatures stay identical — swap the internals only.
 */

// ── Question bank ─────────────────────────────────────────────────────────────
// Open-ended, non-leading questions spanning a full life.
const QUESTION_BANK = [
  { id: 'q_start',     era: 'Childhood',  text: "Tell me about the town or neighbourhood you grew up in — what did the streets look like when you stepped outside as a child?" },
  { id: 'q_earliest',  era: 'Childhood',  text: "What's the earliest memory you can picture clearly? Take me back to that moment." },
  { id: 'q_place0',    era: 'Childhood',  text: "What did the place you grew up look like? What did it smell like?" },
  { id: 'q_school',    era: 'Childhood',  text: "Tell me about a teacher or a person who shaped you when you were young." },
  { id: 'q_turning',   era: 'Young Life', text: "Was there a moment when you felt your life take a new direction? What happened?" },
  { id: 'q_work1',     era: 'Work',       text: "What drew you to your field of work? Was there a particular moment you knew?" },
  { id: 'q_abroad',    era: 'Work',       text: "Tell me about arriving somewhere new — a country or city — for the very first time." },
  { id: 'q_challenge', era: 'Work',       text: "What's a challenge you faced that you're proud of having got through?" },
  { id: 'q_people',    era: 'People',     text: "Who is someone you met along the way who you still think about?" },
  { id: 'q_family1',   era: 'Family',     text: "Tell me about a moment with your family that you want to make sure is remembered." },
  { id: 'q_place1',    era: 'Place',      text: "Is there a place in the world that feels like it belongs to you? Tell me about it." },
  { id: 'q_surprise',  era: 'Reflection', text: "What surprised you about the way your life turned out?" },
  { id: 'q_advice',    era: 'Reflection', text: "What do you know now that you wish someone had told you when you were starting out?" },
  { id: 'q_object',    era: 'Memory',     text: "Is there an object you own that carries a story? Tell me about it." },
  { id: 'q_free',      era: 'Open',       text: "Is there something you've wanted to say that no one has ever quite asked about?" },
];

const FOLLOW_UP_PROMPTS = [
  "What did it feel like in that moment?",
  "Who else was there?",
  "How did that change things for you?",
  "What happened next?",
  "What would you want your family to understand about that time?",
];

// ── Place detection ───────────────────────────────────────────────────────────
const PLACE_PATTERNS = [
  /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /\bat\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /\bnear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
  /\b([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)+)/g,
];

function detectPlace(text) {
  for (const re of PLACE_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) return m[1] || m[0];
  }
  return null;
}

// ── Question selection ────────────────────────────────────────────────────────
function pickNextQuestion(answeredIds = []) {
  const unanswered = QUESTION_BANK.filter(q => !answeredIds.includes(q.id));
  return unanswered[0] || QUESTION_BANK[QUESTION_BANK.length - 1];
}

function pickFollowUp() {
  return FOLLOW_UP_PROMPTS[Math.floor(Math.random() * FOLLOW_UP_PROMPTS.length)];
}

// ── Ordering question ─────────────────────────────────────────────────────────
function buildOrderingQuestion(newChunk, existingChunks) {
  if (!existingChunks || existingChunks.length === 0) return null;
  const ref = existingChunks[existingChunks.length - 1];
  const refTitle = ref.title || 'the previous story';
  return {
    question: `Just one quick question: did "${newChunk.title || 'this story'}" happen before or after "${refTitle}"?`,
    refId: ref.id,
    choices: ['Before', 'After'],
  };
}

// ── Web Speech API wrapper ────────────────────────────────────────────────────
class VoiceCapture {
  constructor({ onPartial, onEnd, onError }) {
    this.onPartial = onPartial;
    this.onEnd     = onEnd;
    this.onError   = onError;
    this.recognition = null;
    this.listening = false;
    this._final = '';
  }

  get supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start() {
    if (!this.supported) {
      this.onError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this._final = '';

    this.recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + ' ';
        else interim += t;
      }
      if (final) this._final += final;
      this.onPartial(this._final + interim);
    };

    this.recognition.onerror = (e) => {
      const msg = e.error === 'not-allowed'
        ? 'Microphone access was denied. Please allow microphone access and try again.'
        : `Speech recognition error: ${e.error}`;
      this.onError(msg);
    };

    this.recognition.onend = () => {
      this.listening = false;
      this.onEnd(this._final.trim());
    };

    this.recognition.start();
    this.listening = true;
  }

  stop() {
    if (this.recognition && this.listening) this.recognition.stop();
  }
}

export {
  QUESTION_BANK,
  pickNextQuestion,
  pickFollowUp,
  detectPlace,
  buildOrderingQuestion,
  VoiceCapture,
};
