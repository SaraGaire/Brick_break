import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { nanoid } from 'nanoid';

const PORT = process.env.PORT || 4000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

async function ensureDir(p) {
  try { await fs.mkdir(p, { recursive: true }); } catch {}
}

function playerFile(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

async function readPlayer(id) {
  await ensureDir(DATA_DIR);
  try {
    const raw = await fs.readFile(playerFile(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      playerId: id,
      stats: { correct: 0, total: 0, streak: 0, stickers: [], updatedAt: Date.now() },
      learned: [],   // {de,en,colorName}
      history: []    // events: {type, payload, ts}
    };
  }
}

async function writePlayer(id, data) {
  await ensureDir(DATA_DIR);
  data.stats.updatedAt = Date.now();
  await fs.writeFile(playerFile(id), JSON.stringify(data, null, 2), 'utf8');
}

function getPlayerId(req) {
  const id = (req.header('x-player-id') || '').trim();
  return id || null;
}

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Generate a new player id (optional convenience)
app.post('/api/new-player', async (_req, res) => {
  const id = nanoid(12);
  const data = await readPlayer(id);
  await writePlayer(id, data);
  res.json({ playerId: id });
});

// Load full snapshot (stats + learned + stickers)
app.get('/api/load', async (req, res) => {
  const id = getPlayerId(req);
  if (!id) return res.status(400).json({ error: 'Missing x-player-id header' });
  const data = await readPlayer(id);
  res.json(data);
});

// Save partial snapshot (merge fields)
app.post('/api/save', async (req, res) => {
  const id = getPlayerId(req);
  if (!id) return res.status(400).json({ error: 'Missing x-player-id header' });

  const incoming = req.body || {};
  const current = await readPlayer(id);

  // Merge stats
  if (incoming.stats) {
    current.stats.correct = incoming.stats.correct ?? current.stats.correct;
    current.stats.total   = incoming.stats.total   ?? current.stats.total;
    current.stats.streak  = incoming.stats.streak  ?? current.stats.streak;
    if (Array.isArray(incoming.stats.stickers)) {
      const set = new Set([...(current.stats.stickers || []), ...incoming.stats.stickers]);
      current.stats.stickers = [...set];
    }
  }

  // Merge learned words (unique by de)
  if (Array.isArray(incoming.learned)) {
    const byDe = new Map((current.learned || []).map(w => [w.de, w]));
    for (const w of incoming.learned) {
      if (w?.de) byDe.set(w.de, w);
    }
    current.learned = Array.from(byDe.values());
  }

  // History events
  if (Array.isArray(incoming.history)) {
    current.history = (current.history || []).concat(
      incoming.history.map(e => ({ ...e, ts: e.ts || Date.now() }))
    ).slice(-1000); // keep last 1000
  }

  await writePlayer(id, current);
  res.json({ ok: true });
});

// Record an event (quiz, sticker, etc.)
app.post('/api/event', async (req, res) => {
  const id = getPlayerId(req);
  if (!id) return res.status(400).json({ error: 'Missing x-player-id header' });
  const current = await readPlayer(id);
  const ev = { type: req.body?.type || 'event', payload: req.body?.payload || {}, ts: Date.now() };
  current.history = (current.history || []).concat(ev).slice(-1000);

  // Stickers shortcut
  if (ev.type === 'sticker' && ev.payload?.name) {
    const stickers = new Set(current.stats.stickers || []);
    stickers.add(ev.payload.name);
    current.stats.stickers = [...stickers];
  }

  await writePlayer(id, current);
  res.json({ ok: true });
});

// Get sticker gallery
app.get('/api/stickers', async (req, res) => {
  const id = getPlayerId(req);
  if (!id) return res.status(400).json({ error: 'Missing x-player-id header' });
  const current = await readPlayer(id);
  res.json({ stickers: current.stats.stickers || [] });
});

app.listen(PORT, () => {
  console.log(`Word Breaker backend running on http://localhost:${PORT}`);
});
