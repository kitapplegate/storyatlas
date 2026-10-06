# StoryAtlas

**An AI interviewer that captures a grandparent's life stories — one small chunk at a time — and pins them to the places where they happened.**

Built for the **IBM Explore AI for Good Challenge** (deadline: December 2, 2026).

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

### 1. Voice interview → saved chunk
1. Open the app. Enter the storyteller's name when prompted.
2. The AI shows its first question.
3. Press the **🎙 microphone button**. Speak for as long or short as you like. Press **⏹** to stop.
4. The transcript appears, lightly cleaned for grammar. Press **"Save this story"**.
5. If a place name was detected, a modal offers to geocode it — type/confirm the location and press **"Find on map"**.
6. The ✅ saved banner confirms the chunk was stored.

### 2. Chronological ordering (two chunks)
1. Save a second story chunk (press **"Next question"** to get a new question).
2. After saving, the app asks exactly **one ordering question**:  
   *"Did [new story] happen before or after [previous story]?"*  
3. Press **Before** or **After** — the timeline reorders immediately.
4. Visit **Stories** to see chunks grouped by era in chronological order.

### 3. Map pin from a spoken address
1. Speak a story that mentions a place (e.g. *"I arrived in Nairobi, Kenya…"*).
2. The place-detection highlights the mention and opens the pin modal.
3. Confirm or edit the address. The app geocodes it via OpenStreetMap Nominatim (free, no key).
4. Navigate to **Map** — a pin appears at that location. Click it to read the story snippet.

### 4. Keepsake print view
1. Navigate to **Keepsake**.
2. All saved chunks appear in chronological order with place labels.
3. Press **🖨 Print / Save PDF** — headers and navigation hide automatically for a clean printout.
4. The page lists concrete services (Shutterfly, Blurb, Amazon KDP) to turn the PDF into a physical book.

### 5. Map: walking and armchair modes
- **Armchair mode** (default): browse the map, click pins to read stories.
- **Walking mode**: the app watches your GPS position; stories surface automatically when you come within 200 m of a pin.

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
- **Data stays local by default.** Everything lives in `localStorage`. No network calls except geocoding (OpenStreetMap, opt-in).

---

## Known MVP limitations

- Speech recognition accuracy depends on the browser's model (Chrome is best).
- Place detection is heuristic (capitalised proper nouns after prepositions). watsonx NER will be more accurate.
- No user authentication or multi-device sync in MVP (by design — local-first).
- Photo attachments are stored as base64 in localStorage; large photos may hit storage limits.

---

## Licence

MIT — free to use, share, and adapt.
