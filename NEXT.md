# Next

**Action:** Open https://kitapplegate.github.io/storyatlas in Chrome, do a hard-refresh (Ctrl+Shift+R), confirm the home page loads without the name modal, then press Record and verify the name prompt appears at that point instead.
**Why now:** The modal fix was pushed (`8ecdfba`) but not yet verified in the real environment — the user reported it was still showing before the cache-bust commit landed.
**Start here:** `https://kitapplegate.github.io/storyatlas` — Ctrl+Shift+R to force reload
**Verify with:** Home loads freely → press Record → modal appears → enter name → recording screen opens → speak → transcript appears after stopping.
**Watch out for:** GitHub Pages can take 2–5 minutes to deploy after a push. If still broken, try opening in a private/incognito window to bypass local cache entirely.
