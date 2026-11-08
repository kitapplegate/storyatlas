# Next

**Action:** Open the deployed app in a real browser and walk through the full demo path from README — entry screen → consent → record → placer → listen — to confirm the P0/P1 behavioral changes work end-to-end.
**Why now:** All 14 audit fixes are committed but none have been observed in a live browser; the tests cover pure logic only.
**Start here:** `python -m http.server 8080` inside `storyatlas/`, then open `http://localhost:8080`
**Verify with:** (1) Entry screen shows "Continue on this device" only (no email/password); (2) first Record tap shows consent modal; (3) placing a story shows no auto-geocode; (4) OSM attribution visible on all maps; (5) `node --test test/storage.test.js` still 48/48 pass.
**Watch out for:** The `v2-chev` SVGs in the home side-cards still have a leftover `style` with `margin-left:auto;color:var(--ink-soft)` — those two properties aren't covered by `.ico.md` and must stay inline or get their own class.
