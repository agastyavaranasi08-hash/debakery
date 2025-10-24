import { renderNavbar, getDB, saveDB, createId, updateDB, computeArcHealth, escapeHtml } from './common.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  refreshSeriesSelect();
  renderSeriesList();

  document.getElementById('series-form')?.addEventListener('submit', handleSeriesSubmit);
  document.getElementById('arc-form')?.addEventListener('submit', handleArcSubmit);
  document.getElementById('export-btn')?.addEventListener('click', handleExport);
  document.getElementById('import-input')?.addEventListener('change', handleImport);
});

function handleSeriesSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('series-name'));
  const name = nameInput?.value.trim();
  if (!name) return;

  const db = getDB();
  db.series.push({ id: createId('series'), name, arcs: [] });
  saveDB();
  nameInput.value = '';
  refreshSeriesSelect();
  renderSeriesList();
}

function handleArcSubmit(event) {
  event.preventDefault();
  const seriesSelect = /** @type {HTMLSelectElement} */ (document.getElementById('arc-series'));
  const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('arc-title'));
  const summaryInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('arc-summary'));
  const ratingInput = /** @type {HTMLInputElement} */ (document.getElementById('arc-rating'));

  const seriesId = seriesSelect?.value;
  const title = titleInput?.value.trim();
  if (!seriesId || !title) return;

  const summary = summaryInput?.value.trim() ?? '';
  const rating = Math.round(Math.min(5, Math.max(1, Number(ratingInput?.value) || 3)));

  const db = getDB();
  const series = db.series.find((s) => s.id === seriesId);
  if (!series) return;

  series.arcs.push({
    id: createId('arc'),
    title,
    summary,
    rating,
    mappings: [],
    chat: []
  });

  saveDB();
  titleInput.value = '';
  summaryInput.value = '';
  ratingInput.value = '3';
  renderSeriesList();
}

function refreshSeriesSelect() {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('arc-series'));
  if (!select) return;
  const db = getDB();
  const previous = select.value;
  if (db.series.length === 0) {
    select.innerHTML = '<option value="" disabled selected>No series available</option>';
    return;
  }
  select.innerHTML = db.series
    .map((series, index) => {
      const selected = series.id === previous || (!previous && index === 0);
      return `<option value="${series.id}" ${selected ? 'selected' : ''}>${escapeHtml(series.name)}</option>`;
    })
    .join('');
}

function renderSeriesList() {
  const list = document.getElementById('series-list');
  if (!list) return;
  const db = getDB();
  if (db.series.length === 0) {
    list.innerHTML = '<p>No series yet. Add one above to get started.</p>';
    return;
  }

  list.innerHTML = db.series
    .map((series) => {
      const arcsHtml = series.arcs
        .map((arc) => {
          const health = computeArcHealth(arc);
          const healthClass = `health-badge ${health.status === 'OK' ? 'health-ok' : health.status === 'Gaps' ? 'health-gaps' : 'health-mismatched'}`;
          return `
            <li>
              <div class="arc-heading">
                <strong>${escapeHtml(arc.title)}</strong>
                <span class="${healthClass}">${escapeHtml(health.label)}</span>
              </div>
              <p class="hint">${escapeHtml(arc.summary || 'No summary yet.')}</p>
              <p class="result-meta">Rating: ${'★'.repeat(arc.rating)}${'☆'.repeat(5 - arc.rating)}</p>
              <a href="mappings.html#${series.id}:${arc.id}">Open in Mappings</a>
            </li>
          `;
        })
        .join('');

      return `
        <article class="series-item">
          <h3>${escapeHtml(series.name)}</h3>
          ${series.arcs.length ? `<ul class="arc-list">${arcsHtml}</ul>` : '<p class="hint">No arcs yet.</p>'}
        </article>
      `;
    })
    .join('');
}

function handleExport() {
  const data = JSON.stringify(getDB(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mla-data.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleImport(event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget);
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.series)) {
        throw new Error('Invalid MLA data.');
      }
      const db = getDB();
      const merged = mergeDatabases(db, parsed);
      updateDB(merged);
      refreshSeriesSelect();
      renderSeriesList();
      alert('Import complete. Review changes before uploading.');
    } catch (error) {
      console.error(error);
      alert('Failed to import data. Please check the JSON file.');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

/**
 * Merge imported data into existing cache using id precedence.
 * @param {Root} current
 * @param {Root} incoming
 * @returns {Root}
 */
function mergeDatabases(current, incoming) {
  const cloneCurrent = JSON.parse(JSON.stringify(current));

  for (const incomingSeries of incoming.series) {
    const idx = cloneCurrent.series.findIndex((s) => s.id === incomingSeries.id);
    if (idx === -1) {
      cloneCurrent.series.push(incomingSeries);
    } else {
      const targetSeries = cloneCurrent.series[idx];
      targetSeries.name = incomingSeries.name;
      targetSeries.arcs = incomingSeries.arcs;
    }
  }
  return cloneCurrent;
}
