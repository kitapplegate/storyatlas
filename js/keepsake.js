/**
 * StoryAtlas — Keepsake renderer
 *
 * Renders a print-ready view of all completed story chunks.
 */

import { getChunksSorted, getStoryteller } from './storage.js';

function renderKeepsake(containerEl) {
  const chunks = getChunksSorted();
  const storyteller = getStoryteller();

  if (!chunks.length) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📖</div>
        <p>No stories yet. Start an interview to begin building your keepsake.</p>
      </div>`;
    return;
  }

  const name = storyteller.name || 'Life Stories';

  const chunkHtml = chunks.map(c => {
    const placeStr = c.place ? `📍 ${escHtml(c.place.label || '')}` : '';
    const body = escHtml(c.cleaned || c.raw || '');
    return `
      <div class="keepsake-chunk">
        <h3>${escHtml(c.title || 'Untitled')}</h3>
        ${placeStr ? `<div class="kc-place">${placeStr}</div>` : ''}
        <p>${body.replace(/\n/g, '<br>')}</p>
      </div>`;
  }).join('\n');

  containerEl.innerHTML = `
    <div class="keepsake-title-block">
      <h2>${escHtml(name)}</h2>
      <div class="subtitle">A living story, told in their own words.</div>
    </div>
    ${chunkHtml}
  `;
}

function renderPrintOptions(containerEl) {
  containerEl.innerHTML = `
    <div class="print-options">
      <h3>Turn this into a keepsake</h3>
      <ul>
        <li><strong>Print at home:</strong> Use your browser's Print function (Ctrl+P / Cmd+P). Headers and navigation are hidden automatically.</li>
        <li><strong>Photo book:</strong> <a href="https://www.shutterfly.com" target="_blank" rel="noopener">Shutterfly</a>, <a href="https://www.mixbook.com" target="_blank" rel="noopener">Mixbook</a>, or <a href="https://www.blurb.com" target="_blank" rel="noopener">Blurb</a> — paste the text into their book editors.</li>
        <li><strong>Printed book:</strong> Export as PDF (print to PDF), then upload to <a href="https://kdp.amazon.com" target="_blank" rel="noopener">Amazon KDP</a> for a printed paperback.</li>
        <li><strong>Digital keepsake:</strong> Share the exported PDF via email or cloud storage — the layout is designed to read beautifully on screen too.</li>
      </ul>
    </div>
  `;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export { renderKeepsake, renderPrintOptions };
