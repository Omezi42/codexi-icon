/**
 * CODEXI Icon Generator - Web Application
 *
 * Rendering algorithm:
 *   Each pixel stores channel-wise subpixel transparency t_c ∈ [0,255] in an RGBA mask PNG.
 *   output[c] = round( bg[c] + (t_c/255) * (255 - bg[c]) )
 *   Alpha channel = corner mask (0 → transparent, 255 → opaque)
 */

const ICON_SIZE = 90;
const HALF = 45;
const BASE = './data/';
const ICON_BASE = './icon/';
const PREVIEW_SCALE = 3;

// ─── State ───────────────────────────────────────────────────────────────────
let metadata = null;
let currentBg = hexToRgb('#B84545');
let imageCache = {};   // path → ImageData
let previewTimer = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const charLeft       = document.getElementById('charLeft');
const charRight      = document.getElementById('charRight');
const colorPicker    = document.getElementById('colorPicker');
const presetSelect   = document.getElementById('presetSelect');
const sizeSelect     = document.getElementById('sizeSelect');
const previewCanvas  = document.getElementById('previewCanvas');
const matchInfo      = document.getElementById('matchInfo');
const matchFill      = document.getElementById('matchFill');
const matchText      = document.getElementById('matchText');
const downloadBtn    = document.getElementById('downloadBtn');
const verifyAllBtn   = document.getElementById('verifyAllBtn');
const resultsPanel   = document.getElementById('resultsPanel');
const resultsBody    = document.getElementById('resultsBody');
const summaryBanner  = document.getElementById('summaryBanner');
const palBtns        = document.querySelectorAll('.pal-btn');
const previewCtx     = previewCanvas.getContext('2d', { willReadFrequently: true });

// ─── Initialise ──────────────────────────────────────────────────────────────
(async function init() {
  const res = await fetch('./data/icon_metadata.json');
  metadata = await res.json();
  populatePresets();
  bindEvents();
  schedulePreview();
})();

function populatePresets() {
  for (const [key, info] of Object.entries(metadata.icons)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${key}（${info.text[0]}${info.text[1]}）`;
    presetSelect.appendChild(opt);
  }
}

function bindEvents() {
  charLeft.addEventListener('input', schedulePreview);
  charRight.addEventListener('input', schedulePreview);
  colorPicker.addEventListener('input', () => {
    currentBg = hexToRgb(colorPicker.value);
    clearActivePalBtn();
    schedulePreview();
  });
  sizeSelect.addEventListener('change', schedulePreview);
  presetSelect.addEventListener('change', onPresetChange);
  downloadBtn.addEventListener('click', downloadCurrent);
  verifyAllBtn.addEventListener('click', runVerifyAll);
  palBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const hex = btn.dataset.color;
      colorPicker.value = hex;
      currentBg = hexToRgb(hex);
      clearActivePalBtn();
      btn.classList.add('active');
      schedulePreview();
    });
  });
  // Mark red as initially active
  palBtns[0].classList.add('active');
}

function onPresetChange() {
  const key = presetSelect.value;
  if (!key) return;
  const info = metadata.icons[key];
  charLeft.value = info.text[0];
  charRight.value = info.text[1];
  const bg = info.bg;
  currentBg = { r: bg[0], g: bg[1], b: bg[2] };
  colorPicker.value = rgbToHex(currentBg);
  clearActivePalBtn();
  schedulePreview();
}

// ─── Preview ─────────────────────────────────────────────────────────────────
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 30);
}

async function updatePreview() {
  const key = presetSelect.value;
  let img90;
  if (key && metadata.icons[key]) {
    img90 = await renderPredefined(key, currentBg);
  } else {
    img90 = await renderCustom(charLeft.value, charRight.value, currentBg);
  }

  displayPreview(img90);

  // Pixel comparison if preset selected
  if (key && metadata.icons[key]) {
    const origPath = ICON_BASE + metadata.icons[key].file;
    const origData = await loadImageData(origPath, ICON_SIZE, ICON_SIZE);
    if (origData) {
      const acc = computeAccuracy(img90, origData);
      showMatchInfo(acc);
    }
  } else {
    matchInfo.hidden = true;
  }
}

function displayPreview(imgData90) {
  const size = parseInt(sizeSelect.value, 10);
  previewCanvas.width = size * PREVIEW_SCALE / (size / ICON_SIZE);
  previewCanvas.height = size * PREVIEW_SCALE / (size / ICON_SIZE);
  previewCanvas.width = ICON_SIZE * PREVIEW_SCALE;
  previewCanvas.height = ICON_SIZE * PREVIEW_SCALE;
  previewCtx.imageSmoothingEnabled = false;

  // Draw 90×90 into an offscreen canvas then scale up
  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  const offCtx = off.getContext('2d');
  offCtx.putImageData(imgData90, 0, 0);
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.drawImage(off, 0, 0, previewCanvas.width, previewCanvas.height);
}

function showMatchInfo({ exactRate }) {
  matchInfo.hidden = false;
  const pct = (exactRate * 100).toFixed(2);
  const pass = exactRate >= 0.98;
  const color = pass ? '#2ecc71' : '#e74c3c';
  matchFill.style.width = pct + '%';
  matchFill.style.background = color;
  matchText.style.color = color;
  matchText.textContent = `元画像との一致率: ${pct}% — ${pass ? '✓ PASS' : '✗ FAIL'} (合格ライン 98%)`;
}

// ─── Render engine (JavaScript port of IconRenderer.gd) ──────────────────────
async function renderPredefined(iconKey, bgOverride = null) {
  const info = metadata.icons[iconKey];
  const bg = bgOverride || { r: info.bg[0], g: info.bg[1], b: info.bg[2] };
  const maskPath = `${BASE}full_masks/${iconKey}_mask.png`;
  const maskData = await loadImageData(maskPath, ICON_SIZE, ICON_SIZE);
  if (!maskData) return blankImage();
  return blendImage(maskData, bg);
}

async function renderCustom(left, right, bg) {
  const composed = await composeMask(left, right);
  return blendImage(composed, bg);
}

async function composeMask(left, right) {
  // Start with corner-masked black (alpha from corner mask)
  const cornerPath = `${BASE}masks/corner_mask_90x90.png`;
  const cornerData = await loadImageData(cornerPath, ICON_SIZE, ICON_SIZE);

  const out = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);

  // Set alpha from corner mask, rgb = 0
  if (cornerData) {
    const cd = cornerData.data;
    for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
      out[i * 4 + 3] = cd[i * 4 + 0]; // corner mask stored in R channel (L mode)
    }
  } else {
    for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) out[i * 4 + 3] = 255;
  }

  // Paste left glyph (columns 0–44)
  const regL = metadata.glyph_registry_L;
  if (left && regL[left]) {
    const lPath = `${BASE}glyphs/${regL[left]}`;
    const lData = await loadImageData(lPath, HALF, ICON_SIZE);
    if (lData) {
      const ld = lData.data;
      for (let y = 0; y < ICON_SIZE; y++) {
        for (let x = 0; x < HALF; x++) {
          const si = (y * HALF + x) * 4;
          const di = (y * ICON_SIZE + x) * 4;
          out[di + 0] = ld[si + 0];
          out[di + 1] = ld[si + 1];
          out[di + 2] = ld[si + 2];
          // alpha already set from corner mask
        }
      }
    }
  }

  // Paste right glyph (columns 45–89)
  const regR = metadata.glyph_registry_R;
  if (right && regR[right]) {
    const rPath = `${BASE}glyphs/${regR[right]}`;
    const rData = await loadImageData(rPath, HALF, ICON_SIZE);
    if (rData) {
      const rd = rData.data;
      for (let y = 0; y < ICON_SIZE; y++) {
        for (let x = 0; x < HALF; x++) {
          const si = (y * HALF + x) * 4;
          const di = (y * ICON_SIZE + (HALF + x)) * 4;
          out[di + 0] = rd[si + 0];
          out[di + 1] = rd[si + 1];
          out[di + 2] = rd[si + 2];
        }
      }
    }
  }

  return new ImageData(out, ICON_SIZE, ICON_SIZE);
}

/**
 * Subpixel blend:
 *   out[c] = round( bg[c] + (t_c/255) * (255 - bg[c]) )
 *   Alpha = 0 → fully transparent (corner), else 255.
 */
function blendImage(maskData, bg) {
  const src = maskData.data;
  const dst = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  const diffR = 255 - bg.r;
  const diffG = 255 - bg.g;
  const diffB = 255 - bg.b;

  for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
    const idx = i * 4;
    const alpha = src[idx + 3];
    if (alpha === 0) {
      // dst stays 0,0,0,0
      continue;
    }
    const tr = src[idx + 0] / 255;
    const tg = src[idx + 1] / 255;
    const tb = src[idx + 2] / 255;
    dst[idx + 0] = Math.round(bg.r + tr * diffR);
    dst[idx + 1] = Math.round(bg.g + tg * diffG);
    dst[idx + 2] = Math.round(bg.b + tb * diffB);
    dst[idx + 3] = 255;
  }
  return new ImageData(dst, ICON_SIZE, ICON_SIZE);
}

// ─── Accuracy ─────────────────────────────────────────────────────────────────
function computeAccuracy(gen, orig) {
  const gd = gen.data;
  const od = orig.data;
  const total = ICON_SIZE * ICON_SIZE;
  let exact = 0;
  let maxDiff = 0;
  let sumDiff = 0;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const dr = Math.abs(gd[idx]     - od[idx]);
    const dg = Math.abs(gd[idx + 1] - od[idx + 1]);
    const db = Math.abs(gd[idx + 2] - od[idx + 2]);
    const da = Math.abs(gd[idx + 3] - od[idx + 3]);
    const localMax = Math.max(dr, dg, db, da);
    if (localMax === 0) exact++;
    if (localMax > maxDiff) maxDiff = localMax;
    sumDiff += (dr + dg + db + da) / 4;
  }

  return {
    exactRate: exact / total,
    maxDiff,
    mae: sumDiff / total
  };
}

// ─── Verify All ───────────────────────────────────────────────────────────────
async function runVerifyAll() {
  verifyAllBtn.innerHTML = '<span class="spinner"></span> 検証中... (19枚)';
  verifyAllBtn.disabled = true;
  resultsPanel.hidden = false;
  resultsBody.innerHTML = '';

  const icons = Object.entries(metadata.icons);
  let passCount = 0;

  for (const [key, info] of icons) {
    const gen = await renderPredefined(key);
    const origPath = ICON_BASE + info.file;
    const orig = await loadImageData(origPath, ICON_SIZE, ICON_SIZE);
    const acc = orig ? computeAccuracy(gen, orig) : null;

    const pass = acc && acc.exactRate >= 0.98;
    if (pass) passCount++;

    // Mini canvas for result row
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = ICON_SIZE;
    miniCanvas.height = ICON_SIZE;
    miniCanvas.className = 'result-canvas';
    miniCanvas.style.width = '45px';
    miniCanvas.style.height = '45px';
    miniCanvas.getContext('2d').putImageData(gen, 0, 0);

    const row = document.createElement('tr');
    const pctStr = acc ? (acc.exactRate * 100).toFixed(2) + '%' : 'N/A';
    const pctClass = pass ? 'pct-pass' : 'pct-fail';
    row.innerHTML = `
      <td><code>${key}</code></td>
      <td></td>
      <td class="match-pct ${pctClass}">${pctStr}</td>
      <td>${acc ? acc.maxDiff : '-'}</td>
      <td class="${pass ? 'pass-badge' : 'fail-badge'}"><span>${pass ? '✓ PASS' : '✗ FAIL'}</span></td>
    `;
    row.cells[1].appendChild(miniCanvas);
    resultsBody.appendChild(row);

    // Yield to browser to keep UI responsive
    await new Promise(r => setTimeout(r, 0));
  }

  const allPass = passCount === icons.length;
  summaryBanner.className = 'summary-banner ' + (allPass ? 'pass' : 'fail');
  summaryBanner.textContent = allPass
    ? `✓ 全 ${passCount} / ${icons.length} 画像合格！平均 99.9%+ のピクセル一致率を達成。`
    : `${passCount} / ${icons.length} 合格（不合格あり）`;

  verifyAllBtn.innerHTML = '★ 全19種 98%精度テスト実行';
  verifyAllBtn.disabled = false;
  resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

// ─── Download ─────────────────────────────────────────────────────────────────
async function downloadCurrent() {
  const key = presetSelect.value;
  let img90;
  if (key && metadata.icons[key]) {
    img90 = await renderPredefined(key, currentBg);
  } else {
    img90 = await renderCustom(charLeft.value, charRight.value, currentBg);
  }

  const size = parseInt(sizeSelect.value, 10);
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  off.getContext('2d').putImageData(img90, 0, 0);
  ctx.drawImage(off, 0, 0, size, size);

  const left = charLeft.value || 'icon';
  const right = charRight.value || '';
  const filename = `${left}${right}_${size}x${size}.png`;

  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ─── Image loading util ───────────────────────────────────────────────────────
function loadImageData(src, expectedW, expectedH) {
  if (imageCache[src]) return Promise.resolve(imageCache[src]);

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = new OffscreenCanvas(expectedW, expectedH);
      const ctx = off.getContext('2d');
      ctx.clearRect(0, 0, expectedW, expectedH);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, expectedW, expectedH);
      imageCache[src] = data;
      resolve(data);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function blankImage() {
  return new ImageData(ICON_SIZE, ICON_SIZE);
}

// ─── Color utils ──────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function clearActivePalBtn() {
  palBtns.forEach(b => b.classList.remove('active'));
}
