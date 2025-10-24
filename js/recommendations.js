import { renderNavbar, getDB, computeArcHealth } from './common.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  populateLists();
});

function populateLists() {
  const db = getDB();
  const priorityList = document.getElementById('priority-fixes');
  const inconsistenciesList = document.getElementById('inconsistencies');
  const topRatedList = document.getElementById('top-rated');
  if (!priorityList || !inconsistenciesList || !topRatedList) return;

  const gaps = [];
  const mismatches = [];
  const highRated = [];

  for (const series of db.series) {
    for (const arc of series.arcs) {
      const health = computeArcHealth(arc);
      if (health.status === 'Gaps') {
        gaps.push({ series, arc, health });
      } else if (health.status === 'Mismatched') {
        mismatches.push({ series, arc, health });
      }
      if (arc.rating >= 4) {
        highRated.push({ series, arc, health });
      }
    }
  }

  gaps.sort((a, b) => b.health.missingCount - a.health.missingCount);
  mismatches.sort((a, b) => b.arc.mappings.length - a.arc.mappings.length);
  highRated.sort((a, b) => b.arc.rating - a.arc.rating || b.arc.mappings.length - a.arc.mappings.length);

  renderSection(priorityList, gaps, (item) => {
    const missingLabel = item.health.missingCount
      ? `${item.health.missingCount} incomplete mapping${item.health.missingCount === 1 ? '' : 's'}`
      : 'Needs initial mappings';
    return `${missingLabel} · ${item.arc.mappings.length} rows total`;
  });

  renderSection(inconsistenciesList, mismatches, (item) => {
    return `Uneven coverage · ${item.arc.mappings.length} rows`;
  });

  renderSection(topRatedList, highRated, (item) => {
    return `Rating ${item.arc.rating}/5 · ${item.arc.mappings.length} mappings`;
  });
}

function renderSection(container, entries, describe) {
  container.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'hint';
    empty.textContent = 'No items yet. Keep building your mappings!';
    container.appendChild(empty);
    return;
  }

  for (const entry of entries.slice(0, 10)) {
    const item = document.createElement('li');
    item.className = 'recommendation-item';

    const title = document.createElement('strong');
    title.textContent = `${entry.series.name} · ${entry.arc.title}`;

    const details = document.createElement('p');
    details.className = 'hint';
    details.textContent = describe(entry);

    const link = document.createElement('a');
    link.href = `mappings.html#${entry.series.id}:${entry.arc.id}`;
    link.textContent = 'Open in Mappings';

    item.appendChild(title);
    item.appendChild(details);
    item.appendChild(link);
    container.appendChild(item);
  }
}
