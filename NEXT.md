# Next

**Action:** Migrate storage from localStorage to Firebase (Firestore + Auth) for real multi-device use.
**Why now:** App is going beyond hackathon — Kit confirmed intent to ship as a real app; localStorage is a dead end for multi-device families.
**Start here:** Create a Firebase project at console.firebase.google.com, enable Firestore + Google Auth, then swap `loadData()`/`saveData()` in `js/storage.js` with Firestore reads/writes.
**Verify with:** Sign in on two different browsers/devices — stories saved on one appear on the other.
**Watch out for:** Firebase config keys go in a `.env` or a `js/firebase-config.js` that is git-ignored — never commit API keys.
