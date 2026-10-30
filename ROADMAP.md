# Story Atlas — Roadmap

Where Story Atlas goes after the hackathon. **Nothing in the "Production" section
gets built before the December 2, 2026 submission.** It's written down now so the
hackathon code doesn't paint us into a corner.

---

## Now: hackathon build (through Dec 2, 2026) — local only

Everything a family records stays in the browser on the device that recorded it.

| What | Where it lives |
|---|---|
| Story text, titles, order, places, storyteller name | `localStorage`, key `storyatlas_v2` (`js/storage.js`) |
| Audio recordings | IndexedDB, db `storyatlas`, store `audio`, keyed by story id (`js/audiostore.js`) |
| Off-device copy | The family's own backup file from "Download all stories" (`js/backup.js`) |

Network calls the app makes today: map tiles (OpenStreetMap), place lookups
(Nominatim, the place name only), and the Leaflet library from unpkg.
Chrome's live transcription also sends the microphone audio to Google's speech
service — that's the browser, not our code, and the privacy wording should say so.

Why local for the hackathon: no accounts, no server to secure, nothing to leak,
and nothing that can break during judging. The cost is that a lost phone or a
cleared browser loses the stories unless a backup was downloaded.

---

## Production: local-first with cloud sync

The end goal. A story is recorded and saved on the device first (works offline
at Grandma's kitchen table, never loses a take to bad Wi-Fi), then uploaded in
the background. The server copy is the source of truth; the device keeps a cache.

### Phase 1 — Accounts and one family space
- Email magic-link sign-in (no passwords for older users). The fantasy-football
  app's mail relay is a working pattern to reuse.
- One "family" per storyteller. The person who records is the owner.

### Phase 2 — Sync
- A small upload API (same shape as the other VPS apps behind Caddy).
- Each story uploads as metadata (JSON) plus its audio file, keyed by the
  existing story id. Retries until the server confirms; the device marks it synced.
- Audio storage: VPS disk to start; S3-style object storage (Cloudflare R2,
  Backblaze B2) once it grows. Check current pricing when choosing.
- Offsite backups of the server copy — the server must not be the only copy either.

### Phase 3 — Family listening
- Invite family members by email. Invited people can listen and read; only the
  owner (or people they choose) can edit or delete.
- Any device, any browser — no recording needed to listen.

### Phase 4 — Polish
- AI help (titles, place names, dates, follow-up questions) through watsonx,
  called **from the server only** — never an API key in the browser.
- Keepsake book export (PDF) from the synced stories.

### Privacy requirements (all phases)
These are recordings of older people, often with health and family details.
- A plain consent step before the first recording, saying where audio goes.
- Encryption in transit and at rest.
- Export everything, and delete everything, in one click each.
- The privacy note in the app must match what the code actually does.

### Storage estimate
`js/recorder.js` records at a fixed 48 kbps (`audioBitsPerSecond`), about 21 MB
per recorded hour — 20 hours of one grandparent's stories is roughly 420 MB.
Without it, some browsers default to 128 kbps (~60 MB/hour). Text is a few KB per story.

---

## Rules that keep the hackathon code sync-ready
Build nothing from the Production section yet, but don't break these:
- **Story ids are permanent.** Never regenerate or reuse an id; sync keys on it.
- **Audio stays a separate Blob keyed by story id**, not inlined into story JSON.
- **The backup file format** (`format: "storyatlas-backup"`, `version: 1`) stays
  readable — it becomes the import path for moving local stories to an account.
