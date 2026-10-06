# Next

**Action:** Open the app in Chrome, complete the full demo path end-to-end in a real browser — voice interview → save chunk → ordering question → place pin on map → keepsake print view.
**Why now:** Everything is built and committed but has only been verified to HTTP 200. No human has run the mic, geocoder, or print view yet.
**Start here:** `cd storyatlas && python -m http.server 8080` then open `http://localhost:8080` in Chrome.
**Verify with:** All five acceptance criteria from the README checked off manually.
**Watch out for:** Chrome requires the page to be served over HTTP (not file://) for mic access. Web Speech API is Chrome/Edge only — test in Chrome.
