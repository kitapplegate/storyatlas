/**
 * StoryAtlas — main app controller
 * Wires together: interview, storage, map, keepsake.
 */

import {
  pickNextQuestion, pickFollowUp, detectPlace,
  buildOrderingQuestion, VoiceCapture,
} from './interview.js';
import { cleanGrammar } from './grammar.js';
import {
  saveChunk, deleteChunk, getChunksSorted, reorderChunk,
  generateId, getStoryteller, saveStoryteller,
} from './storage.js';
import { initMap, geocode, pinChunk, removePin, flyToChunk, fitAllPins, startWalking, stopWalking } from './map.js';
import { renderKeepsake, renderPrintOptions } from './keepsake.js';

// ── State ─────────────────────────────────────────────────────────────────────
let currentQuestion = null;
let voice = null;
let pendingChunk = null;       // chunk being saved, awaiting ordering answer
let answeredQIds = [];         // question IDs used this session
let mapInitialised = false;
let walkingMode = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Page routing ──────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  const page = $(`page-${name}`);
  const btn  = $(`nav-${name}`);
  if (page) page.classList.add('active');
  if (btn)  btn.classList.add('active');

  if (name === 'map') initMapPage();
  if (name === 'timeline') renderTimeline();
  if (name === 'keepsake') renderKeepsakePage();
}

// ── Interview page ────────────────────────────────────────────────────────────

function initInterview() {
  answeredQIds = JSON.parse(sessionStorage.getItem('sa_answered') || '[]');
  currentQuestion = pickNextQuestion(answeredQIds);
  renderQuestion(currentQuestion.text);
  updateStorytellterBar();
  updateAside();

  // Mic
  $('btn-mic').addEventListener('click', toggleMic);

  // Save
  $('btn-save-chunk').addEventListener('click', saveCurrentChunk);

  // Edit
  $('btn-edit').addEventListener('click', () => {
    $('transcript').contentEditable = 'true';
    $('transcript').focus();
    $('btn-edit').style.display = 'none';
  });

  // Discard
  $('btn-discard').addEventListener('click', () => {
    clearTranscript();
    hideFollowUp();
    showToast('Story discarded.');
  });

  // Next question
  $('btn-next-q').addEventListener('click', () => {
    clearTranscript();
    hideFollowUp();
    answeredQIds.push(currentQuestion.id);
    sessionStorage.setItem('sa_answered', JSON.stringify(answeredQIds));
    currentQuestion = pickNextQuestion(answeredQIds);
    renderQuestion(currentQuestion.text);
    $('chunk-saved-banner').classList.remove('show');
  });

  // Auto follow-up: "Answer this" loads the follow-up as the next question
  $('btn-answer-followup').addEventListener('click', () => {
    const fu = $('followup-question-text').textContent;
    renderQuestion(fu, false);
    hideFollowUp();
    clearTranscript();
  });

  // Auto follow-up: "Skip" advances to next bank question
  $('btn-skip-followup').addEventListener('click', () => {
    hideFollowUp();
    answeredQIds.push(currentQuestion.id);
    sessionStorage.setItem('sa_answered', JSON.stringify(answeredQIds));
    currentQuestion = pickNextQuestion(answeredQIds);
    renderQuestion(currentQuestion.text);
  });

  // Ordering answer buttons
  document.addEventListener('click', e => {
    if (e.target.matches('[data-ordering]')) {
      handleOrderingAnswer(e.target.dataset.ordering);
    }
  });

  // Place modal
  $('place-confirm-btn').addEventListener('click', confirmPlaceGeocode);
  $('place-skip-btn').addEventListener('click', () => closeModal('place-modal'));

  // Photo
  $('photo-input').addEventListener('change', handlePhotoAttach);
}

function renderQuestion(text, isFromBank = true) {
  $('ai-question-text').textContent = text;
  const eyebrow = $('question-eyebrow');
  const escape  = $('question-escape');
  if (isFromBank) {
    eyebrow.textContent = 'StoryAtlas asks';
    if (escape) escape.style.display = '';
  } else {
    eyebrow.textContent = 'Follow-up (optional)';
    if (escape) escape.style.display = 'none';
  }
  setActionState('idle');
}

function hideFollowUp() {
  $('followup-block').classList.remove('visible');
}

function showFollowUp() {
  const fu = pickFollowUp();
  $('followup-question-text').textContent = fu;
  $('followup-block').classList.add('visible');
}

function setActionState(state) {
  const btnMic   = $('btn-mic');
  const btnSave  = $('btn-save-chunk');
  const btnEdit  = $('btn-edit');
  const btnDis   = $('btn-discard');
  const label    = $('mic-label');
  const status   = $('transcript-status');
  const wrap     = $('transcript-wrap');

  if (state === 'idle') {
    btnMic.textContent = '🎙';
    btnMic.classList.remove('listening');
    btnMic.disabled = false;
    btnSave.disabled = true;
    btnEdit.style.display = 'none';
    btnDis.style.display = 'none';
    label.textContent = 'Press to start recording';
    status.textContent = 'Ready to record';
    wrap.classList.remove('listening');
  } else if (state === 'listening') {
    btnMic.textContent = '⏹';
    btnMic.classList.add('listening');
    btnMic.disabled = false;
    btnSave.disabled = true;
    btnEdit.style.display = 'none';
    btnDis.style.display = 'none';
    label.textContent = 'Listening… press to stop';
    status.textContent = 'Recording…';
    wrap.classList.add('listening');
  } else if (state === 'hasText') {
    btnMic.textContent = '🎙';
    btnMic.classList.remove('listening');
    btnMic.disabled = false;
    btnSave.disabled = false;
    btnEdit.style.display = '';
    btnDis.style.display = '';
    label.textContent = 'Press to keep talking';
    status.textContent = 'Ready to save — or keep talking';
    wrap.classList.remove('listening');
  }
}

function toggleMic() {
  if (!voice) {
    voice = new VoiceCapture({
      onPartial: (text) => {
        showTranscript(text);
        setActionState('listening');
      },
      onEnd: (text) => {
        if (text) {
          const cleaned = cleanGrammar(text);
          showTranscript(cleaned, true);
          setActionState('hasText');
        } else {
          setActionState('idle');
        }
        voice = null;
      },
      onError: (msg) => {
        showToast(msg);
        setActionState('idle');
        voice = null;
      },
    });
    voice.start();
    setActionState('listening');
  } else {
    voice.stop();
  }
}

function showTranscript(text, isFinal = false) {
  const ta = $('transcript');
  ta.innerHTML = escHtml(text);
  if (isFinal) ta.classList.remove('listening');
}

function clearTranscript() {
  $('transcript').innerHTML = '';
  $('transcript').contentEditable = 'false';
  setActionState('idle');
  pendingChunk = null;
  $('chunk-saved-banner').classList.remove('show');
}

function saveCurrentChunk() {
  const text = $('transcript').textContent.trim();
  if (!text) return;

  // Build a title from first ~8 words
  const words = text.split(/\s+/).slice(0, 8).join(' ');
  const title = words + (text.split(/\s+/).length > 8 ? '…' : '');

  pendingChunk = {
    id: generateId(),
    title,
    raw: text,
    cleaned: cleanGrammar(text),
    place: null,
    era: currentQuestion?.era || 'General',
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    photo: null,
    complete: false,
  };

  // Check for a place mention
  const placeHint = detectPlace(text);
  if (placeHint) {
    openPlaceModal(placeHint);
  } else {
    finaliseChunk();
  }
}

function openPlaceModal(hint) {
  $('place-input').value = hint;
  $('modal-overlay').classList.add('open');
}

function closeModal(id) {
  $('modal-overlay').classList.remove('open');
}

async function confirmPlaceGeocode() {
  const query = $('place-input').value.trim();
  closeModal('place-modal');

  if (!query) {
    finaliseChunk();
    return;
  }

  showToast('Looking up location…');
  const result = await geocode(query);
  if (result) {
    pendingChunk.place = { label: result.displayName.split(',').slice(0,3).join(','), lat: result.lat, lng: result.lng };
    showToast('Location found: ' + pendingChunk.place.label.split(',')[0]);
  } else {
    showToast('Could not find that location — saving without a pin.');
  }
  finaliseChunk();
}

function finaliseChunk() {
  // Show ordering question if chunks already exist
  const existing = getChunksSorted();
  if (existing.length > 0) {
    const ord = buildOrderingQuestion(pendingChunk, existing);
    if (ord) {
      renderOrderingCard(ord);
      return; // wait for user answer
    }
  }
  commitChunk();
}

function renderOrderingCard(ord) {
  const card = $('ordering-card');
  $('ordering-question-text').textContent = ord.question;
  card.dataset.refId = ord.refId;
  card.style.display = '';
}

function handleOrderingAnswer(relation) {
  const card = $('ordering-card');
  const refId = card.dataset.refId;
  card.style.display = 'none';

  // Capture id before commitChunk may clear pendingChunk
  const newId = pendingChunk.id;
  commitChunk();

  // Now re-order
  if (refId) {
    reorderChunk(newId, refId, relation.toLowerCase());
  }
  const refTitle = getChunksSorted().find(c => c.id === refId)?.title || 'the previous one';
  showToast(`Story placed ${relation.toLowerCase()} "${refTitle}".`);
}

function commitChunk() {
  saveChunk(pendingChunk);

  // Pin on map if has place
  if (pendingChunk.place && mapInitialised) pinChunk(pendingChunk);

  // Show saved banner
  $('chunk-saved-banner').classList.add('show');
  $('chunk-saved-banner').querySelector('.banner-title').textContent =
    `"${pendingChunk.title}" saved.`;

  setActionState('idle');
  $('transcript').innerHTML = '';
  updateAside();

  // Automatically show a follow-up question
  showFollowUp();
}

function handlePhotoAttach(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (pendingChunk) pendingChunk.photo = ev.target.result;
    showToast('Photo attached.');
  };
  reader.readAsDataURL(file);
}

// ── Timeline page ─────────────────────────────────────────────────────────────

function updateStorytellterBar() {
  const st = getStoryteller();
  const name = st.name || '?';
  const initial = name.charAt(0).toUpperCase();
  const avatar = $('storyteller-avatar');
  const displayName = $('storyteller-display-name');
  if (avatar) avatar.textContent = initial;
  if (displayName) displayName.textContent = name;
  const chunks = getChunksSorted();
  const sessionLabel = $('session-label');
  if (sessionLabel) sessionLabel.textContent = chunks.length
    ? `${chunks.length} stor${chunks.length === 1 ? 'y' : 'ies'} saved`
    : 'No stories yet — let\'s begin';
}

function updateAside() {
  const chunks = getChunksSorted();
  const withPlace = chunks.filter(c => c.place);
  const countEl = $('aside-chunk-count');
  const placeEl = $('aside-place-count');
  if (countEl) countEl.textContent = chunks.length;
  if (placeEl) placeEl.textContent = withPlace.length;
  const recentEl = $('aside-recent');
  if (recentEl) {
    const recent = [...chunks].reverse().slice(0, 5);
    recentEl.innerHTML = recent.length
      ? recent.map(c => `<li title="${escHtml(c.cleaned || c.raw || '')}">${escHtml(c.title || 'Untitled')}</li>`).join('')
      : '<li style="font-style:italic; color:var(--faint)">No stories yet</li>';
  }
}

function renderTimeline() {
  const chunks = getChunksSorted();
  const container = $('timeline-chunks');
  const st = getStoryteller();
  $('timeline-name').textContent = st.name || 'Stories';
  const sub = $('timeline-subtitle');
  if (sub) sub.textContent = chunks.length
    ? `${chunks.length} stor${chunks.length === 1 ? 'y' : 'ies'} · in chronological order`
    : '';

  if (!chunks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📜</div>
        <p>No stories yet. Start an interview and your first chunk will appear here.</p>
        <button class="btn btn-primary" onclick="showPage('interview')">Start your first story</button>
      </div>`;
    return;
  }

  // Group by era
  const byEra = {};
  chunks.forEach(c => {
    const era = c.era || 'General';
    if (!byEra[era]) byEra[era] = [];
    byEra[era].push(c);
  });

  container.innerHTML = Object.entries(byEra).map(([era, cs]) => `
    <div class="era-group">
      <div class="era-label">${escHtml(era)}</div>
      ${cs.map(c => chunkCardHtml(c)).join('')}
    </div>
  `).join('');

  // Wire edit / delete / map buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, chunkId } = btn.dataset;
      if (action === 'delete') {
        if (confirm('Delete this story chunk?')) {
          deleteChunk(chunkId);
          removePin(chunkId);
          renderTimeline();
        }
      } else if (action === 'edit') {
        openEditModal(chunkId);
      } else if (action === 'map') {
        const chunk = getChunksSorted().find(c => c.id === chunkId);
        if (chunk && chunk.place) {
          showPage('map');
          setTimeout(() => flyToChunk(chunk), 400);
        } else {
          showToast('No map pin for this story yet.');
        }
      }
    });
  });
}

function openEditModal(chunkId) {
  const chunk = getChunkById(chunkId);
  if (!chunk) return;
  $('edit-modal-title').value = chunk.title || '';
  $('edit-modal-body').value = chunk.cleaned || chunk.raw || '';
  $('edit-modal-overlay').classList.add('open');
  $('edit-modal-save-btn').onclick = () => {
    chunk.title   = $('edit-modal-title').value.trim() || chunk.title;
    chunk.cleaned = $('edit-modal-body').value.trim();
    chunk.raw     = chunk.raw || chunk.cleaned;
    saveChunk(chunk);
    $('edit-modal-overlay').classList.remove('open');
    renderTimeline();
    showToast('Story updated.');
  };
  $('edit-modal-cancel-btn').onclick = () => {
    $('edit-modal-overlay').classList.remove('open');
  };
}

function chunkCardHtml(c) {
  const placeTag = c.place
    ? `<span class="place-badge" title="${escHtml(c.place.label||'')}">📍 ${escHtml((c.place.label||'').split(',')[0])}</span>`
    : '';
  const preview = (c.cleaned || c.raw || '').slice(0, 160);
  return `
    <div class="chunk-card">
      <div class="chunk-actions">
        ${c.place ? `<button data-action="map" data-chunk-id="${c.id}">Map</button>` : ''}
        <button data-action="edit" data-chunk-id="${c.id}">Edit</button>
        <button data-action="delete" data-chunk-id="${c.id}">Delete</button>
      </div>
      <div class="chunk-title">${escHtml(c.title || 'Untitled')}</div>
      <div class="chunk-body">${escHtml(preview)}${preview.length < (c.cleaned||c.raw||'').length ? '…' : ''}</div>
      <div class="chunk-meta">
        <span>${new Date(c.createdAt).toLocaleDateString()}</span>
        ${placeTag}
      </div>
    </div>`;
}

// ── Map page ──────────────────────────────────────────────────────────────────

function initMapPage() {
  if (!mapInitialised) {
    initMap('map-container');
    mapInitialised = true;
    // Pin all existing chunks
    const chunks = getChunksSorted().filter(c => c.place);
    chunks.forEach(c => pinChunk(c, () => {}));
    if (chunks.length) setTimeout(fitAllPins, 300);
    // Wire mode toggle exactly once
    $('btn-armchair').addEventListener('click', setArmchairMode);
    $('btn-walking').addEventListener('click', setWalkingMode);
  }
}

function setArmchairMode() {
  walkingMode = false;
  stopWalking();
  $('btn-armchair').classList.add('active');
  $('btn-walking').classList.remove('active');
  $('walking-banner').classList.remove('visible');
  showToast('Armchair mode — browse stories on the map.');
}

function setWalkingMode() {
  walkingMode = true;
  $('btn-walking').classList.add('active');
  $('btn-armchair').classList.remove('active');
  $('walking-banner').classList.add('visible');
  $('walking-banner').querySelector('.walking-status').textContent = 'Getting your location…';

  const chunks = getChunksSorted().filter(c => c.place);
  startWalking(chunks, (nearby, err) => {
    if (err) {
      $('walking-banner').querySelector('.walking-status').textContent = `Location error: ${err}`;
      return;
    }
    if (nearby && nearby.length) {
      const names = nearby.map(c => c.title || 'a story').join(', ');
      $('walking-banner').querySelector('.walking-status').textContent = `📍 Nearby: ${names}`;
    }
  });
}

// ── Keepsake page ─────────────────────────────────────────────────────────────

function renderKeepsakePage() {
  renderKeepsake($('keepsake-content'));
  renderPrintOptions($('keepsake-options'));
}

// ── Storyteller name modal ────────────────────────────────────────────────────

function initNameModal() {
  const st = getStoryteller();
  if (!st.name || st.name === 'My Story') {
    openNameModal();
  }
  $('name-save-btn').addEventListener('click', () => {
    const name = $('storyteller-name-input').value.trim();
    if (name) {
      saveStoryteller({ name });
      $('name-modal-overlay').classList.remove('open');
      document.title = `StoryAtlas — ${name}`;
      updateStorytellterBar();
    }
  });
}

function openNameModal() {
  $('name-modal-overlay').classList.add('open');
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Expose showPage globally for inline onclick attributes
window.showPage = showPage;

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav buttons
  ['interview', 'timeline', 'map', 'keepsake'].forEach(name => {
    $(`nav-${name}`)?.addEventListener('click', () => showPage(name));
  });

  initInterview();
  initNameModal();
  showPage('interview');
});
