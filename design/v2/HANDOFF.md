# Story Atlas: Design v2 handoff for IBM Bob (sign-in + home hub)

Static reference pages. Open them in a browser (they work as plain files):

| File | What it is |
|---|---|
| `signin.html` | Logged-out screen. Pitch on the left, sign-in form, "Try the demo", product collage on the right. |
| `home.html` | Logged-in home hub. Everything is reachable from here. |
| `v2.css` | All styles. Tokens match `css/style.css` (design v1). |
| `map.svg` | Drawn placeholder map used as the map background. |
| `illustration.png` | The drawing on its own (see bug below). |

**Restyle only.** Use these for layout, spacing and copy. Wire them to the real app's
logic. Don't change recording, storage or ordering behavior.

## Flow
- Logged out: show `signin.html` only. No other pages are reachable.
- "Sign in" / "Create an account" go to the account system (Kit is building it with Bob).
- **"Try the demo"** opens a read-only sample atlas (Grandpa Joe with sample stories) with no
  account. Judges need this; don't drop it.
- Logged in: land on `home.html`.

## Home hub, top to bottom
1. Top bar: logo, nav (Home, Map, Stories, Keepsake), account button. On phones the nav
   becomes the bottom tab bar (Home, Map, Record, Stories, Keepsake).
2. "Stories of" + storyteller name + **Switch** (one account can hold several storytellers).
   Meta line: story count, place count, "Family only".
3. Record a story CTA (top right on desktop, full width on phone).
4. Atlas card: map with pins + life-order trail, "Open atlas", and the life timeline strip.
   The current/latest story is the rust dot.
5. Side column: "Pick up where you left off", then link cards to The map, All stories,
   Keepsake book.
6. Recent stories: 3 cards with Life order / By place toggle, then "See all".
7. Keep a safe copy: Download all / Restore (existing backup.js).

## Empty states to build
- No storyteller yet: replace the name block with "Whose stories will these be?" + a name field.
- No stories yet: use design v1 state 6e (empty map with a dashed pin, "No stories yet.").

## Things to update when accounts go in
- `AGENTS.md` currently forbids accounts/backends before the Dec 2 submission. Kit will
  update it; follow whatever it says at the time.
- The current copy "Saved on this device only" stops being true once stories sync. Change it.

## Bug found during this pass
`assets/illustration.png` (commit `fce589c`) is a **screenshot of the whole old landing page**,
not the drawing. The live hero shows a shrunk copy of the page. `design/v2/illustration.png`
is the drawing cropped out of it. It's only 416x302, so get the original full-size art if it exists.
