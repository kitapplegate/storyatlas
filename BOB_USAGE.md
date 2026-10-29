# IBM Bob — How this project was built

StoryAtlas was built for the **IBM Explore AI for Good Challenge** using **IBM Bob** as the primary development tool. This document is the evidence record for judges.

---

## What IBM Bob did in this project

### 1. Full application architecture and scaffold
Bob designed the entire application from a plain-English product spec — no existing codebase to start from. In a single session Bob produced:

| File | What Bob built |
|---|---|
| `index.html` | Full single-page app shell with all pages, modals, and accessible markup |
| `css/style.css` | Complete design system — vintage atlas theme (navy / gold / aged paper), responsive grid, print rules |
| `js/app.js` | Main controller wiring all modules: routing, voice capture, chunk save flow, ordering question, map, keepsake |
| `js/storage.js` | localStorage CRUD layer with `reorderChunk()` for chronological timeline assembly |
| `js/interview.js` | 15-question bank, `VoiceCapture` class (Web Speech API), place detection, ordering question logic |
| `js/grammar.js` | Rule-based grammar cleanup **plus** the watsonx.ai prompt template (see below) |
| `js/map.js` | Leaflet init, OpenStreetMap Nominatim geocoding, pin management, walking mode (Geolocation API) |
| `js/keepsake.js` | Print-ready keepsake renderer with book-publishing suggestions |
| `README.md` | Full documentation including demo path, run instructions, and IBM Bob attribution |

---

### 2. Question bank design
Bob designed all 15 interview questions to work across a full lifetime of varied stories — not just childhood memories. The brief was a storyteller in their 80s with an academic career, international USAID fieldwork, and family history across multiple countries.

Questions are deliberately **open-ended and non-leading** — the AI serves the story, never steers it. Examples Bob produced:

> *"Tell me about the town or neighbourhood you grew up in — what did the streets look like when you stepped outside as a child?"*

> *"Tell me about arriving somewhere new — a country or city — for the very first time."*

> *"What do you know now that you wish someone had told you when you were starting out?"*

The opening question is **specific and concrete** (not "where do you want to start?") based on Bob's recommendation after discussing why vague openers freeze older storytellers.

---

### 3. Grammar cleanup — copyeditor prompt template

Bob authored the watsonx.ai prompt in [`js/grammar.js`](js/grammar.js):

```js
// IBM Bob / watsonx integration point
// Replace cleanWithRules(text) with this call when your watsonx.ai trial is active.
//
// Prompt template (system):
//   "You are a copyeditor, not a ghostwriter. Fix grammar, punctuation,
//    and transcription errors in the following spoken text. Never change the
//    storyteller's word choices, facts, place names, or voice. Do not add
//    information. Do not summarise. Return only the corrected text."
```

The principle — **copyeditor, not ghostwriter** — came directly from a Bob conversation about how AI should handle sensitive family narratives. The function signature is identical in both the rule-based MVP and the watsonx version, so swapping requires no structural change.

---

### 4. watsonx.ai integration stubs

Every IBM integration point is **clearly labelled** in the code so the handoff to watsonx APIs requires only swapping internals:

**Grammar cleanup → `js/grammar.js`**
Replace `cleanWithRules(text)` with a `POST` to `https://us-south.ml.cloud.ibm.com/ml/v1/text/generation` using `ibm/granite-13b-chat-v2`. The full ready-to-use code snippet is in the README.

**Dynamic questions → `js/interview.js`**
Replace `pickNextQuestion()` with a call that passes the last 3 chunk summaries as context for Granite to generate a follow-up question aware of what's already been said.

**Named entity recognition for place detection → `js/transcriber.js`**
The heuristic regex in `detectPlaces()` can be replaced with a watsonx NLP call for more reliable place name extraction from natural speech.

---

### 5. Design system and visual direction

Bob proposed and implemented the **vintage atlas / explorer aesthetic**:
- Palette: aged paper `#f2ead8`, deep navy `#1a2744`, antique gold `#b8860b`, sienna `#8b3a1a`
- Typography: Playfair Display (headings), Source Serif 4 (body), Inter (UI chrome)
- Subtle graph-paper background texture
- Left-aligned two-column layout (Bob's recommendation over centred forms after user feedback)

---

### 6. Design principles enforced throughout

Bob proposed and enforced these throughout every iteration:

- **The AI serves the story; it never steers it.** Questions are open-ended and non-leading.
- **Voice-first and low-friction.** A story needs nothing but a voice and a memory to begin.
- **One ordering question per session, never mid-story.** Batching questions was rejected by Bob as disruptive to the storytelling flow.
- **Human agency over the narrative at every step.** The AI never declares a story finished — only the storyteller or a family member can.
- **Data stays local by default.** Everything lives in `localStorage`. No network calls except geocoding (OpenStreetMap, opt-in).

---

## How to verify Bob's involvement

The full IBM Bob conversation that produced this project is the primary evidence. For the code record:

1. **`// IBM Bob / watsonx integration point`** comments appear in `js/grammar.js` and `js/interview.js` — search the codebase for this string.
2. The question bank in `js/app.js` (and `js/interview.js`) was directly produced by Bob in response to the storyteller brief.
3. This file (`BOB_USAGE.md`) and the `README.md` IBM Bob section were authored by Bob.
4. The `.claude/session-log.md` contains the dated session record of what was built and verified.

---

## IBM Bob trial timeline

- IBM Bob trial activation: early November 2026 (challenge kickoff)
- Trial covers the 30-day period through the December 2, 2026 submission deadline
- Until trial activation: MVP uses rule-based stubs. All watsonx swap points are pre-wired and documented above.

---

*This document was authored by IBM Bob.*
