const ERASER_RADIUS = 50;
const COIN_RADIUS_X = 42;
const COIN_RADIUS_Y = 7;
const ERASER_INTERVAL_MS = 80;
const PENCIL_INTERVAL_MS = 55;
const BOOK_WIDTH = 1672;
const BOOK_HEIGHT = 941;
const BOOK_RATIO = BOOK_WIDTH / BOOK_HEIGHT;
const MONOCLE_ZOOM = 2.15;
const MONOCLE_SIZE = 760;
const PENCIL_TIP_OFFSET_X = 10;
const PENCIL_TIP_OFFSET_Y = -10;

const app = document.querySelector('#app');
const stage = document.querySelector('#bookStage');
const cursor = document.querySelector('#toolCursor');
const magnifierLens = document.querySelector('#magnifierLens');
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
const pencilSound = document.querySelector('#pencilSound');
const pageFlipSound = document.querySelector('#pageFlipSound');
const music = document.querySelector('#music');
const finalTribute = document.querySelector('#finalTribute');
const pageIndex = document.querySelector('#pageIndex');
const toolButtons = [...document.querySelectorAll('.tool-button')];
const pageEls = {
  left: document.querySelector('#leftPage'),
  right: document.querySelector('#rightPage'),
};

const FINAL_LEFT_PAGE = { id: '__final_left__', title: 'Página final', tool: 'eraser', virtual: true };
const FINAL_RIGHT_PAGE = { id: '__final_right__', title: 'Homenaje', tool: 'eraser', virtual: true };

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
  indexRenderedFor: '',
  activeTool: 'eraser',
  soundEnabled: false,
  soundTouched: false,
  isPointerDown: false,
  lastEraseAt: 0,
  lastPencilAt: 0,
  layerState: new Map(),
  imageCache: new Map(),
};

function imageCandidates(base, kind = 'exact') {
  if (!base) return [];
  if (/\.(png|jpe?g|webp|gif)$/i.test(base)) return [base];
  if (kind === 'jpg-png') return [`${base}.jpg`, `${base}.png`];
  if (kind === 'png') return [`${base}.png`];
  return [base];
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

async function firstExistingImage(base, kind = 'exact') {
  const cacheKey = `${kind}:${base}`;
  if (state.imageCache.has(cacheKey)) return state.imageCache.get(cacheKey);
  for (const src of imageCandidates(base, kind)) {
    try {
      const result = { src, image: await loadImage(src) };
      state.imageCache.set(cacheKey, result);
      return result;
    } catch {
      // Try next candidate.
    }
  }
  const empty = { src: null, image: null };
  state.imageCache.set(cacheKey, empty);
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

function finalBlankIndex() {
  return spreadCount() + 1;
}

function backIndex() {
  // Índice 0 = portada; 1..N = pliegos reales; N+1 = pliego vacío final; N+2 = contraportada.
  return spreadCount() + 2;
}

function pageAsset(page, key) {
  return page && typeof page[key] === 'string' ? page[key] : '';
}

async function setImageFromBase(img, base, kind = 'exact') {
  const { src } = await firstExistingImage(base, kind);
  if (src) img.src = src;
  else img.removeAttribute('src');
}

async function preloadInitialImages() {
  const pages = sortedPages(state.book).slice(0, 2);
  const jobs = [
    firstExistingImage(state.book.covers?.front || FALLBACK_BOOK.covers.front, 'jpg-png'),
    firstExistingImage(state.book.covers?.back || FALLBACK_BOOK.covers.back, 'jpg-png'),
    firstExistingImage(state.book.covers?.open || FALLBACK_BOOK.covers.open, 'jpg-png'),
  ];
  for (const page of pages) {
    jobs.push(firstExistingImage(pageAsset(page, 'base'), 'jpg-png'));
    jobs.push(firstExistingImage(pageAsset(page, 'cover'), 'png'));
  }
  await Promise.allSettled(jobs);
}

async function setupStaticAssets() {
  await setImageFromBase(bookBackground, state.book.covers?.open || FALLBACK_BOOK.covers.open, 'jpg-png');
  await Promise.all([eraseSound, pencilSound, pageFlipSound, music].map(async (audio) => {
    const [src] = audioCandidates(audio.dataset.audioBase);
    audio.src = src;
  }));

  const [eraser, coin, pencil] = await Promise.all([
    firstExistingImage('assets/ui/eraser', 'png'),
    firstExistingImage('assets/ui/moneda', 'png'),
    firstExistingImage('assets/ui/lapiz', 'png'),
  ]);
  if (eraser.src) document.documentElement.style.setProperty('--eraser-image', `url("../${eraser.src}")`);
  if (coin.src) document.documentElement.style.setProperty('--coin-image', `url("../${coin.src}")`);
  if (pencil.src) document.documentElement.style.setProperty('--pencil-image', `url("../${pencil.src}")`);
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
  if (point.tool === 'coin') {
    const x = point.x * width;
    const y = point.y * height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, 0, point.rx * Math.min(width, height), point.ry * Math.min(width, height), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const radius = point.radius * Math.min(width, height);
  ctx.beginPath();
  ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
  ctx.fill();
}

function applyScratchMark(ctx, mark, width, height) {
  const x = mark.x * width;
  const y = mark.y * height;
  const len = mark.rx * Math.min(width, height) * 2.3;
  const thick = Math.max(1.4, mark.ry * Math.min(width, height));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  ctx.lineCap = 'round';
  ctx.lineWidth = thick;
  ctx.strokeStyle = 'rgba(46, 29, 16, .38)';
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, thick * .34);
  ctx.strokeStyle = 'rgba(255, 247, 223, .55)';
  ctx.beginPath();
  ctx.moveTo(-len * .42, -thick * .9);
  ctx.lineTo(len * .36, thick * .55);
  ctx.stroke();
  ctx.restore();
}

function applyPencilMark(ctx, mark, width, height) {
  const minSide = Math.min(width, height);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.6, mark.size * minSide);
  ctx.strokeStyle = 'rgba(35, 29, 24, .82)';
  ctx.beginPath();
  ctx.moveTo(mark.fromX * width, mark.fromY * height);
  ctx.lineTo(mark.x * width, mark.y * height);
  ctx.stroke();
  ctx.lineWidth = Math.max(.65, mark.size * minSide * .26);
  ctx.strokeStyle = 'rgba(255, 255, 255, .24)';
  ctx.beginPath();
  ctx.moveTo(mark.fromX * width, mark.fromY * height);
  ctx.lineTo(mark.x * width, mark.y * height);
  ctx.stroke();
  ctx.restore();
}

function invalidateLayerComposite(layer) {
  if (!layer) return;
  layer.version += 1;
  layer.compositeVersion = -1;
  if (layer.compositeUrl?.startsWith('blob:')) URL.revokeObjectURL(layer.compositeUrl);
  layer.compositeUrl = '';
}

function applyMarkDirect(canvas, layer, type, mark) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  if (!ctx || !width || !height) return;

  ctx.save();
  if (type === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    applyErasePoint(ctx, mark, width, height);
  } else {
    ctx.globalCompositeOperation = 'source-over';
    if (type === 'scratch') applyScratchMark(ctx, mark, width, height);
    if (type === 'pencil') applyPencilMark(ctx, mark, width, height);
  }
  ctx.restore();
  invalidateLayerComposite(layer);
}

function layerForPage(page) {
  if (!page?.id) return null;
  if (!state.layerState.has(page.id)) {
    state.layerState.set(page.id, { coverImage: null, coverLoadedFor: '', erasePoints: [], scratchMarks: [], pencilMarks: [], version: 0, compositeVersion: -1, compositeUrl: '' });
  }
  return state.layerState.get(page.id);
}

async function ensureLayerCover(page) {
  const layer = layerForPage(page);
  if (!layer) return null;
  const cover = pageAsset(page, 'cover');
  if (layer.coverLoadedFor !== cover) {
    const { image } = await firstExistingImage(cover, 'png');
    layer.coverImage = image;
    layer.coverLoadedFor = cover;
    invalidateLayerComposite(layer);
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
  if (!page || !layer) return;

  if (layer.coverImage) {
    drawImageFill(ctx, layer.coverImage, width, height);
  } else if (!page.virtual) {
    coverFallback(ctx, width, height, page.title || 'CUBIERTA');
  }

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (const mark of layer.pencilMarks) applyPencilMark(ctx, mark, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const point of layer.erasePoints) applyErasePoint(ctx, point, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (const mark of layer.scratchMarks) applyScratchMark(ctx, mark, width, height);
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
  const nextWidth = Math.max(1, Math.round(rect.width));
  const nextHeight = Math.max(1, Math.round(rect.height));
  if (canvas.width === nextWidth && canvas.height === nextHeight) return;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  const page = canvas.closest('.page')?.__pageData;
  invalidateLayerComposite(page ? layerForPage(page) : null);
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
  el.classList.toggle('is-virtual-page', Boolean(page?.virtual));
  el.classList.toggle('has-info', Boolean(page && !page.virtual));
  popover.innerHTML = pageInfoHtml(page);

  if (!page) {
    img.removeAttribute('src');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  if (page.virtual) {
    img.removeAttribute('src');
    await ensureLayerCover(page);
    resizeCanvas(canvas);
    drawCover(canvas);
    return;
  }

  await setImageFromBase(img, pageAsset(page, 'base'), 'jpg-png');
  await ensureLayerCover(page);
  resizeCanvas(canvas);
  drawCover(canvas);
}

function pageIndexItems() {
  const pages = sortedPages(state.book);
  const items = [{ label: '▣', title: 'Portada', index: 0 }];
  for (let spread = 0; spread < spreadCount(); spread += 1) {
    const start = spread * 2 + 1;
    const end = Math.min(start + 1, pages.length);
    items.push({ label: end > start ? `${start}-${end}` : `${start}`, title: `Páginas ${start}${end > start ? ` y ${end}` : ''}`, index: spread + 1 });
  }
  items.push({ label: '★', title: 'Homenaje', index: finalBlankIndex() });
  items.push({ label: '□', title: 'Contraportada', index: backIndex() });
  return items;
}

function renderPageIndex() {
  if (!pageIndex) return;
  const signature = `${sortedPages(state.book).length}:${backIndex()}`;
  if (state.indexRenderedFor !== signature) {
    pageIndex.innerHTML = '';
    for (const item of pageIndexItems()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-index-button';
      button.textContent = item.label;
      button.title = item.title;
      button.setAttribute('aria-label', item.title);
      button.dataset.pageIndex = String(item.index);
      button.addEventListener('click', () => goToPage(item.index));
      pageIndex.append(button);
    }
    state.indexRenderedFor = signature;
  }

  for (const button of pageIndex.querySelectorAll('.page-index-button')) {
    const active = Number(button.dataset.pageIndex) === state.pageIndex;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
}

async function renderCurrentPage() {
  updateBookGeometry();
  const pages = sortedPages(state.book);
  const atCover = state.pageIndex === 0;
  const atBack = state.pageIndex === backIndex();
  const atSpread = !atCover && !atBack;
  const atFinalBlank = state.pageIndex === finalBlankIndex();
  const spread = atSpread ? state.pageIndex - 1 : -1;
  const leftPage = atFinalBlank ? FINAL_LEFT_PAGE : (atSpread ? (pages[spread * 2] || null) : null);
  const rightPage = atFinalBlank ? FINAL_RIGHT_PAGE : (atSpread ? (pages[spread * 2 + 1] || null) : null);

  document.body.classList.toggle('cover-active', atCover || atBack);
  document.body.classList.toggle('back-cover-active', atBack);
  document.body.classList.toggle('spread-active', atSpread);
  document.body.classList.toggle('final-tribute-active', atFinalBlank);
  document.body.classList.toggle('tool-eraser', state.activeTool === 'eraser');
  document.body.classList.toggle('tool-coin', state.activeTool === 'coin');
  document.body.classList.toggle('tool-monocle', state.activeTool === 'monocle');
  document.body.classList.toggle('tool-pencil', state.activeTool === 'pencil');

  if (atCover || atBack) {
    const base = atBack ? state.book.covers?.back : state.book.covers?.front;
    await setImageFromBase(coverImage, base || FALLBACK_BOOK.covers.front, 'jpg-png');
  }

  if (atSpread) {
    await Promise.all([
      renderPage('left', leftPage),
      renderPage('right', rightPage),
    ]);
  } else {
    await Promise.all([renderPage('left', null), renderPage('right', null)]);
  }

  if (finalTribute) {
    const mortadelo = finalTribute.querySelector('.tribute-mortadelo');
    if (mortadelo) mortadelo.hidden = false;
  }

  renderPageIndex();
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
  if (clamped === state.pageIndex || state.isTurningPage) return;
  state.isTurningPage = true;
  const direction = clamped > state.pageIndex ? 1 : -1;
  try {
    if (!state.soundTouched) setSoundEnabled(true);
    playFlipSound();
    playPageTurn(direction);
    state.pageIndex = clamped;
    await renderCurrentPage();
  } finally {
    window.setTimeout(() => { state.isTurningPage = false; }, 40);
  }
}

function handleNavClick(event, delta) {
  event.preventDefault();
  event.stopPropagation();
  goToPage(state.pageIndex + delta);
}

function activeToolMatches(page) {
  if (!page) return false;
  if (state.activeTool === 'eraser' || state.activeTool === 'pencil') return true;
  return page.tool === state.activeTool;
}

function applyToolAt(canvas, clientX, clientY) {
  const page = canvas.closest('.page')?.__pageData;
  if (!page || state.activeTool === 'monocle') return;

  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  const layer = layerForPage(page);
  const paintX = state.activeTool === 'pencil' ? x + PENCIL_TIP_OFFSET_X : x;
  const paintY = state.activeTool === 'pencil' ? y + PENCIL_TIP_OFFSET_Y : y;
  const normalized = { x: paintX / rect.width, y: paintY / rect.height };
  const minSide = Math.min(rect.width, rect.height);
  const previous = layer.lastPointer || normalized;
  let audio = null;

  if (state.activeTool === 'pencil') {
    const mark = { ...normalized, fromX: previous.x, fromY: previous.y, tool: 'pencil', size: 3.2 / minSide };
    layer.pencilMarks.push(mark);
    applyMarkDirect(canvas, layer, 'pencil', mark);
    audio = 'pencil';
  } else if (activeToolMatches(page)) {
    if (state.activeTool === 'coin') {
      const mark = { ...normalized, tool: 'coin', rx: COIN_RADIUS_X / minSide, ry: COIN_RADIUS_Y / minSide };
      layer.erasePoints.push(mark);
      invalidateLayerComposite(layer);
      drawCover(canvas);
      audio = 'erase';
    } else if (state.activeTool === 'eraser') {
      const mark = { ...normalized, tool: 'eraser', radius: ERASER_RADIUS / minSide };
      layer.erasePoints.push(mark);
      invalidateLayerComposite(layer);
      drawCover(canvas);
      audio = 'erase';
    }
  } else if (state.activeTool === 'coin') {
    const mark = { ...normalized, tool: 'coin', rx: COIN_RADIUS_X / minSide, ry: COIN_RADIUS_Y / minSide };
    layer.scratchMarks.push(mark);
    applyMarkDirect(canvas, layer, 'scratch', mark);
    audio = 'erase';
  } else {
    return;
  }

  layer.lastPointer = normalized;

  const now = performance.now();
  if (state.soundEnabled && audio === 'erase' && now - state.lastEraseAt > ERASER_INTERVAL_MS) {
    state.lastEraseAt = now;
    eraseSound.currentTime = 0;
    eraseSound.play().catch(() => {});
  } else if (state.soundEnabled && audio === 'pencil' && now - state.lastPencilAt > PENCIL_INTERVAL_MS) {
    state.lastPencilAt = now;
    pencilSound.currentTime = 0;
    pencilSound.play().catch(() => {});
  }
}

function toolFromPointer(event) {
  const targetCanvas = event.target.closest?.('.scratch-layer');
  if (!targetCanvas) return;
  applyToolAt(targetCanvas, event.clientX, event.clientY);
}

function updateCursor(event) {
  cursor.style.left = `${event.clientX}px`;
  cursor.style.top = `${event.clientY}px`;
  if (state.activeTool === 'monocle') updateMagnifier(event);
}

function pageCompositeDataUrl(pageEl) {
  const page = pageEl.__pageData;
  const currentLayer = page ? layerForPage(page) : null;
  const base = pageEl.querySelector('.page-base');
  const layer = pageEl.querySelector('.scratch-layer');
  const width = layer.width || Math.round(pageEl.getBoundingClientRect().width);
  const height = layer.height || Math.round(pageEl.getBoundingClientRect().height);
  if (!width || !height || !currentLayer) return '';
  if (currentLayer.compositeUrl && currentLayer.compositeVersion === currentLayer.version) return currentLayer.compositeUrl;
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const ctx = buffer.getContext('2d');
  ctx.fillStyle = '#fbf3df';
  ctx.fillRect(0, 0, width, height);
  if (base?.complete && base.naturalWidth) ctx.drawImage(base, 0, 0, width, height);
  ctx.drawImage(layer, 0, 0, width, height);
  currentLayer.compositeUrl = buffer.toDataURL('image/jpeg', .86);
  currentLayer.compositeVersion = currentLayer.version;
  return currentLayer.compositeUrl;
}

function updateMagnifier(event) {
  if (!document.body.classList.contains('spread-active') || document.body.classList.contains('final-tribute-active')) {
    magnifierLens.style.backgroundImage = 'none';
    return;
  }
  magnifierLens.style.left = `${event.clientX}px`;
  magnifierLens.style.top = `${event.clientY}px`;
  magnifierLens.style.width = `${MONOCLE_SIZE}px`;
  magnifierLens.style.height = `${MONOCLE_SIZE}px`;

  const pageEl = event.target.closest?.('.page');
  if (pageEl && !pageEl.classList.contains('is-empty')) {
    const pageRect = pageEl.getBoundingClientRect();
    const x = event.clientX - pageRect.left;
    const y = event.clientY - pageRect.top;
    const composite = pageCompositeDataUrl(pageEl);
    magnifierLens.style.backgroundImage = composite ? `url("${composite}")` : 'none';
    magnifierLens.style.backgroundSize = `${pageRect.width * MONOCLE_ZOOM}px ${pageRect.height * MONOCLE_ZOOM}px`;
    magnifierLens.style.backgroundPosition = `${-(x * MONOCLE_ZOOM - MONOCLE_SIZE / 2)}px ${-(y * MONOCLE_ZOOM - MONOCLE_SIZE / 2)}px`;
    return;
  }

  const stageRect = stage.getBoundingClientRect();
  const x = event.clientX - stageRect.left;
  const y = event.clientY - stageRect.top;
  magnifierLens.style.backgroundImage = `url("${bookBackground.currentSrc || bookBackground.src}")`;
  magnifierLens.style.backgroundSize = `${stageRect.width * MONOCLE_ZOOM}px ${stageRect.height * MONOCLE_ZOOM}px`;
  magnifierLens.style.backgroundPosition = `${-(x * MONOCLE_ZOOM - MONOCLE_SIZE / 2)}px ${-(y * MONOCLE_ZOOM - MONOCLE_SIZE / 2)}px`;
}

function setActiveTool(tool) {
  state.activeTool = tool;
  for (const button of toolButtons) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  document.body.classList.toggle('tool-eraser', tool === 'eraser');
  document.body.classList.toggle('tool-coin', tool === 'coin');
  document.body.classList.toggle('tool-monocle', tool === 'monocle');
  document.body.classList.toggle('tool-pencil', tool === 'pencil');
}

function setSoundEnabled(enabled) {
  state.soundEnabled = enabled;
  soundButton.setAttribute('aria-pressed', String(state.soundEnabled));
  soundButton.textContent = state.soundEnabled ? '🔊' : '🔇';
  soundButton.setAttribute('aria-label', state.soundEnabled ? 'Sonido activado' : 'Sonido desactivado');

  music.volume = 0.42;
  eraseSound.volume = 0.7;
  pencilSound.volume = 0.62;
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
  fullscreenButton.textContent = document.fullscreenElement ? '⤢' : '⛶';
  fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Restaurar' : 'Maximizar');
}

function resetPages() {
  for (const layer of state.layerState.values()) {
    layer.erasePoints = [];
    layer.scratchMarks = [];
    layer.pencilMarks = [];
    invalidateLayerComposite(layer);
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
  setActiveTool('eraser');
  await loadBook();
  await preloadInitialImages();
  await setupStaticAssets();
  await renderCurrentPage();
  updateFullscreenLabel();
  document.body.classList.remove('is-loading');
}

const resizeObserver = new ResizeObserver(() => {
  updateBookGeometry();
  document.querySelectorAll('.scratch-layer').forEach((canvas) => resizeCanvas(canvas));
});
resizeObserver.observe(stage);
Object.values(pageEls).forEach((el) => resizeObserver.observe(el));

stage.addEventListener('pointermove', (event) => {
  updateCursor(event);
  if (state.isPointerDown) toolFromPointer(event);
});

stage.addEventListener('pointerdown', (event) => {
  if (event.target.closest?.('button, .controls, .page-index')) return;
  if (!document.body.classList.contains('spread-active')) return;
  const targetCanvas = event.target.closest?.('.scratch-layer');
  if (!targetCanvas && state.activeTool !== 'monocle') return;
  const page = targetCanvas?.closest('.page')?.__pageData;
  const layer = page ? layerForPage(page) : null;
  if (layer && targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    layer.lastPointer = {
      x: (rawX + (state.activeTool === 'pencil' ? PENCIL_TIP_OFFSET_X : 0)) / rect.width,
      y: (rawY + (state.activeTool === 'pencil' ? PENCIL_TIP_OFFSET_Y : 0)) / rect.height,
    };
  }
  state.isPointerDown = true;
  stage.classList.add('is-erasing');
  event.target.setPointerCapture?.(event.pointerId);
  toolFromPointer(event);
});

window.addEventListener('pointerup', () => {
  state.isPointerDown = false;
  stage.classList.remove('is-erasing');
});

document.addEventListener('pointerdown', enableSoundOnFirstGesture, { capture: true });
prevPageButton.addEventListener('pointerdown', (event) => event.stopPropagation());
nextPageButton.addEventListener('pointerdown', (event) => event.stopPropagation());
prevPageButton.addEventListener('click', (event) => handleNavClick(event, -1));
nextPageButton.addEventListener('click', (event) => handleNavClick(event, 1));
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
toolButtons.forEach((button) => button.addEventListener('click', () => setActiveTool(button.dataset.tool || 'eraser')));
document.addEventListener('fullscreenchange', updateFullscreenLabel);
finalTribute?.querySelector('.tribute-mortadelo')?.addEventListener('error', (event) => { event.currentTarget.hidden = true; });

init();
