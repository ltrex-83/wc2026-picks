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
});
