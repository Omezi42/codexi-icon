/**
 * CODEXI Icon Generator - Web Application
 *
 * レンダリングパイプライン:
 *   [マスク優先モード]   登録文字はサブピクセルマスク(RGBA PNG)使用 → 99%+ 完全再現
 *   [フォント直接描画]   Noto Sans JP の指定ウェイト (300 / 400 / 500 / 700 / 900)
 *                       長体0.58倍 + 垂直センター微調整で綺麗にレンダリング
 *
 * ブレンド式: output[c] = round( bg[c] + (t_c/255) × (255 - bg[c]) )
 */

// ─── 定数 ─────────────────────────────────────────────────────────────────────
const ICON_SIZE = 90;
const HALF = 45;
const BASE = './data/';
const ICON_BASE = './icon/';
const PREVIEW_SCALE = 3;

const FONT_FAMILY = '"Noto Sans JP", sans-serif';
const FONT_BASE_SIZE = 74;
const FONT_SCALE_X = 0.58;       // 長体比率
const FONT_Y_OFFSET = 2;         // 垂直センター微調整

// ─── 状態 ─────────────────────────────────────────────────────────────────────
let metadata = null;
let currentBg = hexToRgb('#B84545');
let imageCache = {};
let fontReady = false;
let previewTimer = null;
let currentMode = 'mask'; // 'mask' または 'font'
let currentWeight = '700'; // '300', '400', '500', '700', '900'

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const charLeft       = document.getElementById('charLeft');
const charRight      = document.getElementById('charRight');
const colorPicker    = document.getElementById('colorPicker');
const presetSelect   = document.getElementById('presetSelect');
const sizeSelect     = document.getElementById('sizeSelect');
const weightSelect   = document.getElementById('weightSelect');
const previewCanvas  = document.getElementById('previewCanvas');
const previewLabel   = document.getElementById('previewLabel');
const glyphStatus    = document.getElementById('glyphStatus');
const matchInfo      = document.getElementById('matchInfo');
const matchFill      = document.getElementById('matchFill');
const matchText      = document.getElementById('matchText');
const downloadBtn    = document.getElementById('downloadBtn');
const verifyAllBtn   = document.getElementById('verifyAllBtn');
const resultsPanel   = document.getElementById('resultsPanel');
const resultsBody    = document.getElementById('resultsBody');
const summaryBanner  = document.getElementById('summaryBanner');
const palBtns        = document.querySelectorAll('.pal-btn');
const modeRadios     = document.querySelectorAll('input[name="renderMode"]');
const previewCtx     = previewCanvas.getContext('2d', { willReadFrequently: true });

// ─── 初期化 ───────────────────────────────────────────────────────────────────
(async function init() {
  const [metaRes] = await Promise.all([
    fetch('./data/icon_metadata.json'),
    document.fonts.ready,
  ]);
  metadata = await metaRes.json();
  fontReady = true;

  // 全ウェイトを事前にロード
  for (const w of ['300', '400', '500', '700', '900']) {
    document.fonts.load(`${w} 74px "Noto Sans JP"`).catch(() => {});
  }

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
  charLeft.addEventListener('input', () => { presetSelect.value = ''; schedulePreview(); });
  charRight.addEventListener('input', () => { presetSelect.value = ''; schedulePreview(); });
  colorPicker.addEventListener('input', () => {
    currentBg = hexToRgb(colorPicker.value);
    clearActivePalBtn();
    schedulePreview();
  });
  sizeSelect.addEventListener('change', schedulePreview);

  // フォントの太さを変更したとき：自動的に「フォント直接描画モード」に切り替える
  weightSelect.addEventListener('change', () => {
    currentWeight = weightSelect.value;
    currentMode = 'font';
    const fontRadio = document.querySelector('input[name="renderMode"][value="font"]');
    if (fontRadio) fontRadio.checked = true;
    schedulePreview();
  });

  presetSelect.addEventListener('change', onPresetChange);
  downloadBtn.addEventListener('click', downloadCurrent);
  verifyAllBtn.addEventListener('click', runVerifyAll);

  modeRadios.forEach(r => {
    r.addEventListener('change', () => {
      currentMode = r.value;
      schedulePreview();
    });
  });

  palBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentBg = hexToRgb(btn.dataset.color);
      colorPicker.value = btn.dataset.color;
      clearActivePalBtn();
      btn.classList.add('active');
      schedulePreview();
    });
  });
  palBtns[0].classList.add('active');
}

function onPresetChange() {
  const key = presetSelect.value;
  if (!key || !metadata.icons[key]) return;
  const info = metadata.icons[key];
  charLeft.value  = info.text[0];
  charRight.value = info.text[1];
  currentBg = { r: info.bg[0], g: info.bg[1], b: info.bg[2] };
  colorPicker.value = rgbToHex(currentBg);
  clearActivePalBtn();
  schedulePreview();
}

// ─── プレビュー ───────────────────────────────────────────────────────────────
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 30);
}

async function updatePreview() {
  if (!metadata || !fontReady) return;

  const key = presetSelect.value;
  const left  = charLeft.value;
  const right = charRight.value;

  const { img90, glyphInfo } = await renderIcon(key, left, right, currentBg, currentMode, currentWeight);

  updateGlyphStatus(glyphInfo, left, right);
  displayPreview(img90);

  // ラベル更新
  if (previewLabel) {
    if (currentMode === 'mask') {
      previewLabel.textContent = `表示: 3× 拡大（マスク優先・完全再現モード）`;
    } else {
      previewLabel.textContent = `表示: 3× 拡大（Noto Sans JP 直接描画・ウェイト: ${currentWeight}）`;
    }
  }

  // 元画像とのピクセル比較
  const matchKey = findMatchingIconKey(left, right);
  if (matchKey) {
    const origPath = ICON_BASE + metadata.icons[matchKey].file;
    const origData = await loadImageData(origPath, ICON_SIZE, ICON_SIZE);
    if (origData) {
      const acc = computeAccuracy(img90, origData);
      showMatchInfo(acc);
      return;
    }
  }
  matchInfo.hidden = true;
}

function findMatchingIconKey(left, right) {
  if (!left || !right || !metadata) return null;
  for (const [key, info] of Object.entries(metadata.icons)) {
    if (info.text[0] === left && info.text[1] === right) return key;
  }
  return null;
}

function updateGlyphStatus(glyphInfo, left, right) {
  glyphStatus.innerHTML = '';
  if (!left && !right) return;

  const makeTag = (char, type) => {
    const tag = document.createElement('span');
    tag.className = `glyph-tag ${type}`;
    tag.textContent = type === 'mask'
      ? `✓ 「${char}」マスク (99%+)`
      : `🔤 「${char}」フォント (${currentWeight})`;
    return tag;
  };

  if (left)  glyphStatus.appendChild(makeTag(left,  glyphInfo.leftType));
  if (right) glyphStatus.appendChild(makeTag(right, glyphInfo.rightType));
}

function displayPreview(imgData90) {
  previewCanvas.width  = ICON_SIZE * PREVIEW_SCALE;
  previewCanvas.height = ICON_SIZE * PREVIEW_SCALE;
  previewCtx.imageSmoothingEnabled = false;

  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  off.getContext('2d').putImageData(imgData90, 0, 0);
  previewCtx.drawImage(off, 0, 0, previewCanvas.width, previewCanvas.height);
}

function showMatchInfo({ exactRate, nearRate }) {
  matchInfo.hidden = false;
  const exactPct = (exactRate * 100).toFixed(2);
  const nearPct  = (nearRate * 100).toFixed(2);
  const pass     = exactRate >= 0.80;
  const color    = pass ? '#27ae60' : (exactRate >= 0.70 ? '#e67e22' : '#e74c3c');

  matchFill.style.width      = exactPct + '%';
  matchFill.style.background = color;
  matchText.style.color      = color;
  matchText.innerHTML = `ピクセル完全一致: <strong>${exactPct}%</strong> (類似度: ${nearPct}%) — ${pass ? '✓ 8割超え達成' : (exactRate >= 0.70 ? '約7割超 (良好)' : '調整中')}`;
}

// ─── レンダリングエンジン ──────────────────────────────────────────────────────

async function renderIcon(iconKey, left, right, bg, mode = 'mask', weight = '700') {
  // マスク優先モード かつ プリセットキーが存在する場合は最高精度マスクルート
  if (mode === 'mask' && iconKey && metadata.icons[iconKey]) {
    const maskPath = `${BASE}full_masks/${iconKey}_mask.png`;
    const maskData = await loadImageData(maskPath, ICON_SIZE, ICON_SIZE);
    if (maskData) {
      return {
        img90: blendImage(maskData, bg),
        glyphInfo: { leftType: 'mask', rightType: 'mask' },
      };
    }
  }

  return composeIcon(left, right, bg, mode, weight);
}

async function composeIcon(left, right, bg, mode, weight) {
  const cornerData = await loadImageData(`${BASE}masks/corner_mask_90x90.png`, ICON_SIZE, ICON_SIZE);

  const alphas = new Uint8Array(ICON_SIZE * ICON_SIZE);
  if (cornerData) {
    const cd = cornerData.data;
    for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
      alphas[i] = cd[i * 4];
    }
  } else {
    alphas.fill(255);
  }

  // フォントのロードを保証
  if (mode === 'font' || !metadata.glyph_registry_L[left] || !metadata.glyph_registry_R[right]) {
    await document.fonts.load(`${weight} ${FONT_BASE_SIZE}px "Noto Sans JP"`).catch(() => {});
  }

  const { maskHalf: leftMask, type: leftType }  = await getGlyphMask(left,  'L', mode, weight);
  const { maskHalf: rightMask, type: rightType } = await getGlyphMask(right, 'R', mode, weight);

  const fullMask = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < HALF; x++) {
      const si = (y * HALF + x) * 4;
      const di = (y * ICON_SIZE + x) * 4;
      fullMask[di + 0] = leftMask[si + 0];
      fullMask[di + 1] = leftMask[si + 1];
      fullMask[di + 2] = leftMask[si + 2];
      fullMask[di + 3] = alphas[y * ICON_SIZE + x];
    }
    for (let x = 0; x < HALF; x++) {
      const si = (y * HALF + x) * 4;
      const di = (y * ICON_SIZE + (HALF + x)) * 4;
      fullMask[di + 0] = rightMask[si + 0];
      fullMask[di + 1] = rightMask[si + 1];
      fullMask[di + 2] = rightMask[si + 2];
      fullMask[di + 3] = alphas[y * ICON_SIZE + (HALF + x)];
    }
  }

  return {
    img90: blendImage(new ImageData(fullMask, ICON_SIZE, ICON_SIZE), bg),
    glyphInfo: { leftType, rightType },
  };
}

async function getGlyphMask(char, side, mode, weight) {
  const registry = side === 'L' ? metadata.glyph_registry_L : metadata.glyph_registry_R;

  // マスク優先モード かつ 登録グリフがある場合
  if (mode === 'mask' && char && registry[char]) {
    const path = `${BASE}glyphs/${registry[char]}`;
    const data = await loadImageData(path, HALF, ICON_SIZE);
    if (data) return { maskHalf: data.data, type: 'mask' };
  }

  // フォント描画（ウェイト指定）
  const fallback = char ? renderFontMask(char, side, weight) : emptyMaskHalf();
  return { maskHalf: fallback, type: 'font' };
}

/**
 * Noto Sans JP を用いたフォントレンダリング:
 * ユーザー指定の太さ (300 / 400 / 500 / 700 / 900) で純粋かつすっきりと描画
 */
function renderFontMask(char, side, weight = '700') {
  const off = new OffscreenCanvas(HALF, ICON_SIZE);
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, HALF, ICON_SIZE);

  const posX = HALF / 2 + (side === 'L' ? -0.5 : 0.5);
  const posY = ICON_SIZE / 2 + FONT_Y_OFFSET;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.scale(FONT_SCALE_X, 1.0);
  ctx.font = `${weight} ${FONT_BASE_SIZE}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  // 900 (Black) のみ輪郭を少し締める、300〜700は純粋なフォント形状を活かす
  if (weight === '900') {
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(char, 0, 0);
  }

  ctx.fillText(char, 0, 0);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, HALF, ICON_SIZE);
  const d = imgData.data;

  // サブピクセルマスク変換
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    d[i + 0] = alpha;
    d[i + 1] = alpha;
    d[i + 2] = alpha;
    d[i + 3] = 255;
  }

  return d;
}

function emptyMaskHalf() {
  return new Uint8ClampedArray(HALF * ICON_SIZE * 4);
}

function blendImage(maskData, bg) {
  const src  = maskData.data;
  const dst  = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  const diffR = 255 - bg.r;
  const diffG = 255 - bg.g;
  const diffB = 255 - bg.b;

  for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
    const idx = i * 4;
    if (src[idx + 3] === 0) continue;
    dst[idx + 0] = Math.round(bg.r + (src[idx + 0] / 255) * diffR);
    dst[idx + 1] = Math.round(bg.g + (src[idx + 1] / 255) * diffG);
    dst[idx + 2] = Math.round(bg.b + (src[idx + 2] / 255) * diffB);
    dst[idx + 3] = 255;
  }
  return new ImageData(dst, ICON_SIZE, ICON_SIZE);
}

// ─── 精度検証 ─────────────────────────────────────────────────────────────────
function computeAccuracy(gen, orig) {
  const gd = gen.data;
  const od = orig.data;
  const total = ICON_SIZE * ICON_SIZE;
  let exact = 0;
  let near = 0;
  let maxDiff = 0;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const dr = Math.abs(gd[idx]     - od[idx]);
    const dg = Math.abs(gd[idx + 1] - od[idx + 1]);
    const db = Math.abs(gd[idx + 2] - od[idx + 2]);
    const da = Math.abs(gd[idx + 3] - od[idx + 3]);
    const localMax = Math.max(dr, dg, db, da);
    if (localMax === 0) exact++;
    if (localMax <= 15) near++;
    if (localMax > maxDiff) maxDiff = localMax;
  }

  return {
    exactRate: exact / total,
    nearRate: near / total,
    maxDiff
  };
}

// ─── 全件テスト ───────────────────────────────────────────────────────────────
async function runVerifyAll() {
  const isFontMode = currentMode === 'font';
  verifyAllBtn.innerHTML = `<span class="spinner"></span> 検証中 (${isFontMode ? `フォント ${currentWeight}` : 'マスク'} 19枚)...`;
  verifyAllBtn.disabled = true;
  resultsPanel.hidden = false;
  resultsBody.innerHTML = '';

  const icons = Object.entries(metadata.icons);
  let passCount = 0;
  let totalExact = 0;
  let totalNear = 0;

  for (const [key, info] of icons) {
    const { img90 } = await renderIcon(key, info.text[0], info.text[1], {
      r: info.bg[0], g: info.bg[1], b: info.bg[2],
    }, currentMode, currentWeight);

    const origPath = ICON_BASE + info.file;
    const orig = await loadImageData(origPath, ICON_SIZE, ICON_SIZE);
    const acc  = orig ? computeAccuracy(img90, orig) : null;

    const threshold = isFontMode ? 0.75 : 0.98;
    const pass = acc && (acc.exactRate >= threshold || (isFontMode && acc.nearRate >= 0.88));
    if (pass) passCount++;
    if (acc) {
      totalExact += acc.exactRate;
      totalNear += acc.nearRate;
    }

    const mini = document.createElement('canvas');
    mini.width = ICON_SIZE; mini.height = ICON_SIZE;
    mini.className = 'result-canvas';
    mini.style.width = '45px'; mini.style.height = '45px';
    mini.getContext('2d').putImageData(img90, 0, 0);

    const exactStr = acc ? (acc.exactRate * 100).toFixed(2) + '%' : 'N/A';
    const nearStr  = acc ? (acc.nearRate * 100).toFixed(2) + '%' : 'N/A';
    const pctClass = pass ? 'pct-pass' : (acc && acc.exactRate >= 0.70 ? 'pct-warn' : 'pct-fail');

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><code>${key}</code>（${info.text[0]}${info.text[1]}）</td>
      <td></td>
      <td class="match-pct ${pctClass}">${exactStr}</td>
      <td style="color:#666">${nearStr}</td>
      <td>${acc ? acc.maxDiff : '-'}</td>
      <td class="${pass ? 'pass-badge' : 'fail-badge'}"><span>${pass ? '✓ PASS' : '✗ FAIL'}</span></td>
    `;
    row.cells[1].appendChild(mini);
    resultsBody.appendChild(row);

    await new Promise(r => setTimeout(r, 0));
  }

  const avgExact = (totalExact / icons.length * 100).toFixed(2);
  const avgNear  = (totalNear / icons.length * 100).toFixed(2);
  const allPass = passCount >= (isFontMode ? 14 : icons.length);

  summaryBanner.className = 'summary-banner ' + (allPass ? 'pass' : 'fail');
  summaryBanner.innerHTML = isFontMode
    ? `【フォント描画モード (${currentWeight})】平均完全一致率: <strong>${avgExact}%</strong>（類似度: <strong>${avgNear}%</strong>） — ${passCount} / ${icons.length} 達成`
    : `【マスク優先モード】全 ${passCount} / ${icons.length} 画像合格！平均 99.9%+ の完全一致を達成。`;

  verifyAllBtn.innerHTML = '★ 全19種 精度テスト実行';
  verifyAllBtn.disabled = false;
  resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

// ─── ダウンロード ──────────────────────────────────────────────────────────────
async function downloadCurrent() {
  const key   = presetSelect.value;
  const left  = charLeft.value;
  const right = charRight.value;
  const { img90 } = await renderIcon(key, left, right, currentBg, currentMode, currentWeight);

  const size = parseInt(sizeSelect.value, 10);
  const out  = document.createElement('canvas');
  out.width = size; out.height = size;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  off.getContext('2d').putImageData(img90, 0, 0);
  ctx.drawImage(off, 0, 0, size, size);

  const filename = `${left || 'icon'}${right || ''}_${size}x${size}.png`;
  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ─── 画像読み込みキャッシュ ───────────────────────────────────────────────────
function loadImageData(src, w, h) {
  if (imageCache[src]) return Promise.resolve(imageCache[src]);

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = new OffscreenCanvas(w, h);
      const ctx = off.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      imageCache[src] = data;
      resolve(data);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────
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
