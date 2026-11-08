# StoryAtlas

**An AI interviewer that captures a grandparent's life stories — one small chunk at a time — and pins them to the places where they happened.**

Built for the **IBM Explore AI for Good Challenge** (deadline: December 2, 2026).

---

> ### 🤖 Built with IBM Bob
> **Every file in this project was designed, scaffolded, and iterated using IBM Bob as the primary development tool.**
> The question bank, grammar cleanup prompt, watsonx.ai integration stubs, UI design system, and this README were all produced through IBM Bob conversations. See [`BOB_USAGE.md`](BOB_USAGE.md) for the full record of what Bob built and where those integration points live in the code.

---

## Quick start (local, zero install)

```bash
# 1. Clone or download this folder
# 2. Serve it over HTTP (required for ES modules + microphone API)

# Option A — Python (built into macOS/Linux, available on Windows)
cd storyatlas
python -m http.server 8080
# then open http://localhost:8080

# Option B — Node (if you have it)
npx serve storyatlas

# Option C — VS Code
# Install the "Live Server" extension, right-click index.html → Open with Live Server
```

> **Do not open `index.html` directly as a `file://` URL** — the browser will block microphone access and ES module imports.

**Browser requirement:** Chrome or Edge for voice input (Web Speech API).  
Safari and Firefox do not support `SpeechRecognition` — a typed-input fallback is shown automatically.

---

## Demo path (acceptance criteria walkthrough)

### 1. Entry screen
1. Open the app. Press **"Continue on this device"** to start.
2. Enter the storyteller's name when prompted (or skip and add it later).

### 2. Voice interview → saved story
1. Press the **🎙 Record a story** button.
2. The first time you record, you'll see a one-time privacy notice explaining local storage and browser speech recognition. Press **"I understand"** to proceed.
3. A question is shown to start. Press the **🎙 microphone button**, speak, then press **⏹** to stop.
4. The transcript appears. Edit the title if needed. Press **"Save this story"**.

### 3. Chronological ordering (two stories)
1. Save a second story. After saving, the placer asks **"When did this happen?"**.
2. Press **Before** or **After** to slot it against an existing story in life order.
3. Visit **Stories** to see everything in life order.

### 4. Map pin from a spoken place
1. Speak a story that mentions a place (e.g. *"I grew up on Elm Street…"*).
2. After saving, the placer shows **"Where did this happen?"** with any detected place names.
3. Tap a suggested place name (or type one) then press **Search** — confirm the pin and press **"Confirm place"**.
4. Navigate to **Map** — a pin appears at that location.

### 5. Try the demo
Press **"Try the demo"** on the entry screen to explore a sample atlas with pre-written stories.
The demo is read-only — audio controls are visibly disabled (transcript-only preview).

### 6. Backup and restore
Press **"Download all"** on the home screen to save a copy of all stories.
Press **"Restore"** to load a backup on any device.

---

## Project structure

```
storyatlas/
├── index.html          ← single-page app shell, all pages in-DOM
├── css/
│   └── style.css       ← all styles, including print rules
└── js/
    ├── app.js          ← main controller (wires all modules)
    ├── interview.js    ← question bank, voice capture, ordering question
    ├── grammar.js      ← cleanup rules + IBM Bob/watsonx hook
    ├── storage.js      ← localStorage CRUD, chunk ordering
    ├── map.js          ← Leaflet, Nominatim geocoding, walking mode
    └── keepsake.js     ← print-ready renderer
```

**Dependencies (all CDN, no install):**
| Library | Version | Purpose |
|---|---|---|
| [Leaflet](https://leafletjs.com) | 1.9.4 | Interactive map |
| OpenStreetMap Nominatim | — | Geocoding (free, no key) |
| Web Speech API | browser built-in | Voice-to-text |

---

## IBM Bob — where it was used in this build

This project was built using **IBM Bob** as the primary development tool for the IBM Explore AI for Good Challenge.

| What | Where | Bob's role |
|---|---|---|
| Full app scaffold | All files | Bob generated all source files from the product spec in a single session |
| Question bank design | `interview.js` — `QUESTION_BANK` | Bob crafted open-ended, life-spanning questions suited to a storyteller in their 80s with varied career and international experience |
| Grammar cleanup prompt | `grammar.js` — header comment | Bob wrote the watsonx.ai prompt template (copyeditor, not ghostwriter) that replaces `cleanWithRules()` when the IBM trial is active |
| watsonx integration stubs | `grammar.js`, `interview.js` | Bob marked every integration point with a clearly labelled comment block so the handoff to watsonx APIs needs only internal swaps, no structural changes |
| Keepsake renderer | `keepsake.js` | Bob designed the print layout and suggested the book-printing partners |
| README | This file | Bob authored the README including the demo path and IBM Bob attribution section |

### Upgrading to IBM watsonx.ai (after trial activation)

The MVP uses rule-based grammar cleanup and a static question bank. When your IBM Bob trial is active:

**1. Grammar cleanup → watsonx.ai (Granite)**

In [`grammar.js`](js/grammar.js), replace `cleanWithRules(text)` with:

```js
// watsonx.ai endpoint (ibm/granite-13b-chat-v2 or granite-3-8b-instruct)
async function cleanWithWatsonx(text) {
  const res = await fetch('https://us-south.ml.cloud.ibm.com/ml/v1/text/generation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WATSONX_API_KEY}`,
    },
    body: JSON.stringify({
      model_id: 'ibm/granite-13b-chat-v2',
      input: `<|system|>You are a copyeditor, not a ghostwriter. Fix grammar and transcription errors only. Never change word choices, facts, or voice. Return only the corrected text.<|user|>${text}<|assistant|>`,
      parameters: { max_new_tokens: 500, temperature: 0.1 },
      project_id: WATSONX_PROJECT_ID,
    }),
  });
  const data = await res.json();
  return data.results?.[0]?.generated_text?.trim() || text;
}
```

**2. Dynamic questions → watsonx.ai**

In [`interview.js`](js/interview.js), replace `pickNextQuestion()` with a call that passes the last 3 chunk summaries as context. Bob can scaffold this — it's a single prompt-and-parse function.

---

## Design principles (enforced throughout)

- **The AI serves the story; it never steers it.** Questions are open-ended and non-leading.
- **Voice-first.** The mic is the primary input; typing is always a fallback, never a requirement.
- **One ordering question per session, never mid-story.**
- **Human agency.** The AI never declares a story finished. `complete: false` by default — only a family member can set it to `true`.
- **Data stays local for the hackathon.** Story text lives in `localStorage` and audio in IndexedDB, on the device that recorded it. Families keep an off-device copy with "Download all stories". Cloud sync and family sharing are the production plan — see [`ROADMAP.md`](ROADMAP.md).

---

## Known MVP limitations

- Speech recognition accuracy depends on the browser's model (Chrome is best).
- Place detection is heuristic (capitalised proper nouns after prepositions). watsonx NER will be more accurate.
- Stories are stored locally — no user accounts, no multi-device sync. The production plan is in [`ROADMAP.md`](ROADMAP.md).
- **Keepsake book** (print/PDF) and **walking mode** (GPS-triggered stories) are planned features — not in this build.

---

## Licence

MIT — free to use, share, and adapt.
