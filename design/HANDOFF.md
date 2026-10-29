# Story Atlas: Design v1 handoff for IBM Bob

**This is a restyle only.** Keep all current behavior exactly as it is: local-first recording, the upload and transcript retry flows, roles and privacy, and the data model. Change the look, layout and copy placement only. Don't change any recording, storage or sync logic. If a design detail would need new behavior (for example the question prompts, the place-in-time flow or the map), build it as the SPEC step it maps to, not as part of this restyle.

Visual references (2x PNGs, CSS pixels = PNG pixels / 2):

| File | What it shows |
|---|---|
| `screens/01-home.png` | Atlas home (390x844) |
| `screens/02-record.png` | Record: 2a ready, 2b recording |
| `screens/03-place-in-time.png` | Place in time (before/after) |
| `screens/04-place-on-map.png` | Place on map |
| `screens/05-listen-mobile.png` | Listen, mobile |
| `screens/05-listen-desktop.png` | Listen, desktop 1440x900 |
| `screens/06-states.png` | Pending upload, transcribing, failed, done, empty |
| `screens/07-tokens.png` | Tokens and component sheet |
| `overview.png` | Everything on one sheet |
| `html/*.html` + `html/style.css` | Static reference markup. **Read it for measurements only. Don't copy it into the app.** |

## 1. Goals

- Make it feel like a warm heirloom atlas: calm, legible and not kitschy. Paper, ink, rust, and a muted map palette.
- Design for older readers and for a helper sitting beside them: base 18px type, 48px+ tap targets, one main action per screen, plain words.
- Keep place and time in view all the time: every story shows a place chip and era, and the timeline strip and map appear on home and in Listen.
- Make it clear that recordings are safe. Always show the save state in calm sage, ochre or rust tints, never alarm red.

## 2. Tokens (Tailwind `theme.extend`)

```js
// tailwind.config: theme.extend
colors: {
  parchment: { DEFAULT: '#f6f1e7', deep: '#ece4d3' },
  paper: '#fbf8f1',
  line: '#e0d5c1',
  ink: { DEFAULT: '#2b2622', soft: '#5f564d' },
  rust: { DEFAULT: '#a4502c', dark: '#86401f', tint: '#f3e3d6' },
  sage: { DEFAULT: '#7d8f6a', deep: '#4c5e43', tint: '#e2e7d6' },
  slate: { DEFAULT: '#56697a', deep: '#3f5162', tint: '#dde4e8' },
  ochre: { DEFAULT: '#b5893a', tint: '#f3e8cf', text: '#6e5320' },
  topo: '#cbbd9f',      // decorative contour lines only
  record: '#c2412d',    // live recording dot only
},
fontFamily: {
  serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
  sans: ['var(--font-source-sans)', 'system-ui', 'sans-serif'],
},
fontSize: {
  base: ['18px', '28px'],
},
borderRadius: {
  sm: '8px', md: '12px', btn: '14px', lg: '16px', xl: '24px',
},
boxShadow: {
  card: '0 1px 2px rgba(43,38,34,.06), 0 6px 18px rgba(43,38,34,.07)',
  float: '0 2px 6px rgba(43,38,34,.10), 0 12px 32px rgba(43,38,34,.14)',
  record: '0 10px 30px rgba(164,80,44,.35)',
},
```

**next/font setup notes.** In the root layout, load `Fraunces` (subsets latin, `axes: ['opsz']`, weights 400/500/600, plus italic 400) and `Source_Sans_3` (weights 400/500/600/700) from `next/font/google`. Set `variable: '--font-fraunces'` and `variable: '--font-source-sans'` and `display: 'swap'`, then put both variable classes on `<html>`. The body uses `font-sans text-base text-ink bg-parchment`. This fixes the current problem where `font-serif` falls back to the browser default because no font is loaded.

**Paper feel.** Add a very faint noise over parchment (an inline SVG `feTurbulence` at about 7% alpha as a background image, see `.paper-bg` in `html/style.css`) and an optional topo-line SVG in the home header at about 50% opacity. Both are decoration only, so mark them `aria-hidden`.

### Contrast (checked)
ink on parchment 13.3:1 · ink-soft 6.4:1 · rust 5.0:1 (white text on rust also passes) · slate 5.0:1 · slate-deep 7.3:1 · sage-deep 6.2:1 · rust-dark 6.7:1. `topo`, `line` and the `-tint` colors are backgrounds only, so always put ink or the matching `-deep`/`-dark` text on them.

## 3. Type scale

| Token | Font | Size / line | Use |
|---|---|---|---|
| display | Fraunces 500 | 40/44 | Desktop hero, token sheet |
| h1 | Fraunces 500 | 32/38 (30 on step screens) | Storyteller name, step questions |
| h2 | Fraunces 500 | 26/32 | Section titles, question card, story title in Listen |
| h3 | Fraunces 500 | 21/27 | Story card titles |
| read | Fraunces 400 | 20/32 (19 on mobile Listen) | Transcripts |
| body | Source Sans 3 400 | 18/28 | Default text |
| label | Source Sans 3 600 | 16/22 | Form labels, card headers |
| caption | Source Sans 3 500 | 15/20 | Meta (duration, counts). Minimum size for any text |
| overline | Source Sans 3 700 caps, +0.09em | 13/16 | Short labels only ("STORY 4 OF 12") |

Spacing is on a 4px base: 4, 8, 12, 16, 24, 32, 48, 64. Mobile side padding is 24px, card padding 16px, and the gap between cards 12px.

## 4. Components and states

- **Button / primary**: rust bg, `#fff8ef` text, 56h, radius 14, 18px semibold. The states are pressed (rust-dark), disabled (40% opacity, no shadow) and focus (3px ring in rust at 40% plus a 2px parchment offset).
- **Button / secondary**: paper bg, 1.5px `#cdbfa8` border, ink text. A small size is 48h.
- **Button / quiet**: parchment-deep bg, used for "I'm not sure. Skip for now".
- **Button / choice** (Before and After): 88h, paper with a 2px ink border, arrow icon over a 22px label. The two are equal weight and neither is a default.
- **Text link**: rust-dark, underlined, at least a 48px hit area.
- **Record button**: a 168px rust circle with a 64px mic icon and three faint concentric rings (rust at 20/12/7%) that echo topo lines. The label "Record a story" sits below it in h2.
- **Stop button**: a 168px ink circle with a 52px parchment rounded square. The label "Stop" sits below. While recording, show the red `record` dot with a soft halo, plus the "Recording" label.
- **Timer**: Fraunces 60/68 with tabular numbers (mm:ss).
- **Waveform**: 46 rust bars, 4px wide with a 3px gap, in a paper strip 84h with radius 16. The motion is calm, so smooth the amplitude and don't flash. With `prefers-reduced-motion`, show a static strip.
- **Home record CTA**: a full-width rust card 76h with radius 18, a paper circle holding the mic, and the text "Record a story" plus "We'll offer a question to start".
- **Question card**: paper with a 5px rust left border, an overline "A question to start", the question in h2, a caption hint, and Skip and Write my own as small secondary buttons. A compact version is shown while recording.
- **Chips** (32h, full radius, 15px semibold, 16px icon):
  - place: slate-tint with slate-deep text and a pin icon
  - era: ochre-tint with ochre-text and a clock icon
  - age: sage-tint with sage-deep text
  - empty place: dashed border, "No place yet"
  - sample: dashed caps, which marks placeholder data such as "Grandpa Joe"
- **Story card**: paper with radius 16 and a card shadow. It has the title (h3), duration on the right, chips, and a status line. A life-order spine sits at its left (a 2px line with a 12px slate ring dot). The whole card is one tap target.
- **Status line**:
  - done: sage-deep check, "Written down"
  - transcribing: slate-deep pen, "Writing it down..."
  - failed: rust-dark alert, "Couldn't write this one down." with Try again
  - pending upload: ochre panel with a device icon, "Kept safe on this device. Not on the server yet." with Try again
- **Timeline strip**: a 4px track; 12px dots with a slate ring for each story; a 22px current dot in rust with a halo; a played fill in a light rust tone; era labels under the track (Childhood, Youth, Work, Family, Later); and a 26px dashed rust "?" dot when placing a new story. Neighbor stories show as solid ink dots with their titles underneath.
- **Segmented control**: "Life order | By place", 48h overall, with the selected segment in paper.
- **Map**: stylized and drawn, not real tiles in the mockups. Land is parchment-deep, parks sage-tint, water slate-tint, and roads paper with a tan casing, with topo lines and italic Fraunces labels. Pins are slate teardrops with a paper center. The focus pin is 1.35x size in rust with two halo rings, and the other pins dim to `#9aa6af` during playback. The precision ring is a dashed rust circle. Map controls are 48px round paper buttons. When the real map library is wired up, style its tiles toward this palette.
- **Precision picker**: a 2x2 grid of 48h options (Exact spot, Street, Neighborhood, Town). The selected option is slate-deep with white text and a check.
- **Suggested place card**: paper, with a "HEARD" overline and sparkle icon, the place name in h3, and the quoted transcript phrase in italic serif. Selected shows a 2.5px rust border plus a rust check badge.
- **Audio controls**: back 15s, play/pause as a 72px rust circle, forward 15s, and a scrubber (6px track, rust progress, 20px thumb) with tabular times. These replace the native `<audio>` controls visually, but keep the native element underneath for playback and accessibility.
- **Synced transcript**: past lines in ink-soft, the current line on rust-tint with a 4px rust left bar, and upcoming lines in ink. Auto-scroll keeps the current line in the upper third. Pause auto-scroll while the user is scrolling.

## 5. Screens (with SPEC mapping)

### 01 Home: `screens/01-home.png` (exists now, restyle)
Top to bottom:
- App bar: logo tile, "Story Atlas" wordmark, and a family button.
- Overline "Stories of", then the storyteller name in h1. "Grandpa Joe" is a placeholder, so show the real storyteller name and drop the Sample chip in production.
- Meta line: count, places, and "Family only" with a lock.
- Atlas preview card: a 124px map strip with an "Open atlas" chip, then "A life in stories" with the timeline strip.
- The record CTA.
- "Stories" h2 with the Life order / By place segmented control, then the story cards. The list scrolls and fades out at the bottom.
- The tagline "Every story has a place." can stay as the page `<title>`/meta and in the empty state if wanted.

### 02 Record: `screens/02-record.png` (exists now, restyle)
- 2a, ready: a back button, then the question card, the record button centered with its rings, "Record a story", and the hint "Tap once to start. Take your time." The footer lock line reads "Saved on this phone as you talk".
- 2b, recording: the compact question card, the Recording dot and label, the timer, the waveform, the Stop button, and the footer "Kept safe on this device while you talk".
- Keep the existing recorder logic. Skip and Write my own only change the prompt text.

### 03 Place in time: `screens/03-place-in-time.png` (SPEC step 5)
The screen has:
- A "Step 1 of 2" progress bar.
- A new-story summary chip.
- h1 "When did this happen?", then the line "Was this before or after", then the neighbor title in h2 with a question mark.
- Two choice buttons, Before and After.
- A "Where it might fit" mini timeline card with both neighbors labeled and the "?" dot between them, plus a "2 more questions" estimate.
- An optional age stepper (minus, value, plus, "years old") and an "Or enter a year" link.
- A quiet full-width "I'm not sure. Skip for now" button at the bottom.

Each answer halves the range (binary search), and the screen re-renders with the next neighbor.

### 04 Place on map: `screens/04-place-on-map.png` (SPEC step 6)
- "Step 2 of 2" header, then h1 "Where did this happen?" and a helper line.
- Two AI-suggested place cards side by side. Scroll horizontally if there are more.
- The map card (236h): a draggable focus pin with a precision ring, a dark "Drag the pin to move it" hint chip, zoom buttons, and a "Street level" precision chip.
- "How exact is the pin?" with the 2x2 precision grid.
- At the bottom: "Add place" (secondary) for multiple places, and "Confirm place" (primary).

### 05 Listen: `screens/05-listen-mobile.png`, `screens/05-listen-desktop.png` (SPEC Listening)
- **Mobile**: the map takes the top 312px and flies to the current pin while other pins dim. It has a floating back button, a "Life order" chip and a place label card. Below it, a paper sheet with a grabber overlaps the map by 24px. The sheet holds "Story 4 of 12", the title in h2, era and age chips, the timeline strip with the current dot, the scrubber and controls, and the synced transcript.
- **Desktop**: a 72px top bar with the logo, the storyteller name, the Life order / By place control, a "Family only" chip and "Record a story" (Recorder and Owner roles only). The map fills the left side and shows a dotted life-order path between places, the focus pin with a label card, and zoom controls. A floating timeline card sits at the bottom of the map. The right panel is 520px: overline, h1 title, chips, an audio card, the "Transcript" section, and an "Up next" card pinned at the bottom.
- When a story starts or a place changes, ease the map camera over about 1.2s (instant with reduced motion).

### 06 States: `screens/06-states.png`
- 6a Pending upload: "Kept safe on this device. Not on the server yet." with Try again. The audio stays playable from the local copy.
- 6b Transcribing: the audio plays, with "Writing it down..." and three soft skeleton lines.
- 6c Failed: "Couldn't write this one down." in a rust tint with Try again. The optional reassurance line is "The recording is still safe. You can listen anytime."
- 6d Done: a sage check with "Written down" and a transcript preview.
- 6e Empty home: an empty map with a dashed pin, "No stories yet." and "Press Record to tell the first one.", then the primary Record a story button.

### 07 Tokens: `screens/07-tokens.png`
The source of truth for everything above.

## 6. Accessibility rules

- Every interactive target is at least 48x48 (main actions are 56 to 88 tall, and the record and stop buttons are 168).
- Text is at least 15px, and the body is 18px. Don't put text over map art without a paper backing.
- Color contrast is WCAG AA or better (see the list above). State is never shown by color alone, so always pair it with an icon and words.
- Visible focus ring on everything (3px rust at 40% with a 2px offset).
- The record button has an `aria-label` that changes between "Record a story" and "Stop recording". Announce the timer politely every 30s, not every second.
- Transcript: mark the current line `aria-current="true"`. Auto-scroll respects user scrolling and `prefers-reduced-motion`.
- The map is supplementary. Every place also appears as text (chip and label), and the pin can be moved with its zoom controls plus arrow keys when focused.
- Use plain language, no jargon, and no em dashes in UI copy.

## 7. Figma
File: https://www.figma.com/design/DoC3HHazVJrXojYrFqPpBP (Story Atlas - Design v1 (for IBM Bob)). The Figma Starter plan's tool-call limit stopped the import, so the file may still be empty. The PNGs and HTML in this folder are the complete, authoritative reference. `html/figma-all.html` is a single self-contained file with all 9 frames, ready to import into Figma later.
