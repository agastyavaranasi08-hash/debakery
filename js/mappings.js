import {
  renderNavbar,
  getDB,
  getSeries,
  getArc,
  saveDB,
  createId,
  computeArcHealth,
  pushDBToRepo,
  escapeHtml
} from './common.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  setupSelectors();
  setupArcMeta();
  setupMappingEditor();
  setupUploadForm();
  window.addEventListener('hashchange', syncFromHash);
  syncFromHash();
});

let currentSeriesId = '';
let currentArcId = '';

function setupSelectors() {
  const seriesPicker = document.getElementById('series-picker');
  const arcPicker = document.getElementById('arc-picker');

  if (!seriesPicker || !arcPicker) return;

  seriesPicker.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    currentSeriesId = select.value;
    populateArcPicker();
    const series = getSeries(currentSeriesId);
    if (series?.arcs.length) {
      currentArcId = series.arcs[0].id;
      arcPicker.value = currentArcId;
    } else {
      currentArcId = '';
    }
    updateHash();
    renderArcDetails();
  });

  arcPicker.addEventListener('change', (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
    currentArcId = select.value;
    updateHash();
    renderArcDetails();
  });

  populateSeriesPicker();
}

function setupArcMeta() {
  const titleInput = document.getElementById('arc-title-input');
  const summaryInput = document.getElementById('arc-summary-input');
  const ratingInput = document.getElementById('arc-rating-input');

  titleInput?.addEventListener('input', () => {
    const arc = getSelectedArc();
    if (!arc) return;
    arc.title = titleInput.value.trim();
    saveDB();
    updateHash();
    renderArcDetails();
  });

  summaryInput?.addEventListener('input', () => {
    const arc = getSelectedArc();
    if (!arc) return;
    arc.summary = summaryInput.value;
    saveDB();
    renderArcDetails();
  });

  ratingInput?.addEventListener('change', () => {
    const arc = getSelectedArc();
    if (!arc) return;
    const nextValue = Math.round(Math.min(5, Math.max(1, Number(ratingInput.value) || 1)));
    arc.rating = nextValue;
    ratingInput.value = String(nextValue);
    saveDB();
    renderArcDetails();
  });
}

function setupMappingEditor() {
  const addButton = document.getElementById('add-mapping');
  const editorBody = document.getElementById('mapping-editor-rows');

  addButton?.addEventListener('click', () => {
    const arc = getSelectedArc();
    if (!arc) return;
    arc.mappings.push({
      id: createId('mapping'),
      label: '',
      manga: '',
      ln: '',
      anime: '',
      notes: ''
    });
    saveDB();
    renderArcDetails();
  });

  editorBody?.addEventListener('input', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return;
    }
    const row = target.closest('tr');
    const field = target.dataset.field;
    if (!row || !field) return;
    const mappingId = row.dataset.id;
    const arc = getSelectedArc();
    if (!arc) return;
    const mapping = arc.mappings.find((item) => item.id === mappingId);
    if (!mapping) return;
    mapping[field] = target.value;
    saveDB();
    renderArcHealth();
    renderMappingOverview(arc);
  });

  editorBody?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target instanceof HTMLButtonElement && target.dataset.action === 'delete') {
      const row = target.closest('tr');
      const mappingId = row?.dataset.id;
      const arc = getSelectedArc();
      if (!arc || !mappingId) return;
      arc.mappings = arc.mappings.filter((item) => item.id !== mappingId);
      saveDB();
      renderArcDetails();
    }
  });
}

function setupUploadForm() {
  const form = document.getElementById('upload-form');
  const status = document.getElementById('upload-status');
  if (!form || !status) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
    submitter.disabled = true;
    status.textContent = 'Uploading…';

    const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('author-name'));
    const emailInput = /** @type {HTMLInputElement} */ (document.getElementById('author-email'));
    const messageInput = /** @type {HTMLInputElement} */ (document.getElementById('commit-message'));

    try {
      const payload = await pushDBToRepo({
        authorName: nameInput?.value?.trim() || undefined,
        authorEmail: emailInput?.value?.trim() || undefined,
        message: messageInput?.value?.trim() || undefined
      });
      status.innerHTML = `Upload complete. <a href="${payload.commitUrl}" target="_blank" rel="noopener">View commit</a>.`;
    } catch (error) {
      console.error(error);
      status.textContent = error instanceof Error ? error.message : 'Upload failed.';
    } finally {
      submitter.disabled = false;
    }
  });
}

function populateSeriesPicker() {
  const picker = /** @type {HTMLSelectElement} */ (document.getElementById('series-picker'));
  if (!picker) return;
  const db = getDB();
  if (!db.series.length) {
    picker.innerHTML = '<option value="" disabled selected>No series found</option>';
    const arcPicker = document.getElementById('arc-picker');
    if (arcPicker) {
      arcPicker.innerHTML = '';
    }
    hideArcSections();
    return;
  }

  picker.innerHTML = db.series
    .map((series) => `<option value="${series.id}">${escapeHtml(series.name)}</option>`)
    .join('');

  if (!currentSeriesId) {
    currentSeriesId = db.series[0].id;
  }
  picker.value = currentSeriesId;
  populateArcPicker();
}

function populateArcPicker() {
  const picker = /** @type {HTMLSelectElement} */ (document.getElementById('arc-picker'));
  if (!picker) return;
  const series = getSeries(currentSeriesId);
  if (!series || !series.arcs.length) {
    picker.innerHTML = '';
    hideArcSections();
    return;
  }

  picker.innerHTML = series.arcs
    .map((arc) => `<option value="${arc.id}">${escapeHtml(arc.title)}</option>`)
    .join('');

  if (!currentArcId || !series.arcs.some((arc) => arc.id === currentArcId)) {
    currentArcId = series.arcs[0].id;
  }
  picker.value = currentArcId;
  renderArcDetails();
}

function renderArcDetails() {
  const arc = getSelectedArc();
  const metaCard = document.getElementById('arc-meta');
  const editorCard = document.getElementById('editor-card');
  const overviewCard = document.getElementById('overview-card');
  const uploadCard = document.getElementById('upload-card');

  if (!arc || !metaCard || !editorCard || !overviewCard || !uploadCard) {
    hideArcSections();
    return;
  }

  metaCard.hidden = false;
  editorCard.hidden = false;
  overviewCard.hidden = false;
  uploadCard.hidden = false;

  const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('arc-title-input'));
  const summaryInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('arc-summary-input'));
  const ratingInput = /** @type {HTMLInputElement} */ (document.getElementById('arc-rating-input'));

  titleInput.value = arc.title;
  summaryInput.value = arc.summary;
  ratingInput.value = String(arc.rating ?? 1);

  renderArcHealth();
  renderMappingEditor(arc);
  renderMappingOverview(arc);
}

function renderMappingEditor(arc) {
  const tableBody = document.getElementById('mapping-editor-rows');
  if (!tableBody) return;

  if (!arc.mappings.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <p class="hint">No mappings yet. Use “Add Mapping Row” to begin aligning content.</p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = arc.mappings
    .map(
      (mapping) => `
        <tr data-id="${mapping.id}">
          <td><input type="text" data-field="label" value="${escapeHtml(mapping.label)}" placeholder="Arc label" /></td>
          <td><input type="text" data-field="manga" value="${escapeHtml(mapping.manga)}" placeholder="Chapter" /></td>
          <td><input type="text" data-field="ln" value="${escapeHtml(mapping.ln)}" placeholder="Volume / Chapter" /></td>
          <td><input type="text" data-field="anime" value="${escapeHtml(mapping.anime)}" placeholder="Episode" /></td>
          <td><textarea data-field="notes" rows="2" placeholder="Notes">${escapeHtml(mapping.notes)}</textarea></td>
          <td class="actions-cell">
            <button type="button" data-action="delete" class="ghost">Remove</button>
          </td>
        </tr>
      `
    )
    .join('');
}

function renderMappingOverview(arc) {
  const tableBody = document.getElementById('mapping-overview-rows');
  if (!tableBody) return;

  if (!arc.mappings.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <p class="hint">Mappings will appear here after you add them in the editor above.</p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = arc.mappings
    .map(
      (mapping) => `
        <tr>
          <td>${formatCell(mapping.label)}</td>
          <td>${formatCell(mapping.manga)}</td>
          <td>${formatCell(mapping.ln)}</td>
          <td>${formatCell(mapping.anime)}</td>
          <td>${formatCell(mapping.notes)}</td>
        </tr>
      `
    )
    .join('');
}

function renderArcHealth() {
  const healthElement = document.getElementById('arc-health');
  const arc = getSelectedArc();
  if (!healthElement || !arc) return;
  const health = computeArcHealth(arc);
  healthElement.textContent = health.label;
  healthElement.className = `health-badge ${
    health.status === 'OK' ? 'health-ok' : health.status === 'Gaps' ? 'health-gaps' : 'health-mismatched'
  }`;
}

function hideArcSections() {
  document.getElementById('arc-meta')?.setAttribute('hidden', 'true');
  document.getElementById('editor-card')?.setAttribute('hidden', 'true');
  document.getElementById('overview-card')?.setAttribute('hidden', 'true');
  document.getElementById('upload-card')?.setAttribute('hidden', 'true');
  document.getElementById('arc-health').textContent = '';
}

function getSelectedArc() {
  if (!currentSeriesId || !currentArcId) return undefined;
  return getArc(currentSeriesId, currentArcId);
}

function updateHash() {
  if (!currentSeriesId || !currentArcId) {
    return;
  }
  const nextHash = `#${currentSeriesId}:${currentArcId}`;
  if (window.location.hash !== nextHash) {
    history.replaceState(null, '', nextHash);
  }
}

function syncFromHash() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) {
    populateSeriesPicker();
    return;
  }
  const [seriesId, arcId] = hash.split(':');
  if (!seriesId) return;
  currentSeriesId = seriesId;
  currentArcId = arcId || '';
  populateSeriesPicker();
  renderArcDetails();
}

function formatCell(value) {
  return value?.trim() ? escapeHtml(value) : '<span class="muted">—</span>';
}
