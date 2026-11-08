# Story Atlas — Implementation TODO

## P2-14: Reduce UI implementation drift

### Module extraction (planned for next session)

`js/app.js` (~1100 lines) combines routing, session state, demo data, home rendering, record wiring, listen rendering, and player orchestration. Extract into:

| New file | Responsibility |
|---|---|
| `js/session.js` | `_demoMode`, `_signIn`/`_signOut`, `AUTH_KEY`, `MIC_CONSENT_KEY` |
| `js/router.js` | `_showPage`, `_currentPage`, `history.pushState`, `popstate` handler |
| `js/home.js` | `_renderHome`, `_renderHomeTimeline`, `_renderStoryList`, `_renderStoriesPage`, `_storyCardHtml`, `_wireStoryCards` |
| `js/demo.js` | `DEMO_STORIES`, `DEMO_STORYTELLER`, demo banner wiring |

`app.js` becomes a thin coordinator that imports from these modules.

### CSS cleanup (planned)

`css/style.css` contains:
- Old v1 rules plus appended v2 fixes
- Repeated desktop media queries
- 127 inline `style` attributes in `index.html`

Priority classes to extract:
- `.icon-svg-sm` — `width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;…`
- `.icon-svg-md` — `width:22px;height:22px;fill:none;…`
- `.icon-svg-lg` — `width:28px;height:28px;fill:none;…`
- `.stack` — common flex column gap patterns
- `.chip-place`, `.chip-era`, `.chip-age` — v2-chip variants already exist; inline overrides to move in

### When to do this

After the P0/P1 behavioral fixes are stable in production (≥1 week of testing). Do not refactor and ship new features in the same PR.
