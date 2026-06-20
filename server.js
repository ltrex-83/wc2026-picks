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

// ── Core refresh logic — two-step approach ────────────────────────────
// Step 1: Search for results, get plain-text summary (cheap, no JSON needed)
// Step 2: Convert summary to JSON (no search tool, fast and predictable)
// This eliminates truncation risk entirely — JSON output step has no tool
// overhead eating into its token budget.
async function performRefresh() {

  const now = new Date();
  const todayStr = now.toUTCString(); // e.g. "Thu, 19 Jun 2026 05:00:00 GMT"

  // ── Step 1: Search for match results ──────────────────────────────────
  const searchResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `The current date and time is ${todayStr}.

Search for 2026 FIFA World Cup match results. List ONLY matches that meet ALL of these criteria:
1. The match has FULLY FINISHED — final whistle blown, result confirmed as full-time (FT)
2. The match kickoff time was BEFORE the current date/time above
3. You found an ACTUAL SCORE (e.g. "2-1", "0-0") — not a prediction, preview, or fixture listing

Do NOT include:
- Matches that are scheduled but haven't kicked off yet
- Matches that are live, in-progress, or at half-time
- Predicted scores or match previews
- Any match whose kickoff is in the future relative to the current time above

For each qualifying finished match write one line: "GroupLetter-MatchIndex: Team1 score-score Team2 [FT]"
If you cannot confirm a match has finished with an actual score, omit it entirely.
Keep your response brief — only the confirmed finished match lines, nothing else.`
      }]
    })
  });

  const searchData = await searchResp.json();
  if (searchData.error) {
    throw new Error('Search step error: ' + (searchData.error.message || JSON.stringify(searchData.error)));
  }

  let summary = '';
  for (const c of (searchData.content || [])) {
    if (c.type === 'text') summary += c.text;
  }

  if (!summary.trim()) {
    throw new Error('Empty response from search step');
  }

  // ── Step 2: Convert summary to JSON (no search tool) ──────────────────
  const jsonResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Convert these World Cup results into a JSON object. Output ONLY the JSON — no explanation, no markdown, no code fences. Start with { and end with }.

Match key format:
- Group matches: "A-0" to "L-5"
  Match index per group: 0=[t1 vs t2], 1=[t3 vs t4], 2=[t1 vs t3], 3=[t2 vs t4], 4=[t1 vs t4], 5=[t2 vs t3]
  Teams per group:
  A=[Mexico,SouthAfrica,SouthKorea,Czechia] B=[Canada,Bosnia,Switzerland,Qatar]
  C=[Brazil,Morocco,Scotland,Haiti] D=[USA,Paraguay,Australia,Turkiye]
  E=[Germany,Curacao,IvoryCoast,Ecuador] F=[Netherlands,Japan,Sweden,Tunisia]
  G=[Belgium,Egypt,Iran,NewZealand] H=[Spain,CapeVerde,SaudiArabia,Uruguay]
  I=[France,Senegal,Norway,Iraq] J=[Argentina,Algeria,Austria,Jordan]
  K=[Portugal,DRCongo,Uzbekistan,Colombia] L=[England,Croatia,Ghana,Panama]
  Values: "t1"=first team won, "t2"=second team won, "draw"=draw

- Knockout matches: "R32-0" to "R32-15", "R16-0" to "R16-7", "QF-0" to "QF-3", "SF-0" to "SF-1", "F-0"
  Value = exact winning team name string

JSON structure: {"group":{"A-0":"t1",...},"knockout":{}}

Results to convert:
${summary}`
      }]
    })
  });

  const jsonData = await jsonResp.json();
  if (jsonData.error) {
    throw new Error('JSON step error: ' + (jsonData.error.message || JSON.stringify(jsonData.error)));
  }

  let raw = '';
  for (const c of (jsonData.content || [])) {
    if (c.type === 'text') raw += c.text;
  }

  if (!raw.trim()) {
    throw new Error('Empty response from JSON conversion step');
  }

  // Extract JSON object even if there's any stray surrounding text
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON object found in conversion response: ' + raw.slice(0, 200));
  }
  const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));

  // ── Append-only merge: never overwrite an already-recorded result ──────
  const state = readData();
  const newGroupResults = {};
  const newKnockoutResults = {};

  if (parsed.group) {
    for (const [k, v] of Object.entries(parsed.group)) {
      // Never record a result for a match that hasn't kicked off yet
      const kickoff = KICKOFFS[k];
      if (kickoff && Date.now() < new Date(kickoff).getTime() + 90 * 60 * 1000) {
        console.warn(`Skipping ${k} — kickoff hasn't passed minimum match time yet`);
        continue;
      }
      if (state.gActuals[k] === undefined) {
        state.gActuals[k] = v;
        newGroupResults[k] = v;
      }
    }
  }
  if (parsed.knockout) {
    for (const [k, v] of Object.entries(parsed.knockout)) {
      const rnd = k.split('-')[0];
      const kickoff = K_KICKOFFS[rnd];
      if (kickoff && Date.now() < new Date(kickoff).getTime() + 90 * 60 * 1000) {
        console.warn(`Skipping ${k} — knockout round hasn't reached minimum match time yet`);
        continue;
      }
      if (state.kActuals[k] === undefined) {
        state.kActuals[k] = v;
        newKnockoutResults[k] = v;
      }
    }
  }

  writeData(state);
  return { group: newGroupResults, knockout: newKnockoutResults };
}

// ── View current actuals (so you can spot bad entries) ─────────────────
app.get('/api/actuals', requireKey, (req, res) => {
  const data = readData();
  res.json({
    gActuals: data.gActuals,
    kActuals: data.kActuals,
    totalGroup: Object.keys(data.gActuals).length,
    totalKnockout: Object.keys(data.kActuals).length
  });
});

// ── Delete a single bad actual result ──────────────────────────────────
// Body: { key: "A-0", type: "group" } or { key: "R32-0", type: "knockout" }
app.post('/api/actuals/delete', requireKey, (req, res) => {
  const { key, type } = req.body;
  if (!key || !type) return res.status(400).json({ error: 'Missing key or type' });
  const data = readData();
  if (type === 'group') {
    if (data.gActuals[key] === undefined) return res.status(404).json({ error: 'Key not found' });
    const old = data.gActuals[key];
    delete data.gActuals[key];
    writeData(data);
    res.json({ success: true, deleted: key, was: old });
  } else if (type === 'knockout') {
    if (data.kActuals[key] === undefined) return res.status(404).json({ error: 'Key not found' });
    const old = data.kActuals[key];
    delete data.kActuals[key];
    writeData(data);
    res.json({ success: true, deleted: key, was: old });
  } else {
    res.status(400).json({ error: 'type must be "group" or "knockout"' });
  }
});

// ── Reset ALL actuals back to seeded defaults ───────────────────────────
// Use this to wipe bad entries and start fresh from known correct results.
app.post('/api/reset-actuals', requireKey, (req, res) => {
  const data = readData();
  data.gActuals = Object.assign({}, SEED_ACTUALS);
  data.kActuals = {};
  writeData(data);
  res.json({ success: true, message: 'Actuals reset to seeded defaults', gActuals: data.gActuals });
});


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
// ONE check per match, 3h after kickoff (covers 90min + stoppage + buffer).
// Only fires on days that actually have matches — zero wasted calls on quiet days.
function buildRefreshTimestamps() {
  const allKickoffs = [
    ...Object.values(KICKOFFS),
    ...Object.values(K_KICKOFFS)
  ];
  // One trigger per unique kickoff time, 3h after the match starts.
  // Using a Set of kickoff times first removes duplicates (e.g. simultaneous
  // final-matchday games share a kickoff slot — only one API call needed).
  const uniqueKickoffs = [...new Set(allKickoffs)];
  const triggers = uniqueKickoffs.map(ko => new Date(ko).getTime() + 3 * 60 * 60 * 1000);
  return triggers.sort((a, b) => a - b);
}

// Days (UTC date strings) that have at least one match — scheduler only
// wakes up the check loop on these days to avoid unnecessary polling.
function buildMatchDays() {
  const allKickoffs = [
    ...Object.values(KICKOFFS),
    ...Object.values(K_KICKOFFS)
  ];
  const days = new Set(allKickoffs.map(ko => ko.slice(0, 10))); // "YYYY-MM-DD"
  return days;
}

const MATCH_DAYS = buildMatchDays();
let firedTriggers = new Set();

function startScheduler() {
  const triggers = buildRefreshTimestamps();
  console.log(`Scheduler armed with ${triggers.length} checkpoints across ${MATCH_DAYS.size} match days`);

  // Check every 5 minutes, but only do the full trigger scan on match days
  setInterval(async () => {
    const now = Date.now();
    const todayUTC = new Date().toISOString().slice(0, 10);

    // Skip processing entirely on non-match days
    if (!MATCH_DAYS.has(todayUTC)) return;

    for (const t of triggers) {
      // Only fire if:
      // 1. The trigger time has passed (match is 3h old)
      // 2. We're within the 6-minute fire window
      // 3. We haven't already fired this trigger
      // 4. The trigger is in the past (guards against clock skew or bad data)
      if (now >= t && now < t + 6 * 60 * 1000 && !firedTriggers.has(t) && t < now) {
        firedTriggers.add(t);
        console.log(`Scheduled refresh firing (checkpoint ${new Date(t).toISOString()})`);
        try {
          await performRefresh();
          console.log('Scheduled refresh succeeded');
        } catch (e) {
          console.error('Scheduled refresh failed:', e.message);
        }
      }
    }
  }, 5 * 60 * 1000); // poll every 5 minutes
}
