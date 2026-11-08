# Story Atlas Audit

**Audit date:** 2026-11-07  
**Purpose:** Actionable product, design, privacy, accessibility, and code-quality findings for the next implementation session.  
**Scope:** Repository source, current GitHub Pages implementation represented by this checkout, design artifacts, handoff notes, and verification history. No application code was changed during this audit.

## Executive summary

Story Atlas has a strong, distinctive visual identity and a thoughtful local-first recording model. The warm atlas aesthetic, large recording controls, story-first language, IndexedDB audio storage, and backup/restore work are all good foundations.

The main risk is not visual polish. The current interface promises accounts, family-only access, invitations, and password recovery even though authentication is only a local boolean and all stories remain in the same browser storage. Privacy wording also omits that browser speech recognition may send microphone audio to Google and that place searches send place text to Nominatim.

Treat the current build as a prototype. Resolve the P0 trust/privacy issues before presenting it as a secure family product.

## Verification performed

- The worktree was clean at the beginning and end of the audit.
- All 12 JavaScript modules passed `node --check`.
- No duplicate static HTML ids were found.
- No automated test/spec files were found.
- The current source after deployed commit `75cb7c1` differs only in handoff/log documentation.
- `app.js` is approximately 47 KB, `style.css` approximately 59 KB, and `index.html` contains 127 inline `style` attributes.
- A direct live browser capture was blocked by the audit environment, so this was not a Lighthouse, performance-profile, or pixel-level live-site test. Visual review used the checked-in HTML/CSS and design screenshots.

## P0: Fix before public presentation

### 1. Replace or clearly label the fake authentication flow

**Evidence**

- `js/app.js:37-41` stores only `sa_signed_in=1` in `localStorage`.
- `js/app.js:108-116` accepts any credentials; Create account performs the same operation.
- `index.html:87-112` presents email, password, Forgot password, Create account, and “Only people you invite can listen.”
- Signing out does not remove or isolate stories. Another apparent account on the same browser sees the same data.

**Recommendation for the hackathon build**

Replace the form with honest local-mode actions:

- Primary: **Continue on this device**
- Secondary: **Try the demo**
- Supporting copy: stories and recordings are stored in this browser on this device

Do not present email/password, account creation, password recovery, invitations, or “Family only” until real authentication and account-scoped storage exist.

**Acceptance criteria**

- No UI implies that credentials are verified when they are not.
- No UI implies that local data is protected from other users of the device/browser.
- The demo remains accessible without modifying real local stories.

### 2. Make privacy wording match actual behavior

**Evidence**

- `ROADMAP.md:21-22` correctly notes that Chrome live transcription can send microphone audio to Google's speech service.
- `js/recorder.js:158-199` starts Web Speech API recognition while recording.
- `js/placer.js:321-328` automatically geocodes the first detected place.
- `js/placer.js:403-406` sends the place query to Nominatim.
- `css/style.css:7` loads Google Fonts remotely.
- There is no consent step before the first recording.

**Recommendation**

- Add a plain-language consent step before first microphone use.
- State what stays local and what may leave the device.
- Require the user to confirm a detected place before sending it to Nominatim; do not auto-geocode transcript-derived text.
- Self-host fonts or use the existing serif/system fallbacks.
- Remove “Only people you invite can listen” until invitations exist.

**Acceptance criteria**

- The recording consent explains local audio storage and browser speech recognition.
- Place lookup happens only after an explicit Search/Find action.
- Privacy copy accurately lists every intentional network service.

### 3. Restore visible OpenStreetMap attribution

**Evidence**

- `js/map.js:42-48` disables attribution on the home map.
- `js/map.js:87-92` disables attribution on the listen map.
- `js/placer.js:395-400` disables the attribution control even though an attribution string is supplied to the tile layer.

OpenStreetMap requires visible attribution on browsable maps: https://www.openstreetmap.org/copyright

**Acceptance criteria**

- Every interactive OSM map visibly shows a linked “© OpenStreetMap contributors” attribution.
- Attribution remains readable on mobile and does not sit behind the bottom tab bar or listen sheet.

## P1: Functional and navigation defects

### 4. Make Home lead to the atlas hub

**Evidence**

- `js/app.js:172-180` sends the logo and desktop Home button to `signin`.
- `js/app.js:193-198` sends the mobile Home tab to `signin`.
- Navigating there hides the bottom tab bar and requires “Back to my atlas” to return.

**Recommendation**

- Logo and Home should open `home`.
- Account switching and sign-out should live in the avatar menu.
- If local mode replaces sign-in, use the entry screen only for first launch or explicit switching.

### 5. Remove or finish visible dead controls

**Evidence**

- `index.html:260-263`: Life order / By place buttons have no JavaScript handlers.
- `index.html:550`: Browse first button has no handler.
- `index.html:100`: Forgot password has no behavior.
- `js/app.js:183`, `189`, and `198`: Keepsake navigation only shows “coming soon,” despite `js/keepsake.js` existing.
- `_openEditModal()` exists at `js/app.js:522` but is never called.
- `_openSwitchMenu()` exists at `js/app.js:236` but is never called.
- `deleteStory` is imported but there is no current delete flow.

**Recommendation**

For every visible control, either implement it fully or remove it for the submission. Do not use navigation space for “coming soon” features.

### 6. Correct “recent” and “continue” story selection

**Evidence**

- `js/app.js:351-354` labels `stories[0]` as the latest story, but `_getStories()` returns life-order sorting.
- `js/app.js:393-394` labels the first three life-order stories as recent stories.

**Recommendation**

- Track `lastPlayedAt` or use `createdAt` for “Pick up where you left off.”
- Either sort the Recent stories section by creation/activity time or rename it to Life stories.

### 7. Make the demo player honest and useful

**Evidence**

- Demo stories in `js/app.js:44-50` contain transcript text but no audio.
- The listen screen still renders active play, scrubber, and skip controls.

**Recommendation**

Add small licensed/original sample audio clips, or explicitly present the demo as a transcript-only preview and disable audio controls.

### 8. Align README and verification claims with the application

**Evidence**

- README describes working Keepsake print/PDF and walking mode.
- The current navigation disables Keepsake, and `js/map.js` contains no geolocation/walking implementation.
- README says there is no authentication, while the UI presents authentication.
- README mentions photo attachments, but no current photo feature was found.

**Acceptance criteria**

- README demo steps correspond exactly to controls available in the deployed application.
- Unimplemented roadmap features are clearly labelled future work.

## P2: Accessibility, robustness, and maintainability

### 9. Improve dialog and player accessibility

- Give modals `role="dialog"`, `aria-modal="true"`, and accessible names.
- Move focus into an opened dialog, trap it while open, close on Escape, and restore focus on close.
- Make the audio scrubber a keyboard-operable range control with a useful accessible value.
- Update `aria-current` on the active bottom tab.
- Keep the generally good 48 px targets and 18 px body text, but increase 11-13 px labels where possible for the older-adult audience.

### 10. Validate restored backups before rendering them

**Evidence**

- `js/backup.js:54-72` validates only the top-level format and that `stories` is an array.
- `js/app.js:484-486` inserts `story.id` into an HTML attribute without escaping.

**Recommendation**

- Validate backup version and each story's field types, coordinate ranges, transcript shape, and id format.
- Escape attribute values or set `dataset.id` through DOM APIs.
- Reject oversized or malformed backups with a friendly error.
- If metadata saving fails after audio restoration, remove the orphaned IndexedDB audio.

### 11. Strengthen permanent story ids

`js/storage.js:141-143` uses timestamp plus `Math.random()`. Use `crypto.randomUUID()` with a safe fallback. This matters when backups from different devices are eventually merged for cloud sync.

### 12. Avoid converting every recording to base64

`js/recorder.js:140-153` converts the full recording Blob to a data URL before the app knows whether IndexedDB will fail. This duplicates large recordings in memory on phones.

Prefer passing the Blob directly to the save flow. Convert to base64 only if IndexedDB actually fails and a legacy localStorage fallback is still desired.

Also close the recording `AudioContext` after stopping to avoid accumulating audio resources across multiple recordings.

### 13. Add focused automated tests

There are currently no test/spec files. Add at least:

- storage ordering and “latest” selection tests
- backup validation and restore tests
- permanent id uniqueness/shape tests
- place-detection cases, including street numbers
- route/auth-mode tests
- one browser smoke test for local entry → name → record/review → save → place → listen → backup

The project can keep its no-build vanilla architecture; Node's built-in test runner is sufficient for pure modules.

### 14. Reduce UI implementation drift

- `js/app.js` has become a large controller containing routing, local auth, demo data, rendering, recording, and player orchestration.
- `style.css` contains old v1 rules plus appended v2 fixes and repeated desktop media queries.
- `index.html` contains 127 inline style attributes.

Recommended extraction:

- `session.js`: local/demo/account-mode state
- `router.js`: page and history navigation
- `home.js`: home rendering and sorting
- `demo.js`: sample content behavior
- component classes in CSS for repeated layout instead of inline styles

## Design review

### What is working

- The parchment/rust/sage/slate palette is warm and memorable.
- Fraunces gives the stories an editorial, keepsake quality.
- The atlas metaphor connects place, time, and family memory well.
- Recording is visually prominent and uses generous touch targets.
- Story cards, place/era chips, and the timeline form a coherent visual language.
- The design feels personal rather than like a generic dashboard.

### Recommended design changes

1. Replace the fake auth card with one honest primary action: **Continue on this device**.
2. Make Home the atlas hub and move switching/sign-out into the avatar menu.
3. Hide the fixed bottom tab bar on desktop; the top navigation is sufficient.
4. Reduce mobile navigation to implemented destinations. Do not reserve a tab for disabled Keepsake.
5. Simplify home hierarchy to: storyteller → Record → stories → map/backup. The large atlas card and three side cards currently compete for attention.
6. Give empty states a static illustration rather than loading a live world map before any story has a place.
7. Give transcript reading more visual priority than the map on the listen screen, particularly on mobile.
8. Make unavailable demo audio visibly unavailable instead of silently failing.
9. Preserve the large controls and high-contrast rust CTA, but increase the smallest labels for the target audience.
10. Show the privacy/consent explanation immediately before first microphone use, not only on the entry screen.

## Suggested implementation order

1. Reframe fake authentication as local-device entry.
2. Correct privacy copy, add first-recording consent, and stop automatic geocoding.
3. Restore OSM attribution.
4. Fix Home navigation and remove the redundant desktop tab bar.
5. Implement or hide every dead control.
6. Correct recent/continue selection and demo audio behavior.
7. Reconcile README and verification documentation.
8. Add backup validation, UUIDs, accessibility fixes, and targeted tests.
9. Consolidate app and CSS structure after behavior is stable.

