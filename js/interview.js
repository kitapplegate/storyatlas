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

import { detectPlaces } from './transcriber.js';

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

// ── Follow-up questions from earlier stories ──────────────────────────────────
// A good interviewer listens. These questions are built from what the
// storyteller has already said: the places, the people and the subjects in
// their saved stories. Everything runs in the browser; nothing is sent anywhere.
//
// watsonx integration point: swap the body of followUpQuestions() for a model
// call that is given the transcripts and returns questions in the same shape.

const PEOPLE = 'mother|mom|mum|mama|father|dad|papa|brother|sister|grandmother|grandma|grandfather|grandpa|' +
  'wife|husband|son|daughter|uncle|aunt|cousin|friend|teacher|boss|neighbor|neighbour|coach|sergeant|captain|chief';
const PEOPLE_RE = new RegExp(
  `\\bmy\\s+(?:(?:older|younger|little|big|best|late|first|oldest|youngest|baby|twin)\\s+)?(${PEOPLE})\\b(?:\\s+([A-Z][a-z]+))?`, 'gi');

// A subject heard in the story, and a question that opens it up.
const TOPICS = [
  [/\b(school|classroom|recess|grade|elementary|kindergarten)\b/i, 'What was an ordinary school day like for you back then?'],
  [/\b(job|worked|working|factory|office|shop|shift|hired|paycheck)\b/i, 'What was a normal day at that job like, from start to finish?'],
  [/\b(army|navy|marines|air force|coast guard|stationed|enlisted|boot camp|deployed|the service|the war)\b/i, 'What do you remember about your first days in the service?'],
  [/\b(married|wedding|engaged|proposed)\b/i, 'How did the two of you first meet?'],
  [/\b(house|home|farm|apartment|porch|kitchen|backyard|yard)\b/i, 'Walk me through that home. What would I see if I came in the front door?'],
  [/\b(car|truck|drove|driving|bus|train|boat|ship|plane|flew)\b/i, 'Tell me about getting from place to place in those days. What did you ride in?'],
  [/\b(game|played|playing|team|baseball|football|basketball|fishing|hunting|swimming)\b/i, 'Who did you play with, and what did you like best about it?'],
  [/\b(dinner|supper|cooked|cooking|baked|recipe|meal|ate)\b/i, 'What was on the table at a meal you still remember?'],
  [/\b(church|sunday|christmas|easter|thanksgiving|holiday|birthday)\b/i, 'How did your family spend that day when you were young?'],
  [/\b(moved|moving|left home|new town|new city)\b/i, 'What was it like on the first day in the new place?'],
  [/\b(scared|afraid|frightened|worried|trouble|accident|hospital|sick)\b/i, 'How did things turn out in the end, and who helped you through it?'],
];

const _SHE = /^(mother|mom|mum|mama|sister|grandmother|grandma|wife|daughter|aunt)$/;
const _HE  = /^(father|dad|papa|brother|grandfather|grandpa|husband|son|uncle)$/;
const _pronoun = who => _SHE.test(who) ? 'was she' : _HE.test(who) ? 'was he' : 'were they';

/**
 * Questions that follow on from stories already told.
 * @param {object[]} stories  saved stories (any order)
 * @param {string[]} [asked]  question texts already used, so nothing is asked twice
 * @returns {{ text: string, from: string }[]}  most recent story first; `from` is that story's title
 */
function followUpQuestions(stories, asked = []) {
  const done = new Set(asked.map(q => (q || '').trim().toLowerCase()));
  const seen = new Set();
  const out  = [];
  const recent = [...(stories || [])]
    .filter(s => (s.transcriptLines || []).length)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 4);

  for (const story of recent) {
    const text  = story.transcriptLines.join(' ');
    const title = story.title || 'your last story';
    const mine  = [];

    // People: "my brother Tom" → ask about Tom.
    PEOPLE_RE.lastIndex = 0;
    const people = new Set();
    let m;
    while ((m = PEOPLE_RE.exec(text)) !== null && people.size < 2) {
      const who = m[1].toLowerCase(), name = m[2] && /^[A-Z]/.test(m[2]) && !/^(And|But|Was|Who|He|She|They|We|I)$/.test(m[2]) ? m[2] : '';
      if (people.has(who)) continue;
      people.add(who);
      mine.push(name
        ? `You mentioned your ${who} ${name}. Tell me a story about the two of you.`
        : `You talked about your ${who}. What ${_pronoun(who)} like, and what did the two of you do together?`);
    }

    // The place: the pinned name is the corrected one, so prefer it.
    const pinned = story.place && story.place.label ? story.place.label.split(',')[0].trim() : '';
    const heard  = pinned ? [pinned] : detectPlaces(text).slice(0, 1).map(p => p.name);
    heard.forEach(place => {
      if (place && place !== 'Pinned on the map') mine.push(`You mentioned ${place}. What do you remember most about it?`);
    });

    // Subjects that came up.
    let topics = 0;
    for (const [re, question] of TOPICS) {
      if (topics < 2 && re.test(text)) { mine.push(question); topics++; }
    }

    // And always: what came next.
    mine.push(`After “${title}”, what happened next?`);

    for (const q of mine) {
      const key = q.toLowerCase();
      if (done.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ text: q, from: story.title || '' });
    }
  }
  return out;
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

// ── Text-to-speech ────────────────────────────────────────────────────────────
// Reads a question aloud using the browser's built-in Speech Synthesis API.
// Works offline, no library needed. Uses a slower rate and slightly lower pitch
// to be comfortable for older listeners.
let _activeSpeech = null;

function speakQuestion(text, { onStart, onEnd } = {}) {
  if (!window.speechSynthesis) return;
  // Cancel anything currently speaking first
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = 0.88;   // slightly slower than default (1.0)
  utter.pitch = 0.95;   // just a touch warmer
  utter.lang  = 'en-US';
  if (onStart) utter.onstart = onStart;
  if (onEnd)   utter.onend   = onEnd;
  _activeSpeech = utter;
  window.speechSynthesis.speak(utter);
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  _activeSpeech = null;
}

export {
  QUESTION_BANK,
  pickNextQuestion,
  pickFollowUp,
  followUpQuestions,
  detectPlace,
  buildOrderingQuestion,
  VoiceCapture,
  speakQuestion,
  stopSpeaking,
};
