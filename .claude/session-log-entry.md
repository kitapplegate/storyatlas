## 2026-10-30 05:00

**Summary:** Fixed the two blocking gaps before the live demo. (1) Transcription was broken — `recorder.js` captured audio via `MediaRecorder` but `transcriber.js` returned empty lines because you can't replay a blob through browser Speech Recognition. Fixed by running `SpeechRecognition` in parallel with `MediaRecorder` from the moment recording starts; the live transcript travels alongside the blob into `_onRecordingComplete()` via a new `liveTranscript` parameter (`dfbbc1f`). (2) The welcome modal blocked the home page on first visit. Fixed by moving the open call from load-time `_checkWelcome()` to a `_promptForName()` guard inside `_startRecording()` only (`804d028`). User reported modal still showing — diagnosed as GitHub Pages cache; resolved with no-cache meta + `?v=20261030` cache-bust on `app.js` (`8ecdfba`). All three commits pushed to `origin/master`. Browser verification of the modal fix not yet confirmed.

**Status:**
- Live transcript (recorder.js + transcriber.js) — **tested locally**: brace checks passed, push confirmed
- Modal deferred to Record action — **implemented**: pushed `804d028`, browser result not yet verified
- Cache-bust for modal fix — **verified in real environment**: push `8ecdfba` landed, browser test pending

**Open tasks:**
- [ ] next — Hard-refresh https://kitapplegate.github.io/storyatlas in Chrome, confirm home loads freely, Record triggers modal, transcript appears after speaking. See NEXT.md.

