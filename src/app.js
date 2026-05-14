const ERASER_RADIUS = 58;
const ERASER_INTERVAL_MS = 80;
const BOOK_WIDTH = 1672;
const BOOK_HEIGHT = 941;
const BOOK_RATIO = BOOK_WIDTH / BOOK_HEIGHT;

const app = document.querySelector('#app');
const stage = document.querySelector('#bookStage');
const cursor = document.querySelector('#rubberCursor');
const bookBackground = document.querySelector('#bookBackground');
const coverScreen = document.querySelector('#coverScreen');
const coverImage = document.querySelector('#coverImage');
const pageTurn = document.querySelector('#pageTurn');
const pageTurnImage = pageTurn.querySelector('img');
const prevPageButton = document.querySelector('#prevPageButton');
const nextPageButton = document.querySelector('#nextPageButton');
const resetButton = document.querySelector('#resetButton');
const fullscreenButton = document.querySelector('#fullscreenButton');
const soundButton = document.querySelector('#soundButton');
const eraseSound = document.querySelector('#eraseSound');
const pageFlipSound = document.querySelector('#pageFlipSound');
const music = document.querySelector('#music');
const pageEls = {
  left: document.querySelector('#leftPage'),
  right: document.querySelector('#rightPage'),
};

const FALLBACK_BOOK = {
  title: '13 Rue del Prompt',
  covers: {
    front: 'assets/book/cover',
    back: 'assets/book/cover-back',
    open: 'assets/book/book-open',
  },
  pages: [],
};

const state = {
  book: FALLBACK_BOOK,
  pageIndex: 0,
  soundEnabled: false,
  soundTouched: false,
  isPointerDown: false,
  lastEraseAt: 0,
  layerState: new Map(),
  imageCache: new Map(),
};

function imageCandidates(base) {
  if (!base) return [];
  if (/\.(png|jpe?g|webp|gif)$/i.test(base)) return [base];
  return [`${base}.jpg`, `${base}.png`, `${base}.webp`];
}

function audioCandidates(base) {
  return [`${base}.mp3`];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function firstExistingImage(base) {
  if (state.imageCache.has(base)) return state.imageCache.get(base);
  for (const src of imageCandidates(base)) {
    try {
      const result = { src, image: await loadImage(src) };
      state.imageCache.set(base, result);
      return result;
    } catch {
      // Try next extension.
    }
  }
  const empty = { src: null, image: null };
  state.imageCache.set(base, empty);
  return empty;
}

function sortedPages(book) {
  return [...(book.pages || [])].sort((a, b) => {
    const ao = Number(a.order ?? 0);
    const bo = Number(b.order ?? 0);
    if (ao !== bo) return ao - bo;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function spreadCount() {
  return Math.max(1, Math.ceil(sortedPages(state.book).length / 2));
}

function backIndex() {
  // Índice 0 = portada; 1..N = pliegos reales; N+1 = pliego vacío final; N+2 = contraportada.
  return spreadCount() + 2;
}

function pageAsset(page, key) {
  return page && typeof page[key] === 'string' ? page[key] : '';
}

async function setImageFromBase(img, base) {
  const { src } = await firstExistingImage(base);
  if (src) img.src = src;
  else img.removeAttribute('src');
}

async function setupStaticAssets() {
  await setImageFromBase(bookBackground, state.book.covers?.open || FALLBACK_BOOK.covers.open);
  await Promise.all([eraseSound, pageFlipSound, music].map(async (audio) => {
    const [src] = audioCandidates(audio.dataset.audioBase);
    audio.src = src;
  }));

  const eraser = await firstExistingImage('assets/ui/eraser');
  if (eraser.src) {
    document.documentElement.style.setProperty('--eraser-image', `url("../${eraser.src}")`);
  }
}

async function loadBook() {
  try {
    const response = await fetch('book.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`book.json ${response.status}`);
    const book = await response.json();
    state.book = {
      ...FALLBACK_BOOK,
      ...book,
      covers: { ...FALLBACK_BOOK.covers, ...(book.covers || {}) },
      pages: Array.isArray(book.pages) ? book.pages : [],
    };
  } catch (error) {
    console.warn('No se pudo cargar book.json; usando fallback.', error);
  }
}

function coverFallback(ctx, width, height, label) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#fff6d9');
  gradient.addColorStop(0.45, '#eed8a6');
  gradient.addColorStop(1, '#d7b578');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(91, 57, 22, .11)';
  for (let y = height * 0.08; y < height; y += height * 0.075) {
    ctx.fillRect(width * 0.08, y, width * 0.84, Math.max(1, height * 0.004));
  }

  ctx.fillStyle = 'rgba(72, 42, 18, .42)';
  ctx.font = `800 ${Math.round(width * 0.09)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height / 2);
}

function drawImageFill(ctx, image, width, height) {
  ctx.drawImage(image, 0, 0, width, height);
}

function applyErasePoint(ctx, point, width, height) {
  const radius = point.radius * Math.min(width, height);
  ctx.beginPath();
  ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
  ctx.fill();
}

function layerForPage(page) {
  if (!page?.id) return null;
  if (!state.layerState.has(page.id)) {
    state.layerState.set(page.id, { coverImage: null, coverLoadedFor: '', erasePoints: [] });
  }
  return state.layerState.get(page.id);
}

async function ensureLayerCover(page) {
  const layer = layerForPage(page);
  if (!layer) return null;
  const cover = pageAsset(page, 'cover');
  if (layer.coverLoadedFor !== cover) {
    const { image } = await firstExistingImage(cover);
    layer.coverImage = image;
    layer.coverLoadedFor = cover;
  }
  return layer;
}

function drawCover(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const page = canvas.closest('.page')?.__pageData;
  const layer = page ? layerForPage(page) : null;

  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  if (!page || page.tool !== 'eraser') return;

  if (layer?.coverImage) {
    drawImageFill(ctx, layer.coverImage, width, height);
  } else {
    coverFallback(ctx, width, height, page.title || 'CUBIERTA');
  }

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const point of layer.erasePoints) applyErasePoint(ctx, point, width, height);
  ctx.restore();
}

function updateBookGeometry() {
  const rect = stage.getBoundingClientRect();
  const viewportRatio = rect.width / rect.height;
  let bookWidth = rect.width;
  let bookHeight = rect.height;

  if (viewportRatio > BOOK_RATIO) {
    bookHeight = rect.height;
    bookWidth = rect.height * BOOK_RATIO;
  } else {
    bookWidth = rect.width;
    bookHeight = rect.width / BOOK_RATIO;
  }

  const bookX = (rect.width - bookWidth) / 2;
  const bookY = (rect.height - bookHeight) / 2;
  stage.style.setProperty('--book-x', `${bookX}px`);
  stage.style.setProperty('--book-y', `${bookY}px`);
  stage.style.setProperty('--book-w', `${bookWidth}px`);
  stage.style.setProperty('--book-h', `${bookHeight}px`);
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  drawCover(canvas);
}

function formatBookDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let date = null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (slash) date = new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));

  if (!date || Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function pageInfoHtml(page) {
  if (!page) return '';
  const formattedDate = formatBookDate(page.date);
  const date = formattedDate ? `<div class="info-date">${escapeHtml(formattedDate)}</div>` : '';
  return `${date}<h2>${escapeHtml(page.title || page.id || 'Página')}</h2><p>${escapeHtml(page.description || '')}</p>`;
}

async function renderPage(side, page) {
  const el = pageEls[side];
  const img = el.querySelector('.page-base');
  const canvas = el.querySelector('.scratch-layer');
  const popover = el.querySelector('.info-popover');
  el.__pageData = page || null;

  el.classList.toggle('is-empty', !page);
  el.classList.toggle('has-info', Boolean(page));
  popover.innerHTML = pageInfoHtml(page);

  if (!page) {
    img.removeAttribute('src');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  await setImageFromBase(img, pageAsset(page, 'base'));
  await ensureLayerCover(page);
  resizeCanvas(canvas);
}

async function renderCurrentPage() {
  updateBookGeometry();
  const pages = sortedPages(state.book);
  const atCover = state.pageIndex === 0;
  const atBack = state.pageIndex === backIndex();
  const atSpread = !atCover && !atBack;
  const spread = atSpread ? state.pageIndex - 1 : -1;
  const leftPage = atSpread ? (pages[spread * 2] || null) : null;
  const rightPage = atSpread ? (pages[spread * 2 + 1] || null) : null;
  const hasEraserTool = [leftPage, rightPage].some((page) => page?.tool === 'eraser');

  document.body.classList.toggle('cover-active', atCover || atBack);
  document.body.classList.toggle('back-cover-active', atBack);
  document.body.classList.toggle('spread-active', atSpread);
  document.body.classList.toggle('eraser-active', hasEraserTool);

  if (atCover || atBack) {
    const base = atBack ? state.book.covers?.back : state.book.covers?.front;
    await setImageFromBase(coverImage, base || FALLBACK_BOOK.covers.front);
  }

  if (atSpread) {
    await Promise.all([
      renderPage('left', leftPage),
      renderPage('right', rightPage),
    ]);
  } else {
    await Promise.all([renderPage('left', null), renderPage('right', null)]);
  }

  prevPageButton.disabled = state.pageIndex === 0;
  nextPageButton.disabled = state.pageIndex === backIndex();
}

function currentTurnImage(direction) {
  if (direction > 0) {
    if (state.pageIndex === 0) return coverImage.currentSrc || coverImage.src;
    const rightImg = pageEls.right.querySelector('.page-base');
    return rightImg.currentSrc || rightImg.src || bookBackground.currentSrc || bookBackground.src;
  }
  if (state.pageIndex === backIndex()) return coverImage.currentSrc || coverImage.src;
  const leftImg = pageEls.left.querySelector('.page-base');
  return leftImg.currentSrc || leftImg.src || bookBackground.currentSrc || bookBackground.src;
}

function playPageTurn(direction) {
  const src = currentTurnImage(direction);
  if (src) pageTurnImage.src = src;
  pageTurn.classList.remove('turn-forward', 'turn-backward', 'is-active');
  void pageTurn.offsetWidth;
  pageTurn.classList.add(direction > 0 ? 'turn-forward' : 'turn-backward', 'is-active');
  window.setTimeout(() => pageTurn.classList.remove('is-active'), 480);
}

function playFlipSound() {
  if (!state.soundEnabled) return;
  pageFlipSound.currentTime = 0;
  pageFlipSound.play().catch(() => {});
}

async function goToPage(nextIndex) {
  const clamped = Math.max(0, Math.min(backIndex(), nextIndex));
  if (clamped === state.pageIndex) return;
  const direction = clamped > state.pageIndex ? 1 : -1;
  if (!state.soundTouched) setSoundEnabled(true);
  playFlipSound();
  playPageTurn(direction);
  state.pageIndex = clamped;
  await renderCurrentPage();
}

function eraseAt(canvas, clientX, clientY) {
  const page = canvas.closest('.page')?.__pageData;
  if (!page || page.tool !== 'eraser') return;

  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  const layer = layerForPage(page);
  layer.erasePoints.push({
    x: x / rect.width,
    y: y / rect.height,
    radius: ERASER_RADIUS / Math.min(rect.width, rect.height),
  });
  drawCover(canvas);

  const now = performance.now();
  if (state.soundEnabled && now - state.lastEraseAt > ERASER_INTERVAL_MS) {
    state.lastEraseAt = now;
    eraseSound.currentTime = 0;
    eraseSound.play().catch(() => {});
  }
}

function eraseFromPointer(event) {
  const targetCanvas = event.target.closest?.('.scratch-layer');
  if (!targetCanvas) return;
  eraseAt(targetCanvas, event.clientX, event.clientY);
}

function updateCursor(event) {
  cursor.style.left = `${event.clientX}px`;
  cursor.style.top = `${event.clientY}px`;
}

function setSoundEnabled(enabled) {
  state.soundEnabled = enabled;
  soundButton.setAttribute('aria-pressed', String(state.soundEnabled));
  soundButton.textContent = `Sonido: ${state.soundEnabled ? 'on' : 'off'}`;

  music.volume = 0.42;
  eraseSound.volume = 0.7;
  pageFlipSound.volume = 0.8;

  if (state.soundEnabled) music.play().catch(() => {});
  else music.pause();
}

function enableSoundOnFirstGesture(event) {
  if (state.soundTouched || state.soundEnabled) return;
  if (event?.target?.closest?.('#soundButton')) return;
  setSoundEnabled(true);
}

function toggleSound() {
  state.soundTouched = true;
  setSoundEnabled(!state.soundEnabled);
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) await app.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

function updateFullscreenLabel() {
  fullscreenButton.textContent = document.fullscreenElement ? 'Restaurar' : 'Maximizar';
}

function resetPages() {
  for (const layer of state.layerState.values()) {
    layer.erasePoints = [];
  }
  for (const canvas of document.querySelectorAll('.scratch-layer')) drawCover(canvas);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));
}

async function init() {
  updateBookGeometry();
  await loadBook();
  await setupStaticAssets();
  await renderCurrentPage();
  updateFullscreenLabel();
}

const resizeObserver = new ResizeObserver(() => {
  updateBookGeometry();
  document.querySelectorAll('.scratch-layer').forEach((canvas) => resizeCanvas(canvas));
});
resizeObserver.observe(stage);
Object.values(pageEls).forEach((el) => resizeObserver.observe(el));

stage.addEventListener('pointermove', (event) => {
  updateCursor(event);
  if (state.isPointerDown) eraseFromPointer(event);
});

stage.addEventListener('pointerdown', (event) => {
  if (!document.body.classList.contains('spread-active')) return;
  const targetCanvas = event.target.closest?.('.scratch-layer');
  if (!targetCanvas) return;
  state.isPointerDown = true;
  stage.classList.add('is-erasing');
  event.target.setPointerCapture?.(event.pointerId);
  eraseFromPointer(event);
});

window.addEventListener('pointerup', () => {
  state.isPointerDown = false;
  stage.classList.remove('is-erasing');
});

document.addEventListener('pointerdown', enableSoundOnFirstGesture, { capture: true });
prevPageButton.addEventListener('click', () => goToPage(state.pageIndex - 1));
nextPageButton.addEventListener('click', () => goToPage(state.pageIndex + 1));
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  const tag = String(target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    goToPage(state.pageIndex + 1);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToPage(state.pageIndex - 1);
  }
});
resetButton.addEventListener('click', resetPages);
fullscreenButton.addEventListener('click', toggleFullscreen);
soundButton.addEventListener('click', toggleSound);
document.addEventListener('fullscreenchange', updateFullscreenLabel);

init();
