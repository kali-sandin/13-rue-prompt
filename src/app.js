const ERASER_RADIUS = 58;
const ERASER_INTERVAL_MS = 80;

const app = document.querySelector('#app');
const stage = document.querySelector('#bookStage');
const cursor = document.querySelector('#rubberCursor');
const introCover = document.querySelector('#introCover');
const resetButton = document.querySelector('#resetButton');
const fullscreenButton = document.querySelector('#fullscreenButton');
const soundButton = document.querySelector('#soundButton');
const eraseSound = document.querySelector('#eraseSound');
const pageFlipSound = document.querySelector('#pageFlipSound');
const music = document.querySelector('#music');
const scratchLayers = [...document.querySelectorAll('.scratch-layer')];
const BOOK_WIDTH = 1672;
const BOOK_HEIGHT = 941;
const BOOK_RATIO = BOOK_WIDTH / BOOK_HEIGHT;

const state = {
  soundEnabled: false,
  introOpen: false,
  isPointerDown: false,
  lastEraseAt: 0,
  layers: new Map(),
};

function imageCandidates(base) {
  return [`${base}.jpg`, `${base}.png`];
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
  for (const src of imageCandidates(base)) {
    try {
      return { src, image: await loadImage(src) };
    } catch {
      // Try next extension.
    }
  }
  return { src: null, image: null };
}

async function setupResponsiveImages() {
  await Promise.all([...document.querySelectorAll('[data-image-base]')].map(async (element) => {
    const { src } = await firstExistingImage(element.dataset.imageBase);
    if (src) element.src = src;
  }));

  await Promise.all([eraseSound, pageFlipSound, music].map(async (audio) => {
    const [src] = audioCandidates(audio.dataset.audioBase);
    audio.src = src;
  }));

  const eraser = await firstExistingImage('assets/ui/eraser');
  if (eraser.src) {
    document.documentElement.style.setProperty('--eraser-image', `url("../${eraser.src}")`);
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

function drawCover(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const layer = state.layers.get(canvas);

  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);

  if (layer.coverImage) {
    drawImageFill(ctx, layer.coverImage, width, height);
  } else {
    coverFallback(ctx, width, height, canvas.closest('.page-left') ? 'PORTADA IZQ.' : 'PORTADA DCHA.');
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
    bookWidth = rect.width;
    bookHeight = rect.width / BOOK_RATIO;
  } else {
    bookHeight = rect.height;
    bookWidth = rect.height * BOOK_RATIO;
  }

  const bookX = (rect.width - bookWidth) / 2;
  const bookY = (rect.height - bookHeight) / 2;
  stage.style.setProperty('--book-x', `${bookX}px`);
  stage.style.setProperty('--book-y', `${bookY}px`);
  stage.style.setProperty('--book-w', `${bookWidth}px`);
  stage.style.setProperty('--book-h', `${bookHeight}px`);
}

function resizeLayer(canvas) {
  if (!state.layers.has(canvas)) return;
  updateBookGeometry();
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  drawCover(canvas);
}

async function setupLayer(canvas) {
  state.layers.set(canvas, { coverImage: null, erasePoints: [] });
  const { image } = await firstExistingImage(canvas.dataset.coverBase);
  state.layers.get(canvas).coverImage = image;
  resizeLayer(canvas);
}

function eraseAt(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  const layer = state.layers.get(canvas);
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
  if (!state.introOpen) return;
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

  if (state.soundEnabled) {
    music.play().catch(() => {});
  } else {
    music.pause();
  }
}

function openIntro() {
  if (state.introOpen) return;
  state.introOpen = true;
  document.body.classList.remove('intro-active');
  introCover.classList.add('is-hidden');
  setSoundEnabled(true);
  pageFlipSound.currentTime = 0;
  pageFlipSound.play().catch(() => {});
}

function toggleSound() {
  setSoundEnabled(!state.soundEnabled);
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await app.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

function updateFullscreenLabel() {
  fullscreenButton.textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
}

function resetPages() {
  for (const canvas of scratchLayers) {
    const layer = state.layers.get(canvas);
    layer.erasePoints = [];
    drawCover(canvas);
  }
}

async function init() {
  updateBookGeometry();
  await setupResponsiveImages();
  await Promise.all(scratchLayers.map((canvas) => setupLayer(canvas)));
}

const resizeObserver = new ResizeObserver(() => {
  updateBookGeometry();
  scratchLayers.forEach((canvas) => resizeLayer(canvas));
});
resizeObserver.observe(stage);
scratchLayers.forEach((canvas) => resizeObserver.observe(canvas));

stage.addEventListener('pointermove', (event) => {
  updateCursor(event);
  if (state.isPointerDown) eraseFromPointer(event);
});

stage.addEventListener('pointerdown', (event) => {
  if (!state.introOpen) return;
  state.isPointerDown = true;
  stage.classList.add('is-erasing');
  event.target.setPointerCapture?.(event.pointerId);
  eraseFromPointer(event);
});

window.addEventListener('pointerup', () => {
  state.isPointerDown = false;
  stage.classList.remove('is-erasing');
});

document.addEventListener('click', () => {
  if (!state.introOpen) openIntro();
}, { capture: true, once: true });
introCover.addEventListener('click', openIntro, { once: true });
resetButton.addEventListener('click', resetPages);
fullscreenButton.addEventListener('click', toggleFullscreen);
soundButton.addEventListener('click', toggleSound);
document.addEventListener('fullscreenchange', updateFullscreenLabel);

init();
