import { renderNavbar, getDB, escapeHtml } from './common.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  const input = /** @type {HTMLInputElement} */ (document.getElementById('search-input'));
  const results = document.getElementById('search-results');
  if (!input || !results) return;

  const initialMessage = document.createElement('p');
  initialMessage.className = 'hint';
  initialMessage.textContent = 'Start typing to find matches across the MLA database.';
  results.appendChild(initialMessage);

  input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    if (!term) {
      results.innerHTML = '';
      results.appendChild(initialMessage.cloneNode(true));
      return;
    }
    renderResults(term, results);
  });
});

function renderResults(term, container) {
  const db = getDB();
  const matches = [];

  for (const series of db.series) {
    const seriesMatch = includes(series.name, term);
    if (seriesMatch) {
      matches.push({
        type: 'Series',
        title: series.name,
        description: `${series.arcs.length} arc${series.arcs.length === 1 ? '' : 's'}`,
        href: `mappings.html#${series.id}:${series.arcs[0]?.id ?? ''}`
      });
    }

    for (const arc of series.arcs) {
      const arcMatch = includes(arc.title, term) || includes(arc.summary, term);
      if (arcMatch) {
        matches.push({
          type: 'Arc',
          title: `${series.name} · ${arc.title}`,
          description: arc.summary ? truncate(arc.summary, 140) : 'No summary yet.',
          href: `mappings.html#${series.id}:${arc.id}`
        });
      }

      for (const mapping of arc.mappings) {
        if (
          includes(mapping.label, term) ||
          includes(mapping.manga, term) ||
          includes(mapping.ln, term) ||
          includes(mapping.anime, term) ||
          includes(mapping.notes, term)
        ) {
          matches.push({
            type: 'Mapping',
            title: `${mapping.label || 'Untitled Mapping'}`,
            description: `${series.name} · ${arc.title}`,
            href: `mappings.html#${series.id}:${arc.id}`
          });
        }
      }
    }
  }

  container.innerHTML = '';

  if (!matches.length) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = 'No results yet. Try another phrase or check spelling.';
    container.appendChild(message);
    return;
  }

  for (const match of matches.slice(0, 50)) {
    const item = document.createElement('article');
    item.className = 'result-item';
    item.setAttribute('role', 'listitem');

    const title = document.createElement('h3');
    title.innerHTML = `${escapeHtml(match.title)} <span class="result-meta">${escapeHtml(match.type)}</span>`;

    const description = document.createElement('p');
    description.className = 'hint';
    description.textContent = match.description;

    const link = document.createElement('a');
    link.href = match.href;
    link.textContent = 'Open in Mappings';

    item.appendChild(title);
    item.appendChild(description);
    item.appendChild(link);
    container.appendChild(item);
  }
}

function includes(value, term) {
  return Boolean(value && value.toLowerCase().includes(term));
}

function truncate(text, length) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
