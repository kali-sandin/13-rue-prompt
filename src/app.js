const ERASER_RADIUS = 46;
const ERASER_INTERVAL_MS = 80;

const stage = document.querySelector('#bookStage');
const cursor = document.querySelector('#rubberCursor');
const resetButton = document.querySelector('#resetButton');
const fullscreenButton = document.querySelector('#fullscreenButton');
const soundButton = document.querySelector('#soundButton');
const eraseSound = document.querySelector('#eraseSound');
const music = document.querySelector('#music');
const scratchLayers = [...document.querySelectorAll('.scratch-layer')];

const state = {
  soundEnabled: false,
  isPointerDown: false,
  lastEraseAt: 0,
  layers: new Map(),
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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

function drawCover(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const layer = state.layers.get(canvas);

  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);

  if (layer.coverImage) {
    const imageRatio = layer.coverImage.width / layer.coverImage.height;
    const canvasRatio = width / height;
    let drawWidth = width;
    let drawHeight = height;
    let x = 0;
    let y = 0;

    if (imageRatio > canvasRatio) {
      drawHeight = height;
      drawWidth = height * imageRatio;
      x = (width - drawWidth) / 2;
    } else {
      drawWidth = width;
      drawHeight = width / imageRatio;
      y = (height - drawHeight) / 2;
    }

    ctx.drawImage(layer.coverImage, x, y, drawWidth, drawHeight);
  } else {
    coverFallback(ctx, width, height, canvas.closest('.page-left') ? 'PORTADA IZQ.' : 'PORTADA DCHA.');
  }
}

function resizeLayer(canvas) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  drawCover(canvas);
}

async function setupLayer(canvas) {
  state.layers.set(canvas, { coverImage: null });
  try {
    const coverImage = await loadImage(canvas.dataset.cover);
    state.layers.get(canvas).coverImage = coverImage;
  } catch {
    // Permite trabajar sin assets reales: se pinta una cubierta provisional.
  }
  resizeLayer(canvas);
}

function eraseAt(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

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

async function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  soundButton.setAttribute('aria-pressed', String(state.soundEnabled));
  soundButton.textContent = `Sonido: ${state.soundEnabled ? 'on' : 'off'}`;

  if (state.soundEnabled) {
    music.volume = 0.42;
    eraseSound.volume = 0.7;
    await music.play().catch(() => {});
  } else {
    music.pause();
  }
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await stage.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

function updateFullscreenLabel() {
  fullscreenButton.textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
}

function resetPages() {
  scratchLayers.forEach(drawCover);
}

scratchLayers.forEach((canvas) => setupLayer(canvas));

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) resizeLayer(entry.target);
});
scratchLayers.forEach((canvas) => resizeObserver.observe(canvas));

stage.addEventListener('pointermove', (event) => {
  updateCursor(event);
  if (state.isPointerDown) eraseFromPointer(event);
});

stage.addEventListener('pointerdown', (event) => {
  state.isPointerDown = true;
  stage.classList.add('is-erasing');
  event.target.setPointerCapture?.(event.pointerId);
  eraseFromPointer(event);
});

window.addEventListener('pointerup', () => {
  state.isPointerDown = false;
  stage.classList.remove('is-erasing');
});

resetButton.addEventListener('click', resetPages);
fullscreenButton.addEventListener('click', toggleFullscreen);
soundButton.addEventListener('click', toggleSound);
document.addEventListener('fullscreenchange', updateFullscreenLabel);
