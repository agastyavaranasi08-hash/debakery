/**
 * @typedef {Object} Mapping
 * @property {string} id
 * @property {string} label
 * @property {string} manga
 * @property {string} ln
 * @property {string} anime
 * @property {string} notes
 *
 * @typedef {Object} Post
 * @property {string} id
 * @property {string|null} parentId
 * @property {string} text
 * @property {number} ts
 *
 * @typedef {Object} Arc
 * @property {string} id
 * @property {string} title
 * @property {string} summary
 * @property {number} rating
 * @property {Mapping[]} mappings
 * @property {Post[]} chat
 *
 * @typedef {Object} Series
 * @property {string} id
 * @property {string} name
 * @property {Arc[]} arcs
 *
 * @typedef {Object} Root
 * @property {Series[]} series
 */

const STORAGE_KEY = 'mla-data-v1';
let dbCache = null;

const SAMPLE_DB = /** @type {Root} */ ({
  series: [
    {
      id: 'series-chronicles',
      name: 'Chronicles of Aether',
      arcs: [
        {
          id: 'arc-aether-prologue',
          title: 'Prologue Sparks',
          summary: 'Introduces the Aer Guild and the inciting incident that splits the trio.',
          rating: 4,
          mappings: [
            {
              id: 'map-prologue-1',
              label: 'Inciting Incident',
              manga: 'Chapter 1',
              ln: 'Volume 1 - Chapter 1',
              anime: 'Episode 1',
              notes: 'Minor pacing tweaks in anime montage.'
            },
            {
              id: 'map-prologue-2',
              label: 'Guild Oath',
              manga: 'Chapter 2',
              ln: 'Volume 1 - Chapter 2',
              anime: '',
              notes: 'Anime omits the extended oath scene.'
            }
          ],
          chat: []
        },
        {
          id: 'arc-aether-delta',
          title: 'Delta Expedition',
          summary: 'The crew enters the storm delta to retrieve the prism core.',
          rating: 5,
          mappings: [
            {
              id: 'map-delta-1',
              label: 'Storm Entry',
              manga: 'Ch. 12-13',
              ln: 'Vol. 3 - Ch. 2',
              anime: 'Episode 8',
              notes: 'Anime condenses dialogue.'
            }
          ],
          chat: []
        }
      ]
    },
    {
      id: 'series-moonforge',
      name: 'Moonforge Saga',
      arcs: [
        {
          id: 'arc-moonforge-trials',
          title: 'Trials of the Moonforge',
          summary: 'Candidates face trials beneath the moonlit forge.',
          rating: 3,
          mappings: [],
          chat: []
        }
      ]
    }
  ]
});

/**
 * Escape HTML entities to safely render user text.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  const text = value ?? '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureDbLoaded() {
  if (dbCache) {
    return;
  }

  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.series)) {
        dbCache = parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to parse MLA cache, resetting.', error);
  }

  if (!dbCache) {
    dbCache = clone(SAMPLE_DB);
    saveDB();

    // Optional canonical load (disabled by default):
    // fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_DEFAULT_BRANCH}/data/mla-data.json`)
    //   .then((res) => res.ok ? res.json() : null)
    //   .then((remote) => {
    //     if (remote && remote.series) {
    //       updateDB(remote);
    //     }
    //   })
    //   .catch((err) => console.warn('Failed to fetch canonical MLA data.', err));
  }
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Obtain the live database reference (mutate with care).
 * @returns {Root}
 */
export function getDB() {
  ensureDbLoaded();
  return dbCache;
}

/**
 * Persist the current database to localStorage.
 */
export function saveDB() {
  if (typeof window === 'undefined' || !dbCache) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dbCache));
  } catch (error) {
    console.error('Unable to persist MLA cache.', error);
  }
}

/**
 * Replace the in-memory database and persist it.
 * @param {Root} next
 */
export function updateDB(next) {
  dbCache = next;
  saveDB();
}

/**
 * Generate a readable unique identifier.
 * @param {string} prefix
 * @returns {string}
 */
export function createId(prefix) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}

/**
 * Render the global navbar into the header element.
 */
export function renderNavbar() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const currentPath = window.location.pathname.split('/').pop();
  const links = [
    { href: 'index.html', label: 'Home' },
    { href: 'search.html', label: 'Search Engine' },
    { href: 'recommendations.html', label: 'Recommendations' },
    { href: 'mappings.html', label: 'Mappings' }
  ];
  header.innerHTML = `
    <nav>
      <div class="nav-brand">Manga–LN–Anime Linker</div>
      <ul class="nav-links">
        ${links
          .map(
            (link) =>
              `<li><a href="${link.href}" class="${link.href === currentPath ? 'active' : ''}">${link.label}</a></li>`
          )
          .join('')}
      </ul>
    </nav>
  `;
}

/**
 * Compute arc health status based on mapping completeness.
 * @param {Arc} arc
 * @returns {{status: 'OK'|'Gaps'|'Mismatched', label: string, missingCount: number}}
 */
export function computeArcHealth(arc) {
  const total = arc.mappings.length;
  if (total === 0) {
    return { status: 'Gaps', label: 'Gaps · No mappings yet', missingCount: 0 };
  }

  let missing = 0;
  let counts = { manga: 0, ln: 0, anime: 0 };
  for (const map of arc.mappings) {
    const hasManga = map.manga.trim().length > 0;
    const hasLn = map.ln.trim().length > 0;
    const hasAnime = map.anime.trim().length > 0;
    if (!hasManga || !hasLn || !hasAnime) {
      missing += 1;
    }
    if (hasManga) counts.manga += 1;
    if (hasLn) counts.ln += 1;
    if (hasAnime) counts.anime += 1;
  }

  const uniqueCounts = new Set(Object.values(counts));
  if (missing > 0) {
    return { status: 'Gaps', label: `Gaps · ${missing} incomplete row${missing === 1 ? '' : 's'}`, missingCount: missing };
  }
  if (uniqueCounts.size > 1) {
    return { status: 'Mismatched', label: 'Mismatched · Uneven chapter counts', missingCount: 0 };
  }
  return { status: 'OK', label: 'OK · Fully aligned', missingCount: 0 };
}

/**
 * Find a series by id.
 * @param {string} id
 * @returns {Series|undefined}
 */
export function getSeries(id) {
  return getDB().series.find((series) => series.id === id);
}

/**
 * Find an arc by series and arc id.
 * @param {string} seriesId
 * @param {string} arcId
 * @returns {Arc|undefined}
 */
export function getArc(seriesId, arcId) {
  const series = getSeries(seriesId);
  return series?.arcs.find((arc) => arc.id === arcId);
}

/**
 * Upload the current DB to the serverless endpoint.
 * @param {{authorName?: string, authorEmail?: string, message?: string}} [options]
 * @returns {Promise<{commitUrl: string}>}
 */
export async function pushDBToRepo(options = {}) {
  const response = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: getDB(), ...options })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Upload failed');
  }

  const payload = await response.json();
  if (!payload || typeof payload.commitUrl !== 'string') {
    throw new Error('Unexpected response from server.');
  }
  return payload;
}
