
// This is the Backend Integration
const API_BASE = "http://localhost:4000";
const PLAYER_ID_KEY = "dlw_player_id";

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}
const PLAYER_ID = getOrCreatePlayerId();
const headers = () => ({
  "Content-Type": "application/json",
  "x-player-id": PLAYER_ID,
});

async function apiLoad() {
  try {
    const res = await fetch(`${API_BASE}/api/load`, { headers: headers() });
    if (!res.ok) throw new Error("load failed");
    return await res.json();
  } catch {
    return null;
  }
}

async function apiSave(payload) {
  try {
    await fetch(`${API_BASE}/api/save`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });
  } catch {}
}

async function apiEvent(type, payload = {}) {
  try {
    await fetch(`${API_BASE}/api/event`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ type, payload }),
    });
  } catch {}
}

// ---------- Game Data ----------
const LEVELS = [
  [
    { de: "HALLO", en: "hello" },
    { de: "TSCHÜSS", en: "bye" },
    { de: "BITTE", en: "please" },
    { de: "DANKE", en: "thanks" },
    { de: "JA", en: "yes" },
    { de: "NEIN", en: "no" },
    { de: "FREUND", en: "friend" },
    { de: "APFEL", en: "apple" },
    { de: "BROT", en: "bread" },
    { de: "WASSER", en: "water" },
  ],
  [
    { de: "KATZE", en: "cat" },
    { de: "HUND", en: "dog" },
    { de: "VOGEL", en: "bird" },
    { de: "FISCH", en: "fish" },
    { de: "BAUM", en: "tree" },
    { de: "BLUME", en: "flower" },
    { de: "SONNE", en: "sun" },
    { de: "MOND", en: "moon" },
  ],
  [
    { de: "ROT", en: "red" },
    { de: "BLAU", en: "blue" },
    { de: "GRÜN", en: "green" },
    { de: "GELB", en: "yellow" },
    { de: "GROSS", en: "big" },
    { de: "KLEIN", en: "small" },
    { de: "SCHNELL", en: "fast" },
    { de: "LANGSAM", en: "slow" },
  ],
];

const COLORS = ["#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff"];
const COLORN = ["red", "orange", "yellow", "green", "blue"];

// ---------- Game Setup ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
  streak: document.getElementById("streak"),
  overlay: document.getElementById("overlay"),
  ovTitle: document.getElementById("ovTitle"),
  ovText: document.getElementById("ovText"),
  startBtn: document.getElementById("startBtn"),
  howBtn: document.getElementById("howBtn"),
  soundToggle: document.getElementById("soundToggle"),
  syncBtn: document.getElementById("syncBtn"),
  lists: {
    red: document.getElementById("redList"),
    orange: document.getElementById("orangeList"),
    yellow: document.getElementById("yellowList"),
    green: document.getElementById("greenList"),
    blue: document.getElementById("blueList"),
  },
  quiz: document.getElementById("quiz"),
  qWord: document.getElementById("qWord"),
  optionsDiv: document.getElementById("options"),
  reward: document.getElementById("reward"),
  summary: document.getElementById("summary"),
  statText: document.getElementById("statText"),
  summaryClose: document.getElementById("summaryClose"),
};

// ---------- Audio ----------
const AC = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq = 600, dur = 0.07, type = "sine", gain = 0.08) {
  if (!ui.soundToggle.checked) return;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(AC.destination);
  o.start();
  o.stop(AC.currentTime + dur);
}

// ---------- State ----------
const state = {
  score: 0,
  lives: 3,
  level: 1,
  streak: 0,
  started: false,
  paused: true,
  gameOver: false,
  paddle: { x: canvas.width / 2 - 60, y: canvas.height - 36, w: 120, h: 16, v: 8 },
  balls: [{ x: canvas.width / 2, y: canvas.height / 2, r: 8, dx: 4, dy: -4, speed: 4 }],
  bricks: [],
  particles: [],
  popups: [],
  powerups: [],
  learned: { red: [], orange: [], yellow: [], green: [], blue: [] },
  stats: { correct: 0, total: 0 },
};

// ---------- Utility ----------
function shuffle(a) {
  return [...a].sort(() => Math.random() - 0.5);
}
function updateHUD() {
  ui.score.textContent = state.score;
  ui.lives.textContent = state.lives;
  ui.level.textContent = state.level;
  ui.streak.textContent = state.streak;
}

// ---------- Game Layout ----------
const ROWS = 5, COLS = 11, BW = 72, BH = 28, P = 6, TOP = 60;

function layoutBricks() {
  state.bricks.length = 0;
  let words = LEVELS[Math.min(state.level - 1, LEVELS.length - 1)];
  words = shuffle(words);
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      state.bricks.push({
        x: c * (BW + P) + P,
        y: r * (BH + P) + TOP,
        w: BW,
        h: BH,
        color: COLORS[r % COLORS.length],
        cname: COLORN[r % COLORN.length],
        word: words[i % words.length],
        alive: true,
      });
      i++;
    }
  }
}

// ---------- Overlay ----------
function showOverlay(title, txt) {
  ui.ovTitle.textContent = title;
  ui.ovText.innerHTML = txt;
  ui.overlay.style.display = "grid";
}
function hideOverlay() {
  ui.overlay.style.display = "none";
}

// ---------- Learning ----------
function addLearned(word, color) {
  const list = state.learned[color];
  if (!list.find((w) => w.de === word.de)) list.push(word);
  renderLearned();
  persist({ learned: flattenLearned() });
}

function renderLearned() {
  for (const c of Object.keys(state.learned)) {
    const el = ui.lists[c];
    el.innerHTML = "";
    if (state.learned[c].length === 0) {
      el.innerHTML = '<span style="opacity:.6">— leer —</span>';
      continue;
    }
    state.learned[c].forEach((w) => {
      const d = document.createElement("div");
      d.className = "tag";
      d.innerHTML = `<span class="de">${w.de}</span><span class="en">(${w.en})</span>`;
      el.appendChild(d);
    });
  }
}

function flattenLearned() {
  return Object.entries(state.learned).flatMap(([c, arr]) =>
    arr.map((w) => ({ ...w, colorName: c }))
  );
}

// ---------- Particles ----------
function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * 3,
      vy: Math.sin(angle) * 3,
      life: 60,
      color,
    });
  }
}

function updateParticles() {
  state.particles = state.particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    return p.life > 0;
  });
}

function drawParticles() {
  state.particles.forEach((p) => {
    ctx.globalAlpha = p.life / 60;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;
}

// ---------- Popups ----------
function showPopup(x, y, text, color = "#fff") {
  state.popups.push({ x, y, text, color, life: 60, vy: -1 });
}

function updatePopups() {
  state.popups = state.popups.filter((p) => {
    p.y += p.vy;
    p.life--;
    return p.life > 0;
  });
}

function drawPopups() {
  state.popups.forEach((p) => {
    ctx.globalAlpha = p.life / 60;
    ctx.fillStyle = p.color;
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
  });
  ctx.globalAlpha = 1;
}

// ---------- Game Start ----------
function resetBall() {
  const b = state.balls[0];
  b.x = canvas.width / 2;
  b.y = canvas.height / 2;
  b.dx = 4;
  b.dy = -4;
  state.paused = true;
  showOverlay(`Level ${state.level}`, "Drücke <b>Leertaste</b> zum Start!");
}

function nextLevel() {
  state.level++;
  state.lives = Math.min(state.lives + 1, 5);
  layoutBricks();
  resetBall();
  updateHUD();
  persist();
}

function gameOver() {
  state.gameOver = true;
  state.paused = true;
  showOverlay("Game Over!", `Punkte: ${state.score}<br>Level: ${state.level}`);
  showSummary();
  persist();
}

// ---------- Input ----------
const keys = {};
document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === " ") {
    e.preventDefault();
    if (state.gameOver) return;
    state.paused = !state.paused;
    state.started = true;
    state.paused ? showOverlay("Pause", "Weiter mit <b>Leertaste</b>") : hideOverlay();
  }
});
document.addEventListener("keyup", (e) => (keys[e.key] = false));

ui.startBtn.onclick = () => {
  hideOverlay();
  state.paused = false;
  state.started = true;
};
ui.howBtn.onclick = () =>
  showOverlay(
    "Wie spielt man?",
    "Bewege den Schläger mit ⬅️ ➡️ (oder A/D).<br>Brich Ziegel, um Wörter zu entdecken. 🧠"
  );
ui.syncBtn.onclick = () => syncNow();
ui.summaryClose.onclick = () => (ui.summary.style.display = "none");

// ---------- Collision Detection ----------
function checkCollision(ball, brick) {
  return (
    ball.x + ball.r > brick.x &&
    ball.x - ball.r < brick.x + brick.w &&
    ball.y + ball.r > brick.y &&
    ball.y - ball.r < brick.y + brick.h
  );
}

function hitBrick(brick) {
  if (!brick.alive) return;
  brick.alive = false;
  state.score += 10;
  state.streak++;
  beep(800 + state.streak * 50, 0.05);
  spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);
  showPopup(brick.x + brick.w / 2, brick.y, brick.word.de, brick.color);
  addLearned(brick.word, brick.cname);
  
  if (state.streak % 5 === 0) {
    showQuiz();
  }
  
  if (state.bricks.filter((b) => b.alive).length === 0) {
    nextLevel();
  }
  
  updateHUD();
}

// ---------- Quiz System ----------
function showQuiz() {
  if (flattenLearned().length < 2) return;
  state.paused = true;
  const words = shuffle(flattenLearned());
  const correct = words[0];
  const wrong = shuffle(words.slice(1)).slice(0, 2);
  const options = shuffle([correct, ...wrong]);
  
  ui.qWord.textContent = correct.de;
  ui.optionsDiv.innerHTML = "";
  
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt.en;
    btn.onclick = () => checkAnswer(opt.en === correct.en, correct);
    ui.optionsDiv.appendChild(btn);
  });
  
  ui.quiz.style.display = "flex";
  apiEvent("quiz_start", { word: correct.de });
}

function checkAnswer(isCorrect, word) {
  state.stats.total++;
  if (isCorrect) {
    state.stats.correct++;
    state.score += 50;
    beep(1200, 0.1);
    showReward("✨ Richtig! +50");
    apiEvent("quiz_correct", { word: word.de });
  } else {
    state.lives--;
    beep(200, 0.2, "sawtooth");
    showReward("❌ Falsch!");
    apiEvent("quiz_wrong", { word: word.de });
    if (state.lives <= 0) {
      ui.quiz.style.display = "none";
      gameOver();
      return;
    }
  }
  ui.quiz.style.display = "none";
  state.paused = false;
  updateHUD();
  persist();
}

function showReward(text) {
  ui.reward.textContent = text;
  ui.reward.style.display = "block";
  setTimeout(() => (ui.reward.style.display = "none"), 2000);
}

// ---------- Summary ----------
function showSummary() {
  const acc = state.stats.total > 0 
    ? Math.round((state.stats.correct / state.stats.total) * 100) 
    : 0;
  ui.statText.innerHTML = `
    <strong>Wörter gelernt:</strong> ${flattenLearned().length}<br>
    <strong>Quiz-Genauigkeit:</strong> ${acc}% (${state.stats.correct}/${state.stats.total})<br>
    <strong>Höchster Streak:</strong> ${state.streak}
  `;
  ui.summary.style.display = "block";
}

// ---------- Persistence ----------
async function persist(data = {}) {
  const payload = {
    score: state.score,
    level: state.level,
    lives: state.lives,
    streak: state.streak,
    learned: flattenLearned(),
    stats: state.stats,
    ...data,
  };
  await apiSave(payload);
}

async function syncNow() {
  const data = await apiLoad();
  if (!data) {
    alert("Keine gespeicherten Daten gefunden!");
    return;
  }
  state.score = data.score || 0;
  state.level = data.level || 1;
  state.lives = data.lives || 3;
  state.streak = data.streak || 0;
  state.stats = data.stats || { correct: 0, total: 0 };
  
  state.learned = { red: [], orange: [], yellow: [], green: [], blue: [] };
  (data.learned || []).forEach((w) => {
    if (!state.learned[w.colorName]) state.learned[w.colorName] = [];
    state.learned[w.colorName].push({ de: w.de, en: w.en });
  });
  
  layoutBricks();
  renderLearned();
  updateHUD();
  alert("Daten synchronisiert!");
}

// ---------- Game Loop ----------
function update() {
  if (state.paused || state.gameOver) return;
  
  // Paddle movement
  if ((keys["ArrowLeft"] || keys["a"]) && state.paddle.x > 0) {
    state.paddle.x -= state.paddle.v;
  }
  if ((keys["ArrowRight"] || keys["d"]) && state.paddle.x < canvas.width - state.paddle.w) {
    state.paddle.x += state.paddle.v;
  }
  
  // Ball movement
  state.balls.forEach((ball) => {
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    // Wall collisions
    if (ball.x - ball.r <= 0 || ball.x + ball.r >= canvas.width) {
      ball.dx *= -1;
      beep(400, 0.03);
    }
    if (ball.y - ball.r <= 0) {
      ball.dy *= -1;
      beep(400, 0.03);
    }
    
    // Paddle collision
    if (
      ball.y + ball.r >= state.paddle.y &&
      ball.y - ball.r <= state.paddle.y + state.paddle.h &&
      ball.x >= state.paddle.x &&
      ball.x <= state.paddle.x + state.paddle.w
    ) {
      ball.dy = -Math.abs(ball.dy);
      const offset = (ball.x - (state.paddle.x + state.paddle.w / 2)) / (state.paddle.w / 2);
      ball.dx = offset * 5;
      beep(600, 0.05);
    }
    
    // Bottom boundary (lose life)
    if (ball.y - ball.r > canvas.height) {
      state.lives--;
      state.streak = 0;
      beep(150, 0.3, "sawtooth");
      if (state.lives <= 0) {
        gameOver();
      } else {
        resetBall();
      }
      updateHUD();
      persist();
    }
    
    // Brick collisions
    state.bricks.forEach((brick) => {
      if (brick.alive && checkCollision(ball, brick)) {
        ball.dy *= -1;
        hitBrick(brick);
      }
    });
  });
  
  updateParticles();
  updatePopups();
}

function draw() {
  // Clear
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Bricks
  state.bricks.forEach((brick) => {
    if (!brick.alive) return;
    ctx.fillStyle = brick.color;
    ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
    ctx.fillStyle = "#fff";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(brick.word.de, brick.x + brick.w / 2, brick.y + brick.h / 2 + 4);
  });
  
  // Paddle
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.w, state.paddle.h);
  
  // Balls
  state.balls.forEach((ball) => {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  });
  
  drawParticles();
  drawPopups();
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// ---------- Init ----------
async function init() {
  layoutBricks();
  renderLearned();
  updateHUD();
  showOverlay("Deutsch Lernen", "Drücke <b>Start</b> zum Spielen! 🚀");
  
  const saved = await apiLoad();
  if (saved) {
    if (confirm("Gespeicherte Daten gefunden. Laden?")) {
      await syncNow();
    }
  }
  
  gameLoop();
}

init();
