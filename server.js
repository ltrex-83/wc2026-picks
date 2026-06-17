const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'picks.json');

app.use(express.json());

// CORS — open to all origins (API key provides security)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// API key auth
const API_KEY = process.env.API_KEY || 'wc2026picks2026';
function requireKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Match kickoff schedule (UTC) — used to schedule auto-refreshes ────
const KICKOFFS = {
  'A-0':'2026-06-11T19:00:00Z','A-1':'2026-06-12T02:00:00Z',
  'A-2':'2026-06-19T01:00:00Z','A-3':'2026-06-18T16:00:00Z',
  'A-4':'2026-06-25T01:00:00Z','A-5':'2026-06-25T01:00:00Z',
  'B-0':'2026-06-12T19:00:00Z','B-1':'2026-06-13T19:00:00Z',
  'B-2':'2026-06-24T19:00:00Z','B-3':'2026-06-24T19:00:00Z',
  'B-4':'2026-06-18T22:00:00Z','B-5':'2026-06-18T19:00:00Z',
  'C-0':'2026-06-13T22:00:00Z','C-1':'2026-06-14T01:00:00Z',
  'C-2':'2026-06-24T22:00:00Z','C-3':'2026-06-24T22:00:00Z',
  'C-4':'2026-06-20T00:30:00Z','C-5':'2026-06-19T22:00:00Z',
  'D-0':'2026-06-13T01:00:00Z','D-1':'2026-06-13T04:00:00Z',
  'D-2':'2026-06-19T19:00:00Z','D-3':'2026-06-20T03:00:00Z',
  'D-4':'2026-06-26T02:00:00Z','D-5':'2026-06-26T02:00:00Z',
  'E-0':'2026-06-14T17:00:00Z','E-1':'2026-06-14T23:00:00Z',
  'E-2':'2026-06-20T20:00:00Z','E-3':'2026-06-21T00:00:00Z',
  'E-4':'2026-06-25T20:00:00Z','E-5':'2026-06-25T20:00:00Z',
  'F-0':'2026-06-14T20:00:00Z','F-1':'2026-06-15T02:00:00Z',
  'F-2':'2026-06-20T17:00:00Z','F-3':'2026-06-21T04:00:00Z',
  'F-4':'2026-06-25T23:00:00Z','F-5':'2026-06-25T23:00:00Z',
  'G-0':'2026-06-15T19:00:00Z','G-1':'2026-06-16T01:00:00Z',
  'G-2':'2026-06-21T19:00:00Z','G-3':'2026-06-22T01:00:00Z',
  'G-4':'2026-06-27T03:00:00Z','G-5':'2026-06-27T03:00:00Z',
  'H-0':'2026-06-15T16:00:00Z','H-1':'2026-06-15T22:00:00Z',
  'H-2':'2026-06-21T16:00:00Z','H-3':'2026-06-21T22:00:00Z',
  'H-4':'2026-06-27T00:00:00Z','H-5':'2026-06-27T00:00:00Z',
  'I-0':'2026-06-16T19:00:00Z','I-1':'2026-06-16T22:00:00Z',
  'I-2':'2026-06-26T19:00:00Z','I-3':'2026-06-26T19:00:00Z',
  'I-4':'2026-06-22T21:00:00Z','I-5':'2026-06-23T00:00:00Z',
  'J-0':'2026-06-17T01:00:00Z','J-1':'2026-06-17T04:00:00Z',
  'J-2':'2026-06-22T17:00:00Z','J-3':'2026-06-23T03:00:00Z',
  'J-4':'2026-06-28T02:00:00Z','J-5':'2026-06-28T02:00:00Z',
  'K-0':'2026-06-17T17:00:00Z','K-1':'2026-06-18T02:00:00Z',
  'K-2':'2026-06-23T17:00:00Z','K-3':'2026-06-24T02:00:00Z',
  'K-4':'2026-06-27T23:30:00Z','K-5':'2026-06-27T23:30:00Z',
  'L-0':'2026-06-17T20:00:00Z','L-1':'2026-06-17T23:00:00Z',
  'L-2':'2026-06-23T21:00:00Z','L-3':'2026-06-24T00:00:00Z',
  'L-4':'2026-06-28T00:00:00Z','L-5':'2026-06-28T00:00:00Z',
};

const K_KICKOFFS = {
  'R32': '2026-06-28T18:00:00Z',
  'R16': '2026-07-04T18:00:00Z',
  'QF':  '2026-07-09T18:00:00Z',
  'SF':  '2026-07-14T18:00:00Z',
  'F':   '2026-07-19T19:00:00Z',
};

// Data helpers
const SEED_ACTUALS = {
  'A-0':'t1','A-1':'t1',
  'B-0':'draw','B-1':'draw',
  'C-0':'draw','C-1':'t1',
  'D-0':'t1','D-1':'t1',
  'E-0':'t1','E-1':'t1',
  'F-0':'draw','F-1':'t1',
  'G-0':'draw','G-1':'draw',
  'H-0':'draw','H-1':'draw',
  'I-0':'t1'
};

function defaultState() {
  return {
    gPicks: { 1: {}, 2: {} },
    kPicks: { 1: {}, 2: {} },
    gActuals: Object.assign({}, SEED_ACTUALS),
    kActuals: {},
    lastUpdated: new Date().toISOString()
  };
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultState();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.gActuals = Object.assign({}, SEED_ACTUALS, parsed.gActuals || {});
    return parsed;
  } catch (e) {
    console.error('Read error:', e.message);
    return defaultState();
  }
}

function writeData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Write error:', e.message);
    return false;
  }
}

// Routes

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/state', requireKey, (req, res) => {
  const data = readData();
  res.json(data);
});

app.post('/api/pick/group', requireKey, (req, res) => {
  const { player, key, result, override } = req.body;
  if (!player || !key || !result) return res.status(400).json({ error: 'Missing fields' });
  if (![1, 2].includes(Number(player))) return res.status(400).json({ error: 'Invalid player' });
  if (!['t1', 't2', 'draw'].includes(result)) return res.status(400).json({ error: 'Invalid result' });

  const data = readData();
  const p = String(player);

  if (!override && data.gPicks[p] && data.gPicks[p][key] !== undefined) {
    return res.status(409).json({ error: 'Pick already locked', existing: data.gPicks[p][key] });
  }

  if (!data.gPicks[p]) data.gPicks[p] = {};
  const previous = data.gPicks[p][key];
  data.gPicks[p][key] = result;

  if (override && previous !== undefined) {
    if (!data.corrections) data.corrections = [];
    data.corrections.push({ player, key, from: previous, to: result, at: new Date().toISOString() });
  }

  if (!writeData(data)) return res.status(500).json({ error: 'Write failed' });
  res.json({ success: true, key, result, player, corrected: !!override });
});

app.post('/api/pick/knockout', requireKey, (req, res) => {
  const { player, key, team, override } = req.body;
  if (!player || !key || !team) return res.status(400).json({ error: 'Missing fields' });
  if (![1, 2].includes(Number(player))) return res.status(400).json({ error: 'Invalid player' });

  const data = readData();
  const p = String(player);

  if (!override && data.kPicks[p] && data.kPicks[p][key] !== undefined) {
    return res.status(409).json({ error: 'Pick already locked', existing: data.kPicks[p][key] });
  }

  if (!data.kPicks[p]) data.kPicks[p] = {};
  const previous = data.kPicks[p][key];
  data.kPicks[p][key] = team;

  if (override && previous !== undefined) {
    if (!data.corrections) data.corrections = [];
    data.corrections.push({ player, key, from: previous, to: team, at: new Date().toISOString() });
  }

  if (!writeData(data)) return res.status(500).json({ error: 'Write failed' });
  res.json({ success: true, key, team, player, corrected: !!override });
});

app.post('/api/actuals', requireKey, (req, res) => {
  const { group, knockout } = req.body;
  const data = readData();
  if (group) Object.assign(data.gActuals, group);
  if (knockout) Object.assign(data.kActuals, knockout);
  if (!writeData(data)) return res.status(500).json({ error: 'Write failed' });
  res.json({ success: true, gActuals: data.gActuals, kActuals: data.kActuals });
});

app.listen(PORT, () => {
  console.log(`WC2026 API running on port ${PORT}`);
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) writeData(defaultState());
  startScheduler();
});

// ── Core refresh logic — shared by manual button + scheduler ──────────
async function performRefresh() {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for all completed 2026 FIFA World Cup match results. Return ONLY valid JSON with two keys: "group" and "knockout".

"group" keys: "A-0" to "L-5". Match index per group: 0=[t1 vs t2], 1=[t3 vs t4], 2=[t1 vs t3], 3=[t2 vs t4], 4=[t1 vs t4], 5=[t2 vs t3].
Teams: A=[Mexico,SouthAfrica,SouthKorea,Czechia] B=[Canada,Bosnia,Switzerland,Qatar] C=[Brazil,Morocco,Scotland,Haiti] D=[USA,Paraguay,Australia,Turkiye] E=[Germany,Curacao,IvoryCoast,Ecuador] F=[Netherlands,Japan,Sweden,Tunisia] G=[Belgium,Egypt,Iran,NewZealand] H=[Spain,CapeVerde,SaudiArabia,Uruguay] I=[France,Senegal,Norway,Iraq] J=[Argentina,Algeria,Austria,Jordan] K=[Portugal,DRCongo,Uzbekistan,Colombia] L=[England,Croatia,Ghana,Panama]
Values: "t1"=first team wins, "t2"=second team wins, "draw"=draw. Only completed matches.

"knockout" keys: "R32-0" to "R32-15", "R16-0" to "R16-7", "QF-0" to "QF-3", "SF-0" to "SF-1", "F-0".
Value = exact winning team name string. Only completed knockout matches.

Return pure JSON only. No markdown fences.`
      }]
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error('Anthropic API error: ' + (data.error.message || JSON.stringify(data.error)));
  }

  let raw = '';
  for (const c of (data.content || [])) {
    if (c.type === 'text') raw += c.text;
  }

  if (!raw || !raw.trim()) {
    throw new Error('Empty response from search');
  }

  let jsonStr = raw.replace(/```json|```/g, '').trim();
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON found in response: ' + raw.slice(0, 300));
  }
  jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(jsonStr);

  const state = readData();
  if (parsed.group) Object.assign(state.gActuals, parsed.group);
  if (parsed.knockout) Object.assign(state.kActuals, parsed.knockout);
  writeData(state);

  return { group: parsed.group || {}, knockout: parsed.knockout || {} };
}

// ── Manual refresh endpoint (button in the UI) ─────────────────────────
app.post('/api/refresh', requireKey, async (req, res) => {
  try {
    const result = await performRefresh();
    res.json({ success: true, ...result, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('Refresh error:', e.message);
    res.status(500).json({ error: 'Refresh failed', detail: e.message });
  }
});

// ── Scheduled auto-refresh based on match kickoff times ────────────────
// Triggers a refresh 2.5h and 3.5h after each scheduled kickoff
// (covers normal match length + stoppage time, plus a late-results safety net)
function buildRefreshTimestamps() {
  const allKickoffs = [
    ...Object.values(KICKOFFS),
    ...Object.values(K_KICKOFFS)
  ];
  const triggers = new Set();
  allKickoffs.forEach(ko => {
    const t = new Date(ko).getTime();
    triggers.add(t + 2.5 * 60 * 60 * 1000); // 2.5h after kickoff
    triggers.add(t + 3.5 * 60 * 60 * 1000); // 3.5h after kickoff (safety net)
  });
  return [...triggers].sort((a, b) => a - b);
}

let firedTriggers = new Set();

function startScheduler() {
  const triggers = buildRefreshTimestamps();
  console.log(`Scheduler armed with ${triggers.length} refresh checkpoints`);

  // Check every 5 minutes whether any trigger time has just passed
  setInterval(async () => {
    const now = Date.now();
    for (const t of triggers) {
      if (now >= t && now < t + 6 * 60 * 1000 && !firedTriggers.has(t)) {
        firedTriggers.add(t);
        console.log(`Scheduled refresh firing for checkpoint ${new Date(t).toISOString()}`);
        try {
          await performRefresh();
          console.log('Scheduled refresh succeeded');
        } catch (e) {
          console.error('Scheduled refresh failed:', e.message);
        }
      }
    }
  }, 5 * 60 * 1000); // check every 5 minutes
}
