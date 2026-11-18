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
// The way a person would run the interview: start with small, concrete things
// that are easy to answer, and only reach for the big questions once the
// storyteller is talking.
//
//   tier 1  warm-ups. One clear memory, nothing to weigh up.
//   tier 2  fuller stories, still about one particular thing.
//   tier 3  looking back. Only asked after a few stories are told.
//
// `topic` lets the family switch a subject off (see SENSITIVE_TOPICS).
// `hint` is the nudge shown under the question for when someone is stuck.
const QUESTION_BANK = [
  { id: 'w_kitchen',  tier: 1, topic: 'home',     text: 'Picture the kitchen in the house where you grew up. What did it look like, and what was usually cooking?', hint: 'Start small: the table, the stove, who was standing at it.' },
  { id: 'w_games',    tier: 1, topic: 'play',     text: 'What games did you play outside as a kid, and who played with you?', hint: 'Names help: the kids on your street, a brother or sister, a dog.' },
  { id: 'w_firstjob', tier: 1, topic: 'work',     text: 'What was the first job you ever got paid for? What did it pay?', hint: 'A paper route, babysitting and farm chores all count.' },
  { id: 'w_car',      tier: 1, topic: 'travel',   text: 'Tell me about the first car you remember, yours or your family’s.', hint: 'What color was it? Where did it take you?' },
  { id: 'w_food',     tier: 1, topic: 'home',     text: 'What was your favorite thing to eat growing up, and who made it?', hint: 'Think of a birthday, a Sunday, or coming home from school.' },
  { id: 'w_school',   tier: 1, topic: 'school',   text: 'What was the name of your first school, and how did you get there each morning?', hint: 'Did you walk? Who went with you?' },
  { id: 'w_music',    tier: 1, topic: 'play',     text: 'What music did you love when you were a teenager, and where did you listen to it?', hint: 'A radio, a record player, a dance hall, a car.' },
  { id: 'w_street',   tier: 1, topic: 'home',     text: 'Describe the street you lived on as a child. Who lived next door?', hint: 'Walk out the front door in your mind and look both ways.' },
  { id: 'w_saturday', tier: 1, topic: 'play',     text: 'What did a Saturday look like when you were about ten years old?', hint: 'From waking up to supper. Chores count too.' },

  { id: 'm_friend',   tier: 2, topic: 'people',   text: 'Who was your best friend growing up? Tell me about something the two of you did together.', hint: 'One afternoon is enough. What were you up to?' },
  { id: 'm_lefthome', tier: 2, topic: 'travel',   text: 'Tell me about the day you first left home. Where were you headed?', hint: 'Who saw you off? What did you take with you?' },
  { id: 'm_met',      tier: 2, topic: 'marriage', text: 'Tell me about the day you met the person you married.', hint: 'Where were you? What did you notice first?' },
  { id: 'm_house',    tier: 2, topic: 'home',     text: 'Think of the home you lived in the longest. Walk me through it, room by room.', hint: 'Start at the front door.' },
  { id: 'm_trip',     tier: 2, topic: 'travel',   text: 'What is the best trip you ever took? Who went with you?', hint: 'How did you get there, and what do you still picture?' },
  { id: 'm_holiday',  tier: 2, topic: 'family',   text: 'Pick one holiday at your house that you remember well. What happened that day?', hint: 'Who was at the table? What was the fuss about?' },
  { id: 'm_cowork',   tier: 2, topic: 'work',     text: 'Tell me about a boss or someone you worked with that you still remember.', hint: 'What did they say or do that stuck with you?' },
  { id: 'm_ownplace', tier: 2, topic: 'home',     text: 'What was the first place you lived on your own like?', hint: 'The rent, the furniture, the neighbors.' },
  { id: 'm_made',     tier: 2, topic: 'work',     text: 'Tell me about something you built, fixed or made with your own hands.', hint: 'Who was it for? Is it still around?' },
  { id: 'm_child',    tier: 2, topic: 'family',   text: 'Tell me about a child in your life when they were small: your own, a niece or nephew, a grandchild.', hint: 'One thing they said or did that the family still talks about.' },
  { id: 'm_teacher',  tier: 2, topic: 'school',   text: 'Tell me about a teacher or a grown-up who looked out for you when you were young.', hint: 'What did they do that you still remember?' },

  { id: 'r_proud',    tier: 3, topic: 'reflect',  text: 'What is something you are proud of that people might not know about?', hint: 'It does not have to be big.' },
  { id: 'r_gone',     tier: 3, topic: 'reflect',  text: 'Is there a place that is gone now that you would like people to remember? What was there?', hint: 'A store, a farm, a ballpark, a whole street.' },
  { id: 'r_advice',   tier: 3, topic: 'reflect',  text: 'What do you know now that you wish someone had told you at twenty?', hint: 'Think of one time it would have helped.' },
  { id: 'r_know',     tier: 3, topic: 'reflect',  text: 'What would you like the people who come after you to know about your life?', hint: 'Say it the way you would say it to a grandchild.' },
];

// Subjects a family can ask the interviewer to leave alone. The keys are saved
// with the storyteller (about.avoid) and matched against question topics and,
// through `words`, against the wording of any question.
const SENSITIVE_TOPICS = [
  { key: 'service',  label: 'Military service or war',       words: /\b(army|navy|marines?|air force|coast guard|military|the service|served|war|combat|deployed|stationed|boot camp|sergeant|captain)\b/i },
  { key: 'loss',     label: 'The death of someone close',    words: /\b(died|death|passed away|funeral|late (husband|wife|son|daughter|mother|father|brother|sister))\b/i },
  { key: 'marriage', label: 'Marriage or divorce',           words: /\b(married|marriage|wedding|husband|wife|divorce|engaged|proposed)\b/i },
  { key: 'health',   label: 'Illness or hospital stays',     words: /\b(sick|illness|hospital|cancer|accident|surgery|doctor)\b/i },
  { key: 'family',   label: 'Parents, children or family',   words: /\b(mother|mom|mum|mama|father|dad|papa|brother|sister|son|daughter|children|child|family|grandmother|grandma|grandfather|grandpa)\b/i },
];

// A story that touches something painful. The interviewer does not press on
// these: no "what happened next?", no digging for detail.
const HARD_RE = /\b(died|dying|death|passed away|funeral|killed|buried|cancer|stroke|suicide|divorced?|miscarriage|abused?|lost (my|our|his|her|the baby)|wounded|shot|drowned)\b/i;

/** True when a question should not be asked for this storyteller. */
function _blocked(text, topic, about) {
  const avoid = (about && about.avoid) || [];
  if (topic && avoid.includes(topic)) return true;
  for (const t of SENSITIVE_TOPICS) {
    if (avoid.includes(t.key) && t.words.test(text)) return true;
  }
  // Anything the family typed in: plain words, separated by commas.
  const extra = String((about && about.avoidNote) || '').toLowerCase().split(/[,;\n]+/).map(w => w.trim()).filter(w => w.length > 2);
  const low = text.toLowerCase();
  return extra.some(w => low.includes(w));
}

/** Questions made from what the family said about the storyteller beforehand. */
function _personalQuestions(about) {
  const a = about || {}, out = [];
  const town = String(a.hometown || '').trim();
  const work = String(a.work || '').trim();
  const svc  = String(a.service || '').trim();
  const born = parseInt(a.born, 10);
  if (town) out.push({ id: 'p_town', tier: 1, topic: 'home', text: `You grew up in ${town}. What did your street look like when you stepped out the front door?`, hint: 'Who lived next door? Where did the kids go to play?' });
  if (born > 1900 && born < 2020) {
    const decade = Math.floor((born + 10) / 10) * 10;
    out.push({ id: 'p_decade', tier: 1, topic: 'play', text: `You were a kid in the ${decade}s. What did you do for fun back then?`, hint: 'A game, a radio or TV show, a place you went on Saturdays.' });
  }
  if (work) out.push({ id: 'p_work', tier: 2, topic: 'work', text: `I hear your work was ${work}. How did you get started in it?`, hint: 'Your first day is a good place to begin.' });
  if (svc)  out.push({ id: 'p_service', tier: 2, topic: 'service', text: `You served in the ${svc}. Where were you when you signed up, and what did your family say?`, hint: 'Only tell what you want to tell.' });
  return out;
}

const _shuffle = (list, rand) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * Line up the questions for one sitting.
 *  - First sitting: easy warm-ups, starting with anything we know about them.
 *  - Later sittings: follow-ups on the stories already told come first.
 *  - Looking-back questions wait until three stories are saved.
 *  - Nothing already answered is asked again; switched-off subjects are left out.
 *
 * @param {{stories?: object[], about?: object, rand?: () => number}} opts
 * @returns {{ text: string, hint: string, from: string, label: string }[]}
 */
function buildQuestionQueue({ stories = [], about = null, rand = Math.random } = {}) {
  const told   = stories.filter(s => (s.transcriptLines || []).length || s.question);
  const asked  = told.map(s => (s.question || '').trim().toLowerCase()).filter(Boolean);
  const fresh  = q => !asked.includes(q.text.toLowerCase()) && !_blocked(q.text + ' ' + (q.hint || ''), q.topic, about);
  const first  = told.length === 0;
  const shape  = (q, label) => ({ text: q.text, hint: q.hint || '', from: '', label });

  const personal = _personalQuestions(about).filter(fresh);
  const tier = n => _shuffle(QUESTION_BANK.filter(q => q.tier === n).filter(fresh), rand);
  const follow = first ? [] : followUpQuestions(stories, asked, about)
    .map(f => ({ ...f, hint: 'Take your time. The small details are the good part.', label: `Following up on “${f.from}”` }));

  const easyLabel = first ? 'An easy one to start' : 'Your next question';
  const queue = [
    ...follow.slice(0, 4),
    ...personal.filter(q => q.tier === 1).map(q => shape(q, easyLabel)),
    ...tier(1).map(q => shape(q, easyLabel)),
    ...personal.filter(q => q.tier === 2).map(q => shape(q, 'Your next question')),
    ...tier(2).map(q => shape(q, 'Your next question')),
    ...(told.length >= 3 ? tier(3).map(q => shape(q, 'Looking back')) : []),
    ...follow.slice(4),
  ];
  // Never hand back nothing, even if every subject was switched off.
  return queue.length ? queue : [{ text: 'Tell me about a day you would like to live over again.', hint: 'Where were you, and who was with you?', from: '', label: 'Your next question' }];
}

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
];
// (There is deliberately no follow-up for fear, illness or accidents: the
// interviewer does not go looking for painful things. See HARD_RE.)

const _SHE = /^(mother|mom|mum|mama|sister|grandmother|grandma|wife|daughter|aunt)$/;
const _HE  = /^(father|dad|papa|brother|grandfather|grandpa|husband|son|uncle)$/;
const _pronoun = who => _SHE.test(who) ? 'was she' : _HE.test(who) ? 'was he' : 'were they';

/**
 * Questions that follow on from stories already told.
 * @param {object[]} stories  saved stories (any order)
 * @param {string[]} [asked]  question texts already used, so nothing is asked twice
 * @param {object} [about]    what the family said beforehand, including subjects to leave alone
 * @returns {{ text: string, from: string }[]}  most recent story first; `from` is that story's title
 */
function followUpQuestions(stories, asked = [], about = null) {
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
    // A painful story: ask only gently about the people in it, and move on.
    const hard  = HARD_RE.test(text);
    const avoid = (about && about.avoid) || [];
    if (hard && (avoid.includes('loss') || avoid.includes('health'))) continue;

    // People: "my brother Tom" → ask about Tom.
    PEOPLE_RE.lastIndex = 0;
    const people = new Set();
    let m;
    while ((m = PEOPLE_RE.exec(text)) !== null && people.size < 2) {
      const who = m[1].toLowerCase(), name = m[2] && /^[A-Z]/.test(m[2]) && !/^(And|But|Was|Who|He|She|They|We|I)$/.test(m[2]) ? m[2] : '';
      if (people.has(who)) continue;
      people.add(who);
      if (hard) mine.push(`You talked about your ${who}${name ? ' ' + name : ''}. What is a happy memory you have of the two of you?`);
      else mine.push(name
        ? `You mentioned your ${who} ${name}. Tell me a story about the two of you.`
        : (_SHE.test(who) || _HE.test(who))
          ? `You talked about your ${who}. What ${_pronoun(who)} like, and what did the two of you do together?`
          : `You talked about your ${who}. What do you remember most about them?`);
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
      if (!hard && topics < 2 && re.test(text)) { mine.push(question); topics++; }
    }

    // And what came next, unless the story was a painful one.
    if (!hard) mine.push(`After “${title}”, what happened next?`);

    for (const q of mine) {
      const key = q.toLowerCase();
      if (done.has(key) || seen.has(key) || _blocked(q, '', about)) continue;
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
  buildQuestionQueue,
  SENSITIVE_TOPICS,
  detectPlace,
  buildOrderingQuestion,
  VoiceCapture,
  speakQuestion,
  stopSpeaking,
};
