# Instructions for AI coding agents (IBM Bob, Claude Code, others)

## Hackathon scope: data stays on the device

Until the IBM Explore AI for Good submission (December 2, 2026), Story Atlas is
**local only**. Do not add:

- a backend, database server, or upload endpoint
- accounts, sign-in, or user tracking
- cloud storage for audio or story text
- analytics, or any network call that sends story text or audio off the device

Allowed network calls: OpenStreetMap tiles, Nominatim lookups of a place name,
and pinned CDN libraries (with SRI hashes).

A watsonx call would send transcript text off the device. Don't add one
unless Kit asks for it explicitly, and then only through a server-side proxy,
never with an API key in the browser, and with the app's privacy wording updated
to say so.

Cloud sync, family sharing, and accounts are the production plan. They're
written up in [`ROADMAP.md`](ROADMAP.md). Read it, keep the code compatible
with it, and don't build it yet.

## Keep it sync-ready
- Story ids are permanent: never regenerate or reuse one.
- Audio lives in IndexedDB (`js/audiostore.js`) as a Blob keyed by story id.
  Don't inline it back into localStorage.
- Keep the backup format (`storyatlas-backup`, version 1) readable.

## Working rules
- No build step: vanilla HTML, CSS, and ES modules.
- Bump `js/app.js?v=` in `index.html` on every deploy (GitHub Pages caches hard).
- Pushing to `master` deploys to https://kitapplegate.github.io/storyatlas.
