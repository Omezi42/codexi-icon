/**
 * CODEXI Icon Generator - Web Application
 * Modern Image Generator UX Edition
 */

// ─── Constants ─────────────────────────────────────────────────────────────────
const ICON_SIZE = 90;
const HALF = 45;
const BASE = './data/';
const ICON_BASE = './icon/';
const PREVIEW_SCALE = 3;

const FONT_FAMILY = '"Noto Sans JP", sans-serif';
const FONT_BASE_SIZE = 74;
const FONT_SCALE_X = 0.58;

// ─── State ─────────────────────────────────────────────────────────────────────
let metadata = null;
let currentBg = hexToRgb('#B84545');
let currentWeight = '400';
let currentYOffset = -1;
let currentSpacing = 0;
let currentOutputSize = 90;
let currentMode = 'font'; // デフォルトは自由なフォント生成
let imageCache = {};
let fontReady = false;

// クイックテンプレート
const QUICK_TEMPLATES = [
  { text: ['中', '攻'], bg: '#B84545', label: '中攻' },
  { text: ['強', '攻'], bg: '#B84545', label: '強攻' },
  { text: ['弱', '攻'], bg: '#B84545', label: '弱攻' },
  { text: ['防', '御'], bg: '#4547BD', label: '防御' },
  { text: ['投', 'げ'], bg: '#7347C2', label: '投げ' },
  { text: ['溜', 'め'], bg: '#C2C249', label: '溜め' },
  { text: ['必', '殺'], bg: '#D97724', label: '必殺' },
  { text: ['回', '避'], bg: '#2E865F', label: '回避' },
  { text: ['覚', '醒'], bg: '#2A2A2A', label: '覚醒' },
  { text: ['反', '撃'], bg: '#B84545', label: '反撃' },
  { text: ['ス', 'ロ'], bg: '#4547BD', label: 'スロ' },
  { text: ['ソ', 'ー'], bg: '#B84545', label: 'ソー' }
];

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const charLeft         = document.getElementById('charLeft');
const charRight        = document.getElementById('charRight');
const colorPicker      = document.getElementById('colorPicker');
const yOffsetInput     = document.getElementById('yOffsetInput');
const yOffsetVal       = document.getElementById('yOffsetVal');
const spacingInput     = document.getElementById('spacingInput');
const spacingVal       = document.getElementById('spacingVal');
const resetAdjustBtn   = document.getElementById('resetAdjustBtn');
const previewCanvas    = document.getElementById('previewCanvas');
const actualCanvas     = document.getElementById('actualCanvas');
const copyToast        = document.getElementById('copyToast');
const renderBadge      = document.getElementById('renderBadge');
const matchScoreBadge  = document.getElementById('matchScoreBadge');
const downloadBtn      = document.getElementById('downloadBtn');
const copyBtn          = document.getElementById('copyBtn');
const templateChips    = document.getElementById('templateChips');
const colorChips       = document.querySelectorAll('.color-chip');
const sizeChips        = document.querySelectorAll('.size-chip');
const weightChips      = document.querySelectorAll('.weight-chip');
const verifyAllBtn     = document.getElementById('verifyAllBtn');
const resultsPanel     = document.getElementById('resultsPanel');
const resultsBody      = document.getElementById('resultsBody');
const summaryBanner    = document.getElementById('summaryBanner');
const modeRadios       = document.querySelectorAll('input[name="renderMode"]');

const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
const actualCtx  = actualCanvas.getContext('2d', { willReadFrequently: true });

// ─── Initialisation ───────────────────────────────────────────────────────────
(async function init() {
  const [metaRes] = await Promise.all([
    fetch('./data/icon_metadata.json').catch(() => null),
    document.fonts.ready,
  ]);

  if (metaRes) {
    try {
      metadata = await metaRes.json();
    } catch (e) {
      console.error('Failed to parse metadata', e);
    }
  }
  fontReady = true;

  // 全ウェイトを先読み
  for (const w of ['300', '400', '500', '700', '900']) {
    document.fonts.load(`${w} 74px "Noto Sans JP"`).catch(() => {});
  }

  buildTemplates();
  bindUIEvents();
  renderPreview();
})();

function buildTemplates() {
  templateChips.innerHTML = '';
  QUICK_TEMPLATES.forEach(tpl => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl-chip';
    btn.innerHTML = `<span class="tpl-chip-dot" style="background:${tpl.bg}"></span>${tpl.label}`;
    btn.addEventListener('click', () => {
      charLeft.value = tpl.text[0];
      charRight.value = tpl.text[1];
      setColor(tpl.bg);
      renderPreview();
    });
    templateChips.appendChild(btn);
  });
}

function bindUIEvents() {
  // 文字入力（1文字入力時は自動フォーカス等もスムーズに）
  charLeft.addEventListener('input', () => {
    if (charLeft.value.length === 1 && charRight.value === '') {
      charRight.focus();
    }
    renderPreview();
  });
  charRight.addEventListener('input', renderPreview);

  // カラーパレット
  colorChips.forEach(chip => {
    chip.addEventListener('click', () => {
      colorChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      setColor(chip.dataset.color);
      renderPreview();
    });
  });

  colorPicker.addEventListener('input', () => {
    colorChips.forEach(c => c.classList.remove('active'));
    setColor(colorPicker.value);
    renderPreview();
  });

  // ウェイト選択
  weightChips.forEach(chip => {
    chip.addEventListener('click', () => {
      weightChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentWeight = chip.dataset.weight;
      renderPreview();
    });
  });

  // スライダー調整
  yOffsetInput.addEventListener('input', () => {
    currentYOffset = parseInt(yOffsetInput.value, 10);
    yOffsetVal.textContent = `${currentYOffset > 0 ? '+' : ''}${currentYOffset} px`;
    renderPreview();
  });

  spacingInput.addEventListener('input', () => {
    currentSpacing = parseInt(spacingInput.value, 10);
    spacingVal.textContent = `${currentSpacing > 0 ? '+' : ''}${currentSpacing} px`;
    renderPreview();
  });

  // 初期値リセット
  resetAdjustBtn.addEventListener('click', () => {
    currentYOffset = -1;
    currentSpacing = 0;
    yOffsetInput.value = -1;
    spacingInput.value = 0;
    yOffsetVal.textContent = '-1 px';
    spacingVal.textContent = '0 px';
    renderPreview();
  });

  // 出力サイズ選択
  sizeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      sizeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentOutputSize = parseInt(chip.dataset.size, 10);
    });
  });

  // アクションボタン
  downloadBtn.addEventListener('click', downloadCurrentIcon);
  copyBtn.addEventListener('click', copyIconToClipboard);

  // 開発者用モード
  modeRadios.forEach(r => {
    r.addEventListener('change', () => {
      currentMode = r.value;
      renderPreview();
    });
  });
  verifyAllBtn.addEventListener('click', runVerifyAll);
}

function setColor(hex) {
  currentBg = hexToRgb(hex);
  colorPicker.value = hex;
}

// ─── Rendering Pipeline ───────────────────────────────────────────────────────
async function renderPreview() {
  if (!fontReady) return;

  const left = charLeft.value || '';
  const right = charRight.value || '';

  // アイコン生成
  const img90 = await generateIconImage(left, right, currentBg, currentMode, currentWeight, currentYOffset, currentSpacing);

  // 拡大プレビュー描画 (270x270)
  previewCanvas.width = ICON_SIZE * PREVIEW_SCALE;
  previewCanvas.height = ICON_SIZE * PREVIEW_SCALE;
  previewCtx.imageSmoothingEnabled = false;
  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  off.getContext('2d').putImageData(img90, 0, 0);
  previewCtx.drawImage(off, 0, 0, previewCanvas.width, previewCanvas.height);

  // 実寸大プレビュー描画 (90x90)
  actualCtx.putImageData(img90, 0, 0);

  // バッジ & 一致度チェック
  updateStatusAndMatch(left, right, img90);
}

async function generateIconImage(left, right, bg, mode, weight, yOff, spacing) {
  // 原本マスク優先モードで、かつ既存アイコンと一致する場合
  const matchKey = findMatchingIconKey(left, right);
  if (mode === 'mask' && matchKey && metadata && metadata.icons[matchKey]) {
    const maskPath = `${BASE}full_masks/${matchKey}_mask.png`;
    const maskData = await loadImageData(maskPath, ICON_SIZE, ICON_SIZE);
    if (maskData) {
      return blendImage(maskData, bg);
    }
  }

  // 1文字のみの場合は中央配置、2文字なら左右配置
  if (left && !right) {
    return composeSingleCharacter(left, bg, weight, yOff);
  } else if (!left && right) {
    return composeSingleCharacter(right, bg, weight, yOff);
  }

  return composeDoubleCharacter(left, right, bg, weight, yOff, spacing);
}

/** 2文字のアイコン合成 */
async function composeDoubleCharacter(left, right, bg, weight, yOff, spacing) {
  const cornerData = await loadImageData(`${BASE}masks/corner_mask_90x90.png`, ICON_SIZE, ICON_SIZE);
  const alphas = new Uint8Array(ICON_SIZE * ICON_SIZE);
  if (cornerData) {
    const cd = cornerData.data;
    for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) alphas[i] = cd[i * 4];
  } else {
    alphas.fill(255);
  }

  await document.fonts.load(`${weight} ${FONT_BASE_SIZE}px "Noto Sans JP"`).catch(() => {});

  const leftMask = left ? renderHalfGlyph(left, 'L', weight, yOff, spacing) : emptyHalf();
  const rightMask = right ? renderHalfGlyph(right, 'R', weight, yOff, spacing) : emptyHalf();

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

  return blendImage(new ImageData(fullMask, ICON_SIZE, ICON_SIZE), bg);
}

/** 1文字のみの場合：アイコン中央に大きくドカンと配置 */
async function composeSingleCharacter(char, bg, weight, yOff) {
  const cornerData = await loadImageData(`${BASE}masks/corner_mask_90x90.png`, ICON_SIZE, ICON_SIZE);
  const alphas = new Uint8Array(ICON_SIZE * ICON_SIZE);
  if (cornerData) {
    const cd = cornerData.data;
    for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) alphas[i] = cd[i * 4];
  } else {
    alphas.fill(255);
  }

  await document.fonts.load(`${weight} 80px "Noto Sans JP"`).catch(() => {});

  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

  ctx.save();
  ctx.translate(ICON_SIZE / 2, ICON_SIZE / 2 + yOff);
  ctx.scale(0.85, 1.0); // 1文字用のアスペクト比
  ctx.font = `${weight} 80px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(char, 0, 0);
  ctx.restore();

  const d = ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data;
  const fullMask = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);

  for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
    const idx = i * 4;
    const a = d[idx + 3];
    fullMask[idx + 0] = a;
    fullMask[idx + 1] = a;
    fullMask[idx + 2] = a;
    fullMask[idx + 3] = alphas[i];
  }

  return blendImage(new ImageData(fullMask, ICON_SIZE, ICON_SIZE), bg);
}

/** 半幅グリフ描画 */
function renderHalfGlyph(char, side, weight, yOff, spacing) {
  const off = new OffscreenCanvas(HALF, ICON_SIZE);
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, HALF, ICON_SIZE);

  const shiftX = side === 'L' ? spacing : -spacing;
  const posX = HALF / 2 + shiftX;
  const posY = ICON_SIZE / 2 + yOff;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.scale(FONT_SCALE_X, 1.0);
  ctx.font = `${weight} ${FONT_BASE_SIZE}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  if (weight === '900') {
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(char, 0, 0);
  }

  ctx.fillText(char, 0, 0);
  ctx.restore();

  const d = ctx.getImageData(0, 0, HALF, ICON_SIZE).data;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    d[i + 0] = alpha;
    d[i + 1] = alpha;
    d[i + 2] = alpha;
    d[i + 3] = 255;
  }
  return d;
}

function emptyHalf() {
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

// ─── Status & Matching ────────────────────────────────────────────────────────
async function updateStatusAndMatch(left, right, img90) {
  const matchKey = findMatchingIconKey(left, right);

  if (currentMode === 'mask' && matchKey) {
    renderBadge.textContent = '原本マスク完全再現';
    renderBadge.style.background = '#dbeafe';
    renderBadge.style.color = '#1e40af';
  } else {
    renderBadge.textContent = `フォント生成 (${currentWeight})`;
    renderBadge.style.background = '#f1f5f9';
    renderBadge.style.color = '#475569';
  }

  if (matchKey && metadata && metadata.icons[matchKey]) {
    const origPath = ICON_BASE + metadata.icons[matchKey].file;
    const origData = await loadImageData(origPath, ICON_SIZE, ICON_SIZE);
    if (origData) {
      const acc = computeAccuracy(img90, origData);
      matchScoreBadge.hidden = false;
      const pct = (acc.exactRate * 100).toFixed(1);
      matchScoreBadge.textContent = `原本一致率: ${pct}%`;
      matchScoreBadge.style.background = acc.exactRate >= 0.8 ? '#dcfce7' : '#fef3c7';
      matchScoreBadge.style.color = acc.exactRate >= 0.8 ? '#166534' : '#92400e';
      return;
    }
  }
  matchScoreBadge.hidden = true;
}

function findMatchingIconKey(left, right) {
  if (!left && !right) return null;
  if (!metadata || !metadata.icons) return null;
  for (const [key, info] of Object.entries(metadata.icons)) {
    if (info.text[0] === left && info.text[1] === right) return key;
  }
  return null;
}

// ─── Export & Clipboard ───────────────────────────────────────────────────────
async function createExportCanvas() {
  const left = charLeft.value || '';
  const right = charRight.value || '';
  const img90 = await generateIconImage(left, right, currentBg, currentMode, currentWeight, currentYOffset, currentSpacing);

  const canvas = document.createElement('canvas');
  canvas.width = currentOutputSize;
  canvas.height = currentOutputSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const off = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  off.getContext('2d').putImageData(img90, 0, 0);
  ctx.drawImage(off, 0, 0, currentOutputSize, currentOutputSize);

  return canvas;
}

async function downloadCurrentIcon() {
  const canvas = await createExportCanvas();
  const left = charLeft.value || 'icon';
  const right = charRight.value || '';
  const filename = `${left}${right}_${currentOutputSize}x${currentOutputSize}.png`;

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

async function copyIconToClipboard() {
  try {
    const canvas = await createExportCanvas();
    canvas.toBlob(async blob => {
      if (!blob) return;
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      showToast();
    }, 'image/png');
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    alert('クリップボードへのコピーに対応していません。ダウンロードボタンをご利用ください。');
  }
}

function showToast() {
  copyToast.hidden = false;
  setTimeout(() => { copyToast.hidden = true; }, 2000);
}

// ─── Accuracy & Developer Verification ────────────────────────────────────────
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

  return { exactRate: exact / total, nearRate: near / total, maxDiff };
}

async function runVerifyAll() {
  verifyAllBtn.innerHTML = '<span class="spinner"></span> 検証実行中...';
  verifyAllBtn.disabled = true;
  resultsPanel.hidden = false;
  resultsBody.innerHTML = '';

  const icons = Object.entries(metadata.icons);
  let passCount = 0;
  let totalExact = 0;
  let totalNear = 0;

  for (const [key, info] of icons) {
    const img90 = await generateIconImage(
      info.text[0], info.text[1],
      { r: info.bg[0], g: info.bg[1], b: info.bg[2] },
      currentMode, currentWeight, currentYOffset, currentSpacing
    );

    const orig = await loadImageData(ICON_BASE + info.file, ICON_SIZE, ICON_SIZE);
    const acc = orig ? computeAccuracy(img90, orig) : null;

    const threshold = currentMode === 'font' ? 0.75 : 0.98;
    const pass = acc && (acc.exactRate >= threshold || acc.nearRate >= 0.88);
    if (pass) passCount++;
    if (acc) {
      totalExact += acc.exactRate;
      totalNear += acc.nearRate;
    }

    const mini = document.createElement('canvas');
    mini.width = ICON_SIZE; mini.height = ICON_SIZE;
    mini.className = 'result-canvas';
    mini.style.width = '36px'; mini.style.height = '36px';
    mini.getContext('2d').putImageData(img90, 0, 0);

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${key}</strong> (${info.text[0]}${info.text[1]})</td>
      <td></td>
      <td style="font-weight:700;color:${pass ? '#16a34a' : '#d97706'}">${acc ? (acc.exactRate * 100).toFixed(1) + '%' : '-'}</td>
      <td style="color:#64748b">${acc ? (acc.nearRate * 100).toFixed(1) + '%' : '-'}</td>
      <td>${acc ? acc.maxDiff : '-'}</td>
      <td class="${pass ? 'pass-badge' : 'fail-badge'}"><span>${pass ? 'PASS' : 'FAIL'}</span></td>
    `;
    row.cells[1].appendChild(mini);
    resultsBody.appendChild(row);

    await new Promise(r => setTimeout(r, 0));
  }

  const avgExact = (totalExact / icons.length * 100).toFixed(1);
  const avgNear  = (totalNear / icons.length * 100).toFixed(1);
  summaryBanner.className = `summary-banner ${passCount >= 14 ? 'pass' : 'fail'}`;
  summaryBanner.innerHTML = `【テスト完了】平均一致率: <strong>${avgExact}%</strong>（類似度: <strong>${avgNear}%</strong>） — ${passCount} / ${icons.length} 達成`;

  verifyAllBtn.innerHTML = '★ 全19種 ピクセル精度テストを再実行';
  verifyAllBtn.disabled = false;
}

// ─── Image Cache & Utils ──────────────────────────────────────────────────────
function loadImageData(src, w, h) {
  if (imageCache[src]) return Promise.resolve(imageCache[src]);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = new OffscreenCanvas(w, h);
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      imageCache[src] = data;
      resolve(data);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
