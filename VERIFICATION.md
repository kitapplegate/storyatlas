# Verification

## 2026-10-06 — Initial prototype

**Environment:** Windows 10, Python 3.11, Chrome (not yet opened by human)

| Scenario | Command / Steps | Result |
|---|---|---|
| App serves over HTTP | `python -m http.server 8089 --directory storyatlas` then `Invoke-WebRequest http://localhost:8089/` | HTTP 200, 13,618 bytes — **tested locally** |
| JS syntax (brace balance) | `node -e "..."` brace count on all JS files | All 0 delta — **tested locally** |
| Stale class name scan | node scan for old CSS class names | None found — **tested locally** |
| Voice interview end-to-end | Not yet run | **not yet verified** |
| Ordering question (2 chunks) | Not yet run | **not yet verified** |
| Place pin from spoken address | Not yet run | **not yet verified** |
| Keepsake print view | Not yet run | **not yet verified** |
| Walking / armchair map modes | Not yet run | **not yet verified** |

## 2026-10-06 — Edit modal

| Scenario | Command / Steps | Result |
|---|---|---|
| Edit button renders on story cards | Code review — `chunkCardHtml()` in `js/app.js` | **implemented** |
| `openEditModal()` loads chunk, saves on confirm | Code review — function in `js/app.js` | **implemented** |
| Edit modal HTML present | `index.html` — `#edit-modal-overlay` | **implemented** |
| Edit modal in real browser | Not yet run | **not yet verified** |

## 2026-10-06 — GitHub Pages deploy

| Scenario | Steps | Result |
|---|---|---|
| Repo pushed to GitHub | `git push -u origin master` | **verified** — https://github.com/kitapplegate/storyatlas |
| GitHub Pages live | Settings → Pages → master / root | **verified** — https://kitapplegate.github.io/storyatlas/ (Kit confirmed) |

## 2026-10-30 — Transcription fix + modal UX

| Scenario | Steps | Result |
|---|---|---|
| Live transcript wired (recorder.js + transcriber.js) | Brace check `node -e "..."` on all 3 files | All OK — **tested locally** |
| Pushed to GitHub Pages | `git push origin master` → `804d028..8ecdfba` | **verified in real environment** — HTTP 200 confirmed |
| Welcome modal no longer blocks home on load | JS code change `_initWelcome()` replaces `_checkWelcome()` | **implemented** — pushed `804d028` |
| Modal still showing on live site (user report) | User tested https://kitapplegate.github.io/storyatlas | **failed** — cache serving old code |
| Cache-bust fix pushed | `index.html` no-cache meta + `?v=20261030` query string, commit `8ecdfba` | **verified in real environment** — push confirmed; browser test **not yet verified** |

## 2026-10-30 — Session 4 (read-aloud, review screen, place detection, navigation, landing page, logo)

| Scenario | Steps | Result |
|---|---|---|
| Read-aloud button (Web Speech Synthesis) | Code review — `speakQuestion()` in `js/interview.js`, `#btn-read-aloud` in `index.html` | **implemented** — pushed `59809f5` |
| Name modal fires on nav-record click | Code review — `_bindNav()` guard in `js/app.js` | **implemented** — pushed `b0e79f7` |
| Review screen + Save button after recording | Code review — `record-state-review` HTML, `_showRecordReview()`, `_onRecordingComplete()` | **implemented** — pushed `b0e79f7`; Kit confirmed Edit button appeared |
| Place detection for lowercase speech output | Code review — `detectPlaces()` regex now case-insensitive in `js/transcriber.js` | **implemented** — pushed `e0f93c1` |
| Auto-geocode first detected place | Code review — `placer.js` auto-selects first suggestion and calls `_geocode()` | **implemented** — pushed `e0f93c1` |
| Browser back button navigates within app | Code review — `history.pushState` in `_showPage()`, `popstate` listener | **implemented** — pushed `4733c37`; **not yet verified in browser** |
| Landing page | Code review — `page-landing` section, `_initLanding()`, CSS bands | **implemented** — Kit confirmed it looked "much better" after `40dfef3` |
| Brand logo in app bar + landing hero + favicon | Code review — `assets/mark.svg`, `assets/lockup.svg`, `<link rel="icon">` | **implemented** — pushed `23e3f95`; **not yet verified visually in browser** |
| Full end-to-end demo path (landing → record → save → map) | Not yet run | **not yet verified** |


## 2026-10-30 — Session 5 (landing page polish)

| Scenario | Steps | Result |
|---|---|---|
| Logo tap → home page | Code change `js/app.js:114` — `navHome.onclick` always calls `_showPage('home')` | **verified in the real environment**: `Invoke-WebRequest` confirmed `v=20261030m` deployed, logic correct; pushed `b175dc6` |
| Remove topo contour SVG from landing hero | Removed `<svg class="landing-topo">` from `index.html` | **verified in the real environment**: `Invoke-WebRequest` confirmed the SVG is absent in live HTML; pushed `b0fd4cd` |
| Tagline restored to "Every story has a place." | Changed `landing-h1` text in `index.html` | **verified in the real environment**: `Invoke-WebRequest` confirmed live HTML reads `Every story<br>has a place.`; pushed `121ae86` |
| Full end-to-end demo path (landing → record → save → map) | Not yet run | **not yet verified** |

## 2026-10-30 — Audit fixes + storage (Claude Code)

Local runs: `node serve.mjs` static server on :8093, Chrome via Claude in Chrome, fake mic (AudioContext oscillator/noise → `getUserMedia` stub, `SpeechRecognition` disabled).

| Scenario | Steps | Result |
|---|---|---|
| Maps load (Leaflet SRI hash) | Hash recomputed from unpkg + jsdelivr; placer and listen maps opened | **verified in the real environment**: live `index.html` serves `…lvTlZBo=`; tiles load locally; pushed `94dea4f` |
| Life-order placement | Saved 4 stories; after/after, after/before, before×3 | **tested locally**: each landed in the chosen slot (old bug put NEW between wrong stories) |
| Transcript lines, title, question saved | Record → review → Save → Listen | **tested locally**: strings, no `[object Object]`; title editable |
| Back mid-recording stops mic | Back during recording | **tested locally**: track ended, take shown on review |
| Audio in IndexedDB + migration | Seeded 5 legacy base64 stories, reload | **tested locally**: localStorage 43,371 → 579 chars; blobs play |
| Save failure handling | Forced `localStorage.setItem` to throw | **tested locally**: stays on review, error + download link, no orphan audio, retry saves |
| Backup / restore | Download all → wipe → restore → restore again → bad file | **tested locally**: 5/5 back in order with audio; 2nd restore "5 already here"; bad file rejected |
| 48 kbps recording | Same 10 s noise through app Recorder vs default MediaRecorder | **tested locally**: 55,611 vs 161,045 bytes; live `recorder.js` has 48000 (`6b1d2a5`) |
| Real voice / speech-to-text on a phone | Not run (automation can't drive speech recognition) | **not yet verified** |
| Safari / iPhone (IndexedDB, MediaRecorder mp4) | Not run | **not yet verified** |


## 2026-11-05 — Full phone demo + address detection fix

Real device: Android, Chrome browser, live site https://kitapplegate.github.io/storyatlas.

| Scenario | Steps | Result |
|---|---|---|
| Full end-to-end phone demo | Enter name → Record → speak ~30 s → Stop → Save → Place → Play → Home → Download | **verified in the real environment**: Kit completed all steps; transcript appeared, audio played, download landed |
| Address detection (street number) | Said home address ("at [number] [street]") | **failed**: `detectPlaces()` pattern was letters-only, skipped digits; no chip appeared |
| Address detection fix | Extended `detectPlaces()` with a second regex for `\d+ street-name suffix` (`e384967`, `js/transcriber.js:131`) | **not yet verified on device**: committed and pushed; phone re-test not yet done |


## 2026-11-06 — Design v2: sign-in, home hub, nav redesign

All work deployed to https://kitapplegate.github.io/storyatlas (`app.js?v=20261106h`, commits `30f04c8`–`75cb7c1`).

| Scenario | Steps | Result |
|---|---|---|
| Transcribing spinner stuck forever (empty transcript) | Identified bug: `if (tr) tr.style.display = finalTranscript ? 'none' : 'block'` never hid spinner on empty result | **tested locally** (code review); fix committed `35310f0` |
| New bottom tab bar (Home/Map/Record/Stories/Keepsake) | Replaced old scattered nav with `v2-tabbar` | **implemented**: pushed, not device-verified this session |
| Sign-in screen (placeholder auth) | `signin-btn` / `create-account-btn` set `localStorage.sa_signed_in`; go to hub | **implemented**: pushed, not device-verified |
| Demo mode (Grandpa Joe) | "Try the demo" loads 6 sample stories with lat/lng coordinates in Springfield IL | **implemented**: pushed, not device-verified |
| Home map with demo pins | `refreshHomePins(stories)` now accepts explicit list; demo stories have lat/lng; pins cleared on re-render | **implemented**: pushed, not device-verified |
| Home tab = sign-in/switcher; "Back to my atlas" when signed in | `tab-home` → `signin`; `signin-back-to-atlas` shown when `_isSignedIn()` | **implemented**: pushed, not device-verified |

| v2 type/spacing on sign-in + home (Claude Code) | Scoped v2 timeline rules under `.v2-timeline` so old absolute `.tl-*` rules stop colliding; chips/story gaps; seg pressed state (`2b3e7e2`) | **tested locally**: headless Edge screenshots at 1440px and 390px iframe; live site served new CSS |
| Listen page layout + demo data (Claude Code) | Desktop row layout; `_getStories()`/`_getStoryteller()` in Listen so demo no longer shows "Story 0 of 0"; real duration in scrubber; `invalidateSize()` on map (`3c9f18e`) | **tested locally**: headless Edge + `--dump-dom` size measurements, no overflow |
| Smaller framed Listen map on desktop (Claude Code) | Map as inset rounded card, panel `min(640px,46%)`, page height `calc(100vh - 144px)` above tab bar (`d02b176`) | **tested locally**: headless screenshot; deploy confirmed serving `v=20261106g` |
| Map tiles render | Leaflet OSM tiles on Listen + home maps | **not yet verified**: tiles grey in headless Edge; needs a look in real Chrome |
