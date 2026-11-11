# Verification

## 2026-11-10 — Landing page, profiles, About page, boot guard (commits eaa49e4..58f7113)

**Environment:** Node.js local; in-app browser against `http://localhost:8080` (a server already running on that port) and the live GitHub Pages site. No real microphone used.

### Tests run

```
node --test test/storage.test.js      -> 48 pass, 0 fail
node --check js/<module>.js           -> all OK
```
Throwaway script with a fake `localStorage` (not in the repo): legacy atlas adopted as first profile, profiles keep separate stories, sign-out clears the active profile.

### Observed in a browser (localhost)

- Landing page: profile picker, add profile, demo; no "Continue on this device".
- Add profile signs in; second profile gets a separate atlas; picking a profile opens the right one.
- Logo returns to landing from Home and Stories; Switch and Sign out go to landing.
- Without a profile or demo, Home/Stories tabs bounce to landing.
- Top-bar "About Story Atlas & privacy" opens About from landing and Home; Back returns to the origin page.
- About page: one copy of each section; avatar and tab bar hidden when signed out, shown in demo.
- Audio store: 3 MB blob saved to IndexedDB, survived a reload, deleted cleanly. `navigator.storage.persisted()` was false in the test browser.
- Boot guard: a missing-export module failure does raise a window `error` event; guard stays idle on a normal boot and on errors after boot.

### Observed on the live site

- Fresh load of https://kitapplegate.github.io/storyatlas shows the landing page; each deploy confirmed by fetching the page for its `app.js?v=` stamp (last: `20261110e`).

### Not yet verified

- Record → transcript → place → listen with a real microphone (never run in any session).
- The boot guard's automatic re-fetch-and-reload path end to end (could not recreate a stale cache on demand).
- Restoring a large backup file (limit raised 50 MB → 500 MB, untested with a real file).
- Top-bar About link at phone width; Firefox and Safari.
- Everything still listed under 2026-11-08 below except the entry screen, which changed.

---

## 2026-11-08 — Audit fixes (commit 7694210)

**Environment:** Node.js (local), no live browser run this session.

### Tests run

```
node --test storyatlas/test/storage.test.js
```
**Result:** 48 tests, 48 pass, 0 fail. Suites: generateId, formatDuration, assignEra, story ordering, validateStory, detectPlaces, splitIntoLines.

### JS syntax check

```
node --check storyatlas/js/<module>.js  (all 12 modules)
```
**Result:** All 12 OK — app.js, audiostore.js, backup.js, grammar.js, interview.js, keepsake.js, map.js, placer.js, player.js, recorder.js, storage.js, transcriber.js.

### Not yet verified in a browser

- Entry screen shows "Continue on this device" (no email/password)
- First Record tap triggers consent modal
- Placer step 2 does not auto-geocode on load
- OSM attribution visible on home map, listen map, placer map, empty-state map
- Demo player controls are visibly disabled with "Transcript preview" note
- Edit story modal opens, saves, and deletes correctly
- Seg sort buttons (Recent first / By place) update the home story list
- `_openModal` focus trap works on keyboard navigation
- `aria-current` on active tab is announced by screen reader

---

## Prior sessions

(No prior VERIFICATION.md existed — this is the first entry.)
