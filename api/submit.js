const {
  GITHUB_TOKEN,
  REPO_OWNER,
  REPO_NAME,
  REPO_DEFAULT_BRANCH
} = process.env;

const DEFAULT_PATH = 'data/mla-data.json';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME || !REPO_DEFAULT_BRANCH) {
    res.status(500).json({ error: 'Missing GitHub configuration.' });
    return;
  }

  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
    }
  } catch (error) {
    res.status(400).json({ error: 'Unable to read request body.' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON payload.' });
    return;
  }

  if (!payload.db || typeof payload.db !== 'object') {
    res.status(400).json({ error: 'Payload missing "db" object.' });
    return;
  }

  const path = typeof payload.path === 'string' && payload.path.length ? payload.path : DEFAULT_PATH;
  const message = payload.message || 'Update MLA data';
  const authorName = payload.authorName || 'MLA Contributor';
  const authorEmail = payload.authorEmail || 'mla@example.com';

  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  try {
    const existing = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${REPO_DEFAULT_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'mla-linker-bot'
        }
      }
    );

    let sha;
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    } else if (existing.status !== 404) {
      const errorText = await existing.text();
      throw new Error(`Failed to read existing file: ${errorText}`);
    }

    const content = Buffer.from(JSON.stringify(payload.db, null, 2)).toString('base64');

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'mla-linker-bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          content,
          sha,
          branch: REPO_DEFAULT_BRANCH,
          committer: {
            name: authorName,
            email: authorEmail
          },
          author: {
            name: authorName,
            email: authorEmail
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub commit failed: ${errorText}`);
    }

    const json = await response.json();
    res.status(200).json({ commitUrl: json.commit.html_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
};
