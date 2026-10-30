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

