'use strict';

/* ===== НАСТРОЙКИ ===== */
const CONFIG = {
  musicSrc: 'assets/music.mp3',
  volume: 0.45,
  afterPlayDelay: 1500,   // сколько крутится пластинка до перехода (мс)
  transition: 1100,       // чуть больше самой длинной CSS-анимации перехода
  typeSpeed: 48,
  linePause: 380,
  maxParticles: 320,      // защита: конфетти никогда не накапливается
  loadTimeout: 4000,      // если фото/шрифты грузятся дольше — всё равно запускаем
  wish: [
    'Сегодня тебе исполняется 18,',
    'и мне хочется, чтобы этот день',
    'был таким же светлым, как твоя улыбка.',
    'Пусть мечты сбываются без долгого ожидания,',
    'а рядом всегда будут те, кто тебя любит.',
    'Я один из них, и мне очень повезло. ❤️'
  ]
};

/* ===== Помощники ===== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sceneEl = n => $(`.scene[data-scene="${n}"]`);

let current = 1, busy = false, started = false, wishDone = false, typeRun = 0, timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

/* ===== Музыка: создаётся один раз, никогда не перезапускается ===== */
const audio = new Audio(CONFIG.musicSrc);
audio.loop = true; audio.preload = 'auto'; audio.volume = CONFIG.volume;
const musicBtn = $('#musicBtn');

function startMusic() {
  audio.volume = 0;
  audio.play().then(() => {                       // плавное нарастание громкости
    const id = setInterval(() => {
      audio.volume = Math.min(CONFIG.volume, audio.volume + 0.02);
      if (audio.volume >= CONFIG.volume) clearInterval(id);
    }, 80);
  }).catch(() => { audio.volume = CONFIG.volume; });   // нет файла — история продолжается
  musicBtn.classList.add('show');
}
musicBtn.addEventListener('click', () => (audio.paused ? audio.play().catch(() => {}) : audio.pause()));
audio.addEventListener('pause', () => musicBtn.classList.add('off'));
audio.addEventListener('play',  () => musicBtn.classList.remove('off'));

/* ===== Переключение сцен ===== */
const veil = $('#veil');
function goTo(n) {
  if (busy || n !== current + 1) return;           // только вперёд и только по одной сцене
  busy = true;
  const prev = sceneEl(current);
  clearTimers();                                   // стопим всё, что планировала прошлая сцена
  typeRun++;                                       // отменяет печатную машинку
  veil.classList.remove('go'); void veil.offsetWidth; veil.classList.add('go');   // вспышка света
  prev.classList.remove('is-active');
  sceneEl(n).classList.add('is-active');
  current = n;
  setTimeout(() => { resetScene(prev); busy = false; }, CONFIG.transition);
  if (hooks[n]) hooks[n]();
}

// Полная очистка ушедшей сцены
function resetScene(scene) {
  if (Number(scene.dataset.scene) === 1) return;
  $$('.is-shown', scene).forEach(el => el.classList.remove('is-shown'));
  $$('.wish, .particles', scene).forEach(el => (el.innerHTML = ''));
}

// Показывает элементы с data-delay по очереди
const playSequence = scene => $$('[data-delay]', scene).forEach(el => later(() => el.classList.add('is-shown'), +el.dataset.delay));

// Разбивает заголовок на слова для поочерёдного появления
function splitWords(el) {
  let i = 0;
  el.innerHTML = el.innerHTML.replace(/<br\s*\/?>/g, ' <br> ').split(/\s+/).filter(Boolean)
    .map(w => (w === '<br>' ? w : `<span class="w" style="--i:${i++}">${w}</span>`)).join(' ');
}

/* ===== Сцена 2: печатная машинка ===== */
const wishBox = $('#wish'), hint2 = $('#hint2');
const lineHTML = (t, g) => `<p><span class="t">${t}</span><span class="g">${g}</span></p>`;

async function typeLines(run) {
  // Весь текст сразу в разметке (прозрачный) — блок не меняет высоту во время печати
  wishBox.innerHTML = CONFIG.wish.map(l => lineHTML('', l)).join('');
  const rows = $$('p', wishBox);
  for (let i = 0; i < rows.length; i++) {
    const t = $('.t', rows[i]), g = $('.g', rows[i]), text = CONFIG.wish[i];
    rows[i].classList.add('typing');
    for (let k = 1; k <= text.length; k++) {
      if (run !== typeRun) return false;
      t.textContent = text.slice(0, k); g.textContent = text.slice(k);
      await sleep(CONFIG.typeSpeed);
    }
    rows[i].classList.remove('typing');
    await sleep(CONFIG.linePause);
  }
  return true;
}
function finishWish() { wishDone = true; hint2.classList.add('is-shown'); }

function startCongrats() {
  wishDone = false;
  const run = typeRun;
  playSequence(sceneEl(2));
  later(async () => { if (await typeLines(run)) finishWish(); }, 2000);
}
// Клик во время печати — допечатать сразу; следующий клик — дальше
sceneEl(2).addEventListener('click', () => {
  if (busy) return;
  if (!wishDone) {
    typeRun++;
    wishBox.innerHTML = CONFIG.wish.map(l => lineHTML(l, '')).join('');
    finishWish();
  } else goTo(3);
});

/* ===== Конфетти (canvas) ===== */
const cv = $('#confetti'), ctx = cv.getContext('2d');
const COLORS = ['#7ea6e6', '#a9c6ee', '#3b5bb5', '#ffffff', '#e3c27a', '#c9a45c'];
let parts = [], raf = 0, dpr = 1;

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
}
addEventListener('resize', resizeCanvas); resizeCanvas();

function confetti(count) {
  if (REDUCED) count = 20;
  if (innerWidth < 720) count = Math.round(count * 0.6);
  count = Math.min(count, CONFIG.maxParticles - parts.length);   // никогда не больше лимита
  for (let i = 0; i < count; i++) {
    parts.push({
      x: rand(0, cv.width), y: -rand(20, cv.height * 0.9),
      w: rand(6, 13) * dpr, h: rand(4, 8) * dpr,
      vy: rand(1.4, 3.6) * dpr, vx: rand(-.5, .5) * dpr,
      rot: rand(0, 6.28), vr: rand(-.12, .12), wob: rand(0, 6.28),
      color: COLORS[Math.floor(rand(0, COLORS.length))]
    });
  }
  if (!raf && parts.length) raf = requestAnimationFrame(tick);   // ровно один цикл анимации
}
function tick() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.y < cv.height + 30);
  for (const p of parts) {
    p.wob += 0.04; p.rot += p.vr;
    p.y += p.vy; p.x += p.vx + Math.sin(p.wob) * 0.6 * dpr;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.wob * 2));
    ctx.fillStyle = p.color; ctx.globalAlpha = 0.92;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0;
  if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
}

/* ===== Сцена 4: финал ===== */
function spawnGlow() {
  const box = $('.particles', sceneEl(4));
  box.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const s = document.createElement('span'), heart = i % 3 === 0;
    s.className = heart ? 'hrt' : 'orb';
    if (heart) s.textContent = '♥';
    s.style.cssText = `left:${rand(2, 96)}%;--s:${heart ? rand(14, 26) : rand(12, 40)}px;--d:${rand(9, 17)}s;--w:${-rand(0, 14)}s;--x:${rand(-40, 40)}px`;
    box.append(s);
  }
}
function startFinale() {
  later(() => confetti(150), 500);
  later(() => confetti(80), 4000);
  spawnGlow();
  playSequence(sceneEl(4));
}

/* ===== Инициализация ===== */
const hooks = { 2: startCongrats, 3: () => playSequence(sceneEl(3)), 4: startFinale };

$('#playBtn').addEventListener('click', e => {
  if (started) return;
  started = true; e.currentTarget.disabled = true;
  startMusic();                                    // именно внутри клика — иначе браузер заблокирует звук
  $('#player').classList.add('on');                // вращение + тонарм
  setTimeout(() => { goTo(2); confetti(140); }, CONFIG.afterPlayDelay);
});
$('#toFinal').addEventListener('click', () => goTo(4));

// Показываем сайт только когда готовы шрифты и фото — ничего не «выскакивает» и не прыгает
async function init() {
  $$('[data-split]').forEach(splitWords);
  const imgs = $$('img').map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()));
  await Promise.race([Promise.all([document.fonts.ready, ...imgs]), sleep(CONFIG.loadTimeout)]);
  document.body.classList.add('ready');
  playSequence(sceneEl(1));
}
init();
