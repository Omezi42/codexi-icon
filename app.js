/**
 * CODEXI Icon Generator - Web Application
 *
 * レンダリングパイプライン:
 *   [登録グリフあり] サブピクセルマスク(RGBA PNG) → blendImage() → 99%+ 精度
 *   [登録グリフなし] Noto Sans JP 900 → fontToMask() → blendImage() → 全文字対応
 *
 * ブレンド式: output[c] = round( bg[c] + (t_c/255) × (255 - bg[c]) )
 */

// ─── 定数 ─────────────────────────────────────────────────────────────────────
const ICON_SIZE = 90;
const HALF = 45;
const BASE = './data/';
const ICON_BASE = './icon/';
const PREVIEW_SCALE = 3;

// フォントフォールバック描画パラメータ（視覚的に元画像スタイルに合わせた値）
const FONT_SIZE = 76;         // pt相当のサイズ
const FONT_SCALE_X = 0.62;    // 水平圧縮率（元画像フォントの横幅比率）
const FONT_Y_OFFSET = 1;      // 垂直位置微調整（px）
const FONT_FAMILY = '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';

// ─── 状態 ─────────────────────────────────────────────────────────────────────
let metadata = null;
let currentBg = hexToRgb('#B84545');
let imageCache = {};
let fontReady = false;
let previewTimer = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const charLeft      = document.getElementById('charLeft');
const charRight     = document.getElementById('charRight');
const colorPicker   = document.getElementById('colorPicker');
const presetSelect  = document.getElementById('presetSelect');
const sizeSelect    = document.getElementById('sizeSelect');
const previewCanvas = document.getElementById('previewCanvas');
const glyphStatus   = document.getElementById('glyphStatus');
const matchInfo     = document.getElementById('matchInfo');
const matchFill     = document.getElementById('matchFill');
const matchText     = document.getElementById('matchText');
const downloadBtn   = document.getElementById('downloadBtn');
const verifyAllBtn  = document.getElementById('verifyAllBtn');
const resultsPanel  = document.getElementById('resultsPanel');
const resultsBody   = document.getElementById('resultsBody');
const summaryBanner = document.getElementById('summaryBanner');
const palBtns       = document.querySelectorAll('.pal-btn');
const previewCtx    = previewCanvas.getContext('2d', { willReadFrequently: true });

// ─── 初期化 ───────────────────────────────────────────────────────────────────
(async function init() {
  const [metaRes] = await Promise.all([
    fetch('./data/icon_metadata.json'),
    document.fonts.ready,
  ]);
  metadata = await metaRes.json();
  fontReady = true;

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
  presetSelect.addEventListener('change', onPresetChange);
  downloadBtn.addEventListener('click', downloadCurrent);
  verifyAllBtn.addEventListener('click', runVerifyAll);

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

  const { img90, glyphInfo } = await renderIcon(key, left, right, currentBg);

  updateGlyphStatus(glyphInfo, left, right);
  displayPreview(img90);

  // 対応するオリジナル画像がある場合のみピクセル比較
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

/** 入力文字の組み合わせが既存アイコンと一致するkey を返す */
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
      ? `✓ 「${char}」マスク`
      : `⚠ 「${char}」フォント`;
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

function showMatchInfo({ exactRate, maxDiff }) {
  matchInfo.hidden = false;
  const pct  = (exactRate * 100).toFixed(2);
  const pass = exactRate >= 0.98;
  const color = pass ? '#27ae60' : '#e74c3c';
  matchFill.style.width      = pct + '%';
  matchFill.style.background = color;
  matchText.style.color      = color;
  matchText.textContent = `元画像との一致率: ${pct}% — ${pass ? '✓ PASS' : '✗ FAIL'} (合格ライン 98%)`;
}

// ─── レンダリングエンジン ──────────────────────────────────────────────────────

/**
 * アイコンを1枚レンダリングする。
 * preset key があれば full_mask を優先使用。
 * それ以外はグリフレジストリを参照し、未登録文字はフォントフォールバックへ。
 */
async function renderIcon(iconKey, left, right, bg) {
  // プリセットキーが指定されていてマスクが存在する場合は最高精度ルート
  if (iconKey && metadata.icons[iconKey]) {
    const maskPath = `${BASE}full_masks/${iconKey}_mask.png`;
    const maskData = await loadImageData(maskPath, ICON_SIZE, ICON_SIZE);
    if (maskData) {
      return {
        img90: blendImage(maskData, bg),
        glyphInfo: { leftType: 'mask', rightType: 'mask' },
      };
    }
  }

  // カスタム合成ルート
  return composeCustomIcon(left, right, bg);
}

async function composeCustomIcon(left, right, bg) {
  const cornerData = await loadImageData(`${BASE}masks/corner_mask_90x90.png`, ICON_SIZE, ICON_SIZE);

  // 角丸アルファを初期値に
  const alphas = new Uint8Array(ICON_SIZE * ICON_SIZE);
  if (cornerData) {
    const cd = cornerData.data;
    for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
      alphas[i] = cd[i * 4]; // R channel = alpha value
    }
  } else {
    alphas.fill(255);
  }

  // 左グリフマスク取得（登録 → マスク、未登録 → フォント変換）
  const { maskHalf: leftMask, type: leftType }  = await getGlyphMask(left,  'L');
  const { maskHalf: rightMask, type: rightType } = await getGlyphMask(right, 'R');

  // フルサイズマスク合成
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

/**
 * 指定文字の半幅マスク（45×90 RGBA）を取得する。
 * 登録済み → PNG マスクを返す
 * 未登録   → フォントレンダリングでマスクを生成
 */
async function getGlyphMask(char, side) {
  const registry = side === 'L' ? metadata.glyph_registry_L : metadata.glyph_registry_R;

  if (char && registry[char]) {
    const path = `${BASE}glyphs/${registry[char]}`;
    const data = await loadImageData(path, HALF, ICON_SIZE);
    if (data) return { maskHalf: data.data, type: 'mask' };
  }

  // フォントフォールバック
  const fallback = char ? fontToMask(char) : emptyMaskHalf();
  return { maskHalf: fallback, type: char ? 'font' : 'mask' };
}

/**
 * Noto Sans JP でテキストをレンダリングしてサブピクセルマスク形式に変換する。
 * 変換後: R=G=B=α (uniform transparency), A=255 (alphaはcorner maskで管理)
 */
function fontToMask(char) {
  const off = new OffscreenCanvas(HALF, ICON_SIZE);
  const ctx = off.getContext('2d');

  ctx.clearRect(0, 0, HALF, ICON_SIZE);
  ctx.save();
  ctx.translate(HALF / 2, ICON_SIZE / 2 + FONT_Y_OFFSET);
  ctx.scale(FONT_SCALE_X, 1);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 0, 0);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, HALF, ICON_SIZE);
  const d = imgData.data;

  // Aチャンネルをサブピクセルマスクのt値として使用（RGB全チャンネル共通）
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
  return new Uint8ClampedArray(HALF * ICON_SIZE * 4); // all zeros
}

/**
 * サブピクセルブレンド:
 *   output[c] = round( bg[c] + (t_c/255) × (255 - bg[c]) )
 *   Alpha=0 → 透明（角丸コーナー）
 */
function blendImage(maskData, bg) {
  const src  = maskData.data;
  const dst  = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  const diffR = 255 - bg.r;
  const diffG = 255 - bg.g;
  const diffB = 255 - bg.b;

  for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
    const idx = i * 4;
    if (src[idx + 3] === 0) continue; // 透明ピクセルはゼロのまま
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
  let maxDiff = 0;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const dr = Math.abs(gd[idx]     - od[idx]);
    const dg = Math.abs(gd[idx + 1] - od[idx + 1]);
    const db = Math.abs(gd[idx + 2] - od[idx + 2]);
    const da = Math.abs(gd[idx + 3] - od[idx + 3]);
    const localMax = Math.max(dr, dg, db, da);
    if (localMax === 0) exact++;
    if (localMax > maxDiff) maxDiff = localMax;
  }

  return { exactRate: exact / total, maxDiff };
}

// ─── 全件テスト ───────────────────────────────────────────────────────────────
async function runVerifyAll() {
  verifyAllBtn.innerHTML = '<span class="spinner"></span> 検証中... (19枚)';
  verifyAllBtn.disabled = true;
  resultsPanel.hidden = false;
  resultsBody.innerHTML = '';

  const icons = Object.entries(metadata.icons);
  let passCount = 0;

  for (const [key, info] of icons) {
    // full_mask を使った最高精度ルートで生成
    const { img90 } = await renderIcon(key, info.text[0], info.text[1], {
      r: info.bg[0], g: info.bg[1], b: info.bg[2],
    });

    const origPath = ICON_BASE + info.file;
    const orig = await loadImageData(origPath, ICON_SIZE, ICON_SIZE);
    const acc  = orig ? computeAccuracy(img90, orig) : null;
    const pass = acc && acc.exactRate >= 0.98;
    if (pass) passCount++;

    // 結果ミニキャンバス
    const mini = document.createElement('canvas');
    mini.width = ICON_SIZE; mini.height = ICON_SIZE;
    mini.className = 'result-canvas';
    mini.style.width = '45px'; mini.style.height = '45px';
    mini.getContext('2d').putImageData(img90, 0, 0);

    const pctStr   = acc ? (acc.exactRate * 100).toFixed(2) + '%' : 'N/A';
    const pctClass = pass ? 'pct-pass' : 'pct-fail';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><code>${key}</code>（${info.text[0]}${info.text[1]}）</td>
      <td></td>
      <td class="match-pct ${pctClass}">${pctStr}</td>
      <td>${acc ? acc.maxDiff : '-'}</td>
      <td class="${pass ? 'pass-badge' : 'fail-badge'}"><span>${pass ? '✓ PASS' : '✗ FAIL'}</span></td>
    `;
    row.cells[1].appendChild(mini);
    resultsBody.appendChild(row);

    await new Promise(r => setTimeout(r, 0)); // UIを固まらせない
  }

  const allPass = passCount === icons.length;
  summaryBanner.className = 'summary-banner ' + (allPass ? 'pass' : 'fail');
  summaryBanner.textContent = allPass
    ? `✓ 全 ${passCount} / ${icons.length} 画像合格（サブピクセルマスク使用）`
    : `${passCount} / ${icons.length} 合格`;

  verifyAllBtn.innerHTML = '★ 全19種 98%精度テスト実行';
  verifyAllBtn.disabled = false;
  resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

// ─── ダウンロード ──────────────────────────────────────────────────────────────
async function downloadCurrent() {
  const key   = presetSelect.value;
  const left  = charLeft.value;
  const right = charRight.value;
  const { img90 } = await renderIcon(key, left, right, currentBg);

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
