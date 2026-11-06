# Next

**Action:** Verify Stage 1 on phone: sign-in screen loads, "Try the demo" shows Grandpa Joe's atlas with pins on the map, signing in reaches the hub with real stories, Home tab returns to the sign-in screen, "Back to my atlas" button returns to the hub.
**Why now:** Stage 1 was just deployed (75cb7c1) but has not been observed on a real device. Kit must confirm before Stage 2 (real auth) begins.
**Start here:** https://kitapplegate.github.io/storyatlas — hard-refresh (Ctrl+Shift+R on Android Chrome)
**Verify with:** Sign-in screen first; demo shows 6 stories with pins zoomed to central IL; your real stories load on sign-in; Home tab goes back to sign-in; "Back to my atlas" returns to hub.
**Watch out for:** GitHub Pages may lag 2–3 min after push. If old page loads, check `app.js?v=20261106h` in DevTools → Sources.
