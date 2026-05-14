// ============================================================
// Desktop Pet - Main Application
// ============================================================

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, Window, getAllWindows } = window.__TAURI__.window;
const { WebviewWindow } = window.__TAURI__.webviewWindow;
const { listen } = window.__TAURI__.event;

// ============================================================
// Configuration
// ============================================================

const CANVAS_SIZE = 500;
const FRAME_DURATION = 200; // ms per animation frame (fast and fluid loop to eliminate slideshow stuttering feel)

// Each sprite sheet is a 3x4 grid = 12 frames
const GRID_COLS = 3;
const GRID_ROWS = 4;

const STATES = {
  eat: { src: '/assets/oolong_eat.png', frames: 12, label: '吃饭中~' },
  sleep: { src: '/assets/oolong_sleep.png', frames: 1, label: 'Zzz...', single: true },
  play: { src: '/assets/oolong_play.png', frames: 1, label: '玩耍中~', single: true },
  play2: { src: '/assets/oolong_play2.png', frames: 1, label: '玩耍中~', single: true },
  daze: { src: '/assets/oolong_daze.png', frames: 1, label: '发呆中...', single: true, scale: 1.35, marginTop: 0, marginX: 0 },
  daze2: { src: '/assets/oolong_daze2.png', frames: 1, label: '发呆中...', single: true, scale: 1.25, marginTop: 0, marginX: 0 },
  gaze: { src: '/assets/oolong_daze.png', frames: 1, label: '注视中...', single: true, scale: 1.3, marginTop: 0, marginX: 0 },
};

// 各品种专属状态素材（覆盖默认 oolong 的图）。未列出的状态自动 fallback 到默认 STATES。
const THEME_STATE_OVERRIDES = {
  tiger: {
    sleep: { src: '/assets/tiger_sleep.png', frames: 1, label: 'Zzz...', single: true },
    daze: { src: '/assets/tiger_daze.png', frames: 1, label: '发呆中...', single: true, scale: 1.35, marginTop: 0, marginX: 0 },
    daze2: { src: '/assets/tiger_daze.png', frames: 1, label: '发呆中...', single: true, scale: 1.35, marginTop: 0, marginX: 0 },
    gaze: { src: '/assets/tiger_gaze.png', frames: 1, label: '注视中...', single: true, scale: 1.3, marginTop: 0, marginX: 0 },
  },
};

// 多宠物品种切换支持
const PET_THEMES = [
  {
    id: 'oolong',
    name: '乌龙茶',
    filter: 'none',
    label: '乌龙茶',
    menu: ['eat', 'sleep', 'play', 'daze', 'pet'],
  },
  {
    id: 'tiger',
    name: '虎皮卷',
    filter: 'none',
    label: '虎皮卷',
    menu: ['sleep', 'daze', 'gaze', 'pet'],
  },
  {
    id: 'car',
    name: '小车',
    filter: 'grayscale(0.6) saturate(1.5) hue-rotate(190deg) brightness(0.95)',
    label: '小车',
    menu: ['eat', 'sleep', 'play', 'daze', 'pet'],
  },
];

// 菜单项配置：图标 + 标签
const MENU_ITEMS = {
  eat:      { icon: '🍗', label: '吃饭' },
  sleep:    { icon: '😴', label: '睡觉' },
  play:     { icon: '⚽', label: '玩耍' },
  daze:     { icon: '😶', label: '发呆' },
  gaze:     { icon: '👀', label: '注视' },
  pet:      { icon: '💖', label: '摸摸头' },
  settings: { icon: '⚙️', label: '设置' },
};

let currentPetThemeIndex = 0;
const savedTheme = localStorage.getItem('pet_current_theme');
if (savedTheme) {
  const idx = PET_THEMES.findIndex(t => t.id === savedTheme);
  if (idx !== -1) currentPetThemeIndex = idx;
}
window.addEventListener('storage', (e) => {
  if (e.key === 'pet_current_theme') {
    const idx = PET_THEMES.findIndex(t => t.id === e.newValue);
    if (idx !== -1) {
      currentPetThemeIndex = idx;
      showBubble(`已切换至: ${PET_THEMES[idx].name} 🐱`);
    }
  }
});

// 用户可手动调节的整体桌宠尺寸（50% ~ 200%）
let petScale = parseFloat(localStorage.getItem('pet_size_scale')) || 1.0;
window.addEventListener('storage', (e) => {
  if (e.key === 'pet_size_scale') {
    petScale = parseFloat(e.newValue) || 1.0;
  }
});

// ============================================================
// 用户偏好设置（持久化存于 localStorage，跨窗口同步）
// ============================================================

const userSettings = {
  autoActions: localStorage.getItem('pet_auto_actions_enabled') !== 'false', // 默认开
  actionFrequency: localStorage.getItem('pet_action_frequency') || 'normal', // calm | normal | active
  opacity: parseFloat(localStorage.getItem('pet_opacity')) || 1.0,
  birthday: localStorage.getItem('pet_birthday') || '',
  customSchedule: JSON.parse(localStorage.getItem('pet_schedule') || 'null'),
  customMessages: JSON.parse(localStorage.getItem('pet_messages') || 'null'),
};

// 应用透明度
function applyOpacity() {
  document.documentElement.style.opacity = String(userSettings.opacity);
}

// 统一的设置变更应用函数
function applySetting(key, value) {
  switch (key) {
    case 'pet_size_scale':
      petScale = parseFloat(value) || 1.0;
      break;
    case 'pet_current_theme': {
      const idx = PET_THEMES.findIndex(t => t.id === value);
      if (idx !== -1) {
        currentPetThemeIndex = idx;
        showBubble(`已切换至: ${PET_THEMES[idx].name} 🐱`);
      }
      break;
    }
    case 'pet_auto_actions_enabled':
      userSettings.autoActions = value !== 'false';
      break;
    case 'pet_action_frequency':
      userSettings.actionFrequency = value || 'normal';
      break;
    case 'pet_opacity':
      userSettings.opacity = parseFloat(value) || 1.0;
      applyOpacity();
      break;
    case 'pet_birthday':
      userSettings.birthday = value || '';
      break;
    case 'pet_schedule':
      try { userSettings.customSchedule = JSON.parse(value || 'null'); } catch (e) {}
      break;
    case 'pet_messages':
      try { userSettings.customMessages = JSON.parse(value || 'null'); } catch (e) {}
      break;
    case 'pet_stats_request_reset':
      resetStats();
      break;
  }
}

// 监听 localStorage（同进程 / 同 webview 间生效）
window.addEventListener('storage', (e) => applySetting(e.key, e.newValue));

// 监听 Tauri 事件（跨 webview 同步，更稳定）
listen('settings:changed', (event) => {
  const { key, value } = event.payload || {};
  if (key) applySetting(key, value);
}).catch((e) => console.error('settings listen failed', e));

// 行为频率映射（最小延迟 ~ 最大延迟 ms）
const FREQUENCY_RANGES = {
  calm:   [120000, 300000],   // 安静：2-5 分钟
  normal: [15000,  45000],    // 默认：15-45 秒
  active: [5000,   15000],    // 活跃：5-15 秒
};

// ============================================================
// 统计数据
// ============================================================

const stats = (() => {
  const raw = localStorage.getItem('pet_stats');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  return { firstSeen: Date.now(), petCount: 0, switchCount: 0, sessions: 0 };
})();

stats.sessions = (stats.sessions || 0) + 1;

function saveStats() {
  localStorage.setItem('pet_stats', JSON.stringify(stats));
}

function resetStats() {
  stats.firstSeen = Date.now();
  stats.petCount = 0;
  stats.switchCount = 0;
  stats.sessions = 1;
  saveStats();
}

saveStats();

function switchNextPet() {
  currentPetThemeIndex = (currentPetThemeIndex + 1) % PET_THEMES.length;
  const currentTheme = PET_THEMES[currentPetThemeIndex];
  localStorage.setItem('pet_current_theme', currentTheme.id);
  showBubble(`换宠成功: ${currentTheme.name} 🎉`);
  console.log(`🐱 切换宠物至: ${currentTheme.name}`);
  stats.switchCount = (stats.switchCount || 0) + 1;
  saveStats();
}

// Random messages for each state
const MESSAGES = {
  eat: ['好吃！', '嗷呜嗷呜~', '还想再来一碗！', '🐟🐟🐟', '吃饱了~', '这个罐头不错！'],
  sleep: ['Zzz...', '做了个好梦...', '别吵...', '(˘ω˘)', '五分钟后叫我...'],
  play: ['看我抓蝴蝶！', '冲呀~', '毛线球真好玩！', '扑击！', '喵喵拳！', '精力充沛喵！'],
  play2: ['看我抓蝴蝶！', '冲呀~', '毛线球真好玩！', '扑击！', '喵喵拳！', '精力充沛喵！'],
  daze: ['发呆中...', '思考猫生...', '我是谁，我在哪？', 'O_o', '放空中~', '在看什么呢？'],
  daze2: ['发呆中...', '思考猫生...', '我是谁，我在哪？', 'O_o', '放空中~', '在看什么呢？'],
  gaze: ['👀 我在看你...', '别动，我在观察~', '凝视ing', '...嘿', '主人在干嘛？', '👁️_👁️'],
  pet: ['好舒服喵~', '嘿嘿~', '还要还要！', '❤️', '呼噜呼噜~', '喵呜~'],
};

// ============================================================
// State
// ============================================================

let currentState = 'eat';
let currentFrame = 0;
let lastFrameTime = 0;

// Sprite sheets (one per state)
const spriteSheets = {};
let spritesLoaded = 0;

let autoActionTimer = null;

// Canvas & context
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');

// UI elements
const contextMenu = document.getElementById('context-menu');
const statusBubble = document.getElementById('status-bubble');
const statusText = document.getElementById('status-text');

// ============================================================
// Sprite Loading
// ============================================================

function loadAllSprites() {
  // 收集所有需要加载的 (key, config) 对：默认状态用 state 名作 key，主题专属覆盖用 themeId:state 作 key
  const tasks = [];
  for (const [state, config] of Object.entries(STATES)) {
    tasks.push({ key: state, config });
  }
  for (const [themeId, overrides] of Object.entries(THEME_STATE_OVERRIDES)) {
    for (const [state, config] of Object.entries(overrides)) {
      tasks.push({ key: `${themeId}:${state}`, config });
    }
  }

  // 重置加载计数
  spritesLoaded = 0;
  const total = tasks.length;

  tasks.forEach(({ key, config }) => {
    const img = new Image();
    img.onload = () => {
      // Process image to remove pure white background via flood-fill
      const offCanvas = document.createElement('canvas');
      offCanvas.width = img.width;
      offCanvas.height = img.height;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(img, 0, 0);

      const imgData = offCtx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;
      const width = img.width;
      const height = img.height;

      function isBg(idx) {
        return data[idx] > 235 && data[idx + 1] > 235 && data[idx + 2] > 235 && data[idx + 3] > 0;
      }

      const stack = [];
      const visited = new Uint8Array(width * height);
      for (let x = 0; x < width; x++) { stack.push([x, 0]); stack.push([x, height - 1]); }
      for (let y = 0; y < height; y++) { stack.push([0, y]); stack.push([width - 1, y]); }

      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const i = y * width + x;
        if (visited[i]) continue;
        visited[i] = 1;
        const pIdx = i * 4;
        if (isBg(pIdx)) {
          data[pIdx + 3] = 0;
          if (x > 0) stack.push([x - 1, y]);
          if (x < width - 1) stack.push([x + 1, y]);
          if (y > 0) stack.push([x, y - 1]);
          if (y < height - 1) stack.push([x, y + 1]);
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      spriteSheets[key] = {
        img: offCanvas,
        config,
        frameWidth: config.single ? img.width : img.width / GRID_COLS,
        frameHeight: config.single ? img.height : img.height / GRID_ROWS,
      };
      spritesLoaded++;
      console.log(`✅ Loaded ${key}`);
      if (spritesLoaded === total) {
        requestAnimationFrame(gameLoop);
      }
    };
    img.onerror = (e) => {
      console.error(`Failed to load sprite for ${key}`, e);
      spritesLoaded++;
      if (spritesLoaded === total) {
        requestAnimationFrame(gameLoop);
      }
    };
    img.src = config.src;
  });
}

// 根据当前 theme 和 state 获取 sprite sheet（如果有 theme override 优先用，否则 fallback 到默认）
function getActiveSheet(state) {
  const themeId = PET_THEMES[currentPetThemeIndex]?.id;
  const overrideKey = `${themeId}:${state}`;
  if (spriteSheets[overrideKey]) return spriteSheets[overrideKey];
  return spriteSheets[state];
}

// ============================================================
// Rendering
// ============================================================

function getFrameCoords(frameIndex) {
  // Map frame index (0-3) to 2x2 grid position
  const col = frameIndex % GRID_COLS;
  const row = Math.floor(frameIndex / GRID_COLS);
  return { col, row };
}

function drawFrame(timestamp) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const sheet = getActiveSheet(currentState);
  if (!sheet) {
    drawFallbackPet(timestamp);
    return;
  }

  // OPTION 2: 极致丝滑的高端 Live2D 呼吸流方案
  // 固定提取单张画质最完美、无重绘抖动的本体插画（第 0 帧）
  // play 状态为单张整图，始终取第 0 帧
  const staticFrameIndex = 0;
  const { col, row } = getFrameCoords(staticFrameIndex);
  const sx = col * sheet.frameWidth;
  const sy = row * sheet.frameHeight;

  // Draw subtle stationary floor shadow (scaled to match pet size)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.beginPath();
  ctx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE - 14, 55 * petScale, 8 * petScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Calculate asymmetric crop margins to ensure pure illustration edges
  const config = sheet.config || STATES[currentState] || {};
  const marginTop = config.marginTop !== undefined ? config.marginTop : 30;
  const marginBottom = config.marginBottom !== undefined ? config.marginBottom : 2;
  const marginX = config.marginX !== undefined ? config.marginX : 12;

  const sw = sheet.frameWidth - marginX * 2;
  const sh = sheet.frameHeight - marginTop - marginBottom;
  const actualSx = sx + marginX;
  const actualSy = sy + marginTop;

  // Calculate draw dimensions preserving cropped aspect ratio
  const maxDrawSize = 170 * petScale;
  let dw = maxDrawSize;
  let dh = maxDrawSize;

  if (sw > sh) {
    dh = maxDrawSize * (sh / sw);
  } else {
    dw = maxDrawSize * (sw / sh);
  }

  const offsetX = (CANVAS_SIZE - dw) / 2;
  const shadowY = CANVAS_SIZE - 14;
  const offsetY = shadowY - dh + 6;

  ctx.save();

  // 应用宠物角色主题滤镜（零开销秒换不同品种）
  const currentTheme = PET_THEMES[currentPetThemeIndex];
  if (currentTheme && currentTheme.filter !== 'none') {
    ctx.filter = currentTheme.filter;
  }

  // Add a soft white glow so dark outlines and ZZZs stand out beautifully
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 8;

  // 设置变换基准原点为猫咪底部中心，实现绝对贴地平滑微动
  const pivotX = offsetX + dw / 2;
  const pivotY = offsetY + dh;
  ctx.translate(pivotX, pivotY);

  // 如果当前状态配置了自定义缩放比例，应用该缩放（以底部为锚点向上向外放大）
  const customScale = config.scale || 1.0;
  if (customScale !== 1.0) {
    ctx.scale(customScale, customScale);
  }

  // 代码级 60FPS 物理驱动算法
  if (currentState === 'sleep') {
    // 极其轻柔的 3.5 秒周期深呼吸起伏
    const breatheY = 1 + Math.sin(timestamp / 550) * 0.018;
    const breatheX = 1 - Math.sin(timestamp / 550) * 0.006;
    ctx.scale(breatheX, breatheY);
  } else if (currentState === 'eat') {
    // 欢快轻微的进食点头与咀嚼韵律
    const tilt = Math.sin(timestamp / 150) * 0.015; // 左右微晃
    const munchY = 1 + Math.abs(Math.sin(timestamp / 120)) * 0.012; // 垂直微弹
    ctx.rotate(tilt);
    ctx.scale(1, munchY);
  } else if (currentState === 'play' || currentState === 'play2') {
    // 活泼可爱的玩耍左右摆动与扑击弹跳节奏
    const playTilt = Math.sin(timestamp / 400) * 0.025; // 放慢摇摆周期，幅度稍减
    const pounceY = 1 + Math.abs(Math.sin(timestamp / 350)) * 0.015; // 放慢弹跳节奏
    ctx.rotate(playTilt);
    ctx.scale(1, pounceY);
  } else if (currentState === 'daze' || currentState === 'daze2') {
    // 发呆时极其缓慢轻微的呼吸起伏与微微发愣摆动
    const dazeTilt = Math.sin(timestamp / 800) * 0.008;
    const dazeBreatheY = 1 + Math.sin(timestamp / 600) * 0.01;
    ctx.rotate(dazeTilt);
    ctx.scale(1, dazeBreatheY);
  }

  // 绘制单张高清图片（相对于新的基准原点）
  ctx.drawImage(
    sheet.img,
    actualSx, actualSy, sw, sh,
    -dw / 2, -dh, dw, dh
  );

  ctx.restore();

  // 睡觉状态下，额外生成优雅的高清动态 Zzz 粒子气泡飘动效果
  if (currentState === 'sleep') {
    ctx.save();
    ctx.fillStyle = '#8CA0B3';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 4;
    const loopDuration = 3500;
    const phase = (timestamp % loopDuration) / loopDuration;

    for (let i = 0; i < 3; i++) {
      const pPhase = (phase + i * 0.33) % 1;
      const alpha = Math.sin(pPhase * Math.PI); // 淡入淡出
      ctx.globalAlpha = alpha * 0.7;

      // Zzz 粒子从猫咪头顶附近升起，不再覆盖在身体上
      const baseX = offsetX + dw * 0.65;
      const baseY = offsetY + dh * 0.15; // 头顶略偏下，避免飘太远
      const zx = baseX + Math.sin(pPhase * Math.PI * 2) * 8 + i * 4;
      const zy = baseY - pPhase * 32; // 向上飘 32px

      ctx.font = i === 2 ? 'bold 17px sans-serif' : 'bold 12px sans-serif';
      ctx.fillText(i === 2 ? 'Z' : 'z', zx, zy);
    }
    ctx.restore();
  }
}

function drawFallbackPet(timestamp) {
  const bounce = Math.sin(timestamp / 300) * 5;
  const breathe = Math.sin(timestamp / 600) * 3;

  ctx.save();

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.beginPath();
  ctx.ellipse(100, 170, 45, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#E8871E';
  ctx.beginPath();
  ctx.ellipse(100, 110 + bounce, 50 + breathe, 55 + breathe, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#FFF5E6';
  ctx.beginPath();
  ctx.ellipse(100, 120 + bounce, 32 + breathe, 40 + breathe, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stripes
  ctx.strokeStyle = '#C46A10';
  ctx.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(80 + i * 12, 75 + bounce);
    ctx.quadraticCurveTo(85 + i * 12, 85 + bounce, 80 + i * 12, 95 + bounce);
    ctx.stroke();
  }

  // Ears
  ctx.fillStyle = '#E8871E';
  ctx.beginPath();
  ctx.moveTo(62, 72 + bounce);
  ctx.lineTo(72, 38 + bounce);
  ctx.lineTo(88, 68 + bounce);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(112, 68 + bounce);
  ctx.lineTo(128, 38 + bounce);
  ctx.lineTo(138, 72 + bounce);
  ctx.fill();

  // Inner ears
  ctx.fillStyle = '#FFB8B8';
  ctx.beginPath();
  ctx.moveTo(68, 70 + bounce);
  ctx.lineTo(75, 48 + bounce);
  ctx.lineTo(84, 68 + bounce);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(116, 68 + bounce);
  ctx.lineTo(125, 48 + bounce);
  ctx.lineTo(132, 70 + bounce);
  ctx.fill();

  // Eyes
  const blinkPhase = Math.floor(timestamp / 3000) % 20;
  if (blinkPhase === 0) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(82, 93 + bounce, 5, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(118, 93 + bounce, 5, 0, Math.PI);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#2C1810';
    ctx.beginPath();
    ctx.ellipse(82, 93 + bounce, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(118, 93 + bounce, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(79, 89 + bounce, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(115, 89 + bounce, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose
  ctx.fillStyle = '#FF6B8A';
  ctx.beginPath();
  ctx.moveTo(100, 102 + bounce);
  ctx.lineTo(96, 107 + bounce);
  ctx.lineTo(104, 107 + bounce);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#5A3E28';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(96, 110 + bounce);
  ctx.quadraticCurveTo(100, 115 + bounce, 104, 110 + bounce);
  ctx.stroke();

  // Whiskers
  ctx.strokeStyle = '#D4A574';
  ctx.lineWidth = 1;
  // Left
  ctx.beginPath(); ctx.moveTo(75, 100 + bounce); ctx.lineTo(50, 96 + bounce); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(75, 104 + bounce); ctx.lineTo(48, 104 + bounce); ctx.stroke();
  // Right
  ctx.beginPath(); ctx.moveTo(125, 100 + bounce); ctx.lineTo(150, 96 + bounce); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(125, 104 + bounce); ctx.lineTo(152, 104 + bounce); ctx.stroke();

  ctx.restore();
}

// ============================================================
// Game Loop
// ============================================================

function gameLoop(timestamp) {
  drawFrame(timestamp);
  requestAnimationFrame(gameLoop);
}

// ============================================================
// State Management
// ============================================================

let userLockEndTime = 0;

function setState(newState) {
  // 如果处于用户指定锁定维持期内，拒绝外部/后台定时自动触发的状态改变
  if (userLockEndTime > Date.now()) return;

  // 状态统一走当前变体
  if (newState === 'play') newState = currentPlayVariant;
  if (newState === 'daze') newState = currentDazeVariant;
  if (currentState === newState) return;
  currentState = newState;
  currentFrame = 0;
  lastFrameTime = 0;
  showRandomMessage(newState);
}

function setUserState(baseAction) {
  let targetState = baseAction;

  if (baseAction === 'play') {
    if (currentState === 'play' || currentState === 'play2') {
      // 如果当前已经是玩耍状态，再次点击右键菜单直接切换到下一张图片（变体）
      currentPlayVariant = currentState === 'play' ? 'play2' : 'play';
    }
    targetState = currentPlayVariant;
  } else if (baseAction === 'daze') {
    if (currentState === 'daze' || currentState === 'daze2') {
      // 如果当前已经是发呆状态，再次点击右键菜单直接切换到另一张图片（变体）
      currentDazeVariant = currentState === 'daze' ? 'daze2' : 'daze';
    }
    targetState = currentDazeVariant;
  }

  // 手动切换状态，更新当前状态与画面帧
  currentState = targetState;
  currentFrame = 0;
  lastFrameTime = 0;
  showRandomMessage(targetState);

  // 切换后的状态维持 10 分钟（屏蔽自动切换、整点覆盖与变体轮换）
  userLockEndTime = Date.now() + 10 * 60 * 1000;
  console.log(`🔒 用户手动选择状态 ${targetState}，锁定维持 10 分钟`);
}

function showRandomMessage(state) {
  // 用户自定义文案优先（同 state 至少一条非空才生效）
  const custom = userSettings.customMessages && userSettings.customMessages[state];
  let msgs;
  if (custom && Array.isArray(custom) && custom.filter(m => m && m.trim()).length > 0) {
    msgs = custom.filter(m => m && m.trim());
  } else {
    msgs = MESSAGES[state] || MESSAGES.eat;
  }
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  showBubble(msg);
}



// ============================================================
// Time-based State
// ============================================================

function getStateByTime() {
  const hour = new Date().getHours();

  // 用户自定义作息表优先：[{startHour, endHour, state}]
  const schedule = userSettings.customSchedule;
  if (Array.isArray(schedule) && schedule.length > 0) {
    for (const slot of schedule) {
      const start = slot.startHour;
      const end = slot.endHour;
      if (typeof start !== 'number' || typeof end !== 'number') continue;
      // 跨午夜段（如 22-7）支持
      const inSlot = start <= end
        ? (hour >= start && hour < end)
        : (hour >= start || hour < end);
      if (inSlot && slot.state) return slot.state;
    }
  }

  if (hour >= 0 && hour < 7) return 'sleep';           // 深夜/凌晨 睡觉
  if (hour >= 7 && hour < 9) return 'eat';             // 早饭时间
  if (hour >= 9 && hour < 12) return 'play';           // 上午 玩耍
  if (hour >= 12 && hour < 13) return 'eat';           // 午饭时间
  if (hour >= 13 && hour < 18) return 'play';          // 下午 玩耍
  if (hour >= 18 && hour < 19) return 'eat';           // 晚饭时间
  if (hour >= 19 && hour < 22) return 'play';          // 晚上 玩耍
  return 'sleep';                                       // 22点后 准备睡觉
}

function startTimeBasedBehavior() {
  // 立即按当前时间设置状态
  setState(getStateByTime());

  // 每分钟检查一次时间，到整点时切换
  setInterval(() => {
    if (userLockEndTime > Date.now()) return; // 处于 10 分钟维持期内，跳过时间检查覆盖

    const now = new Date();
    if (now.getMinutes() === 0) {
      const timeState = getStateByTime();
      // play/play2 都属于 play 类，不要覆盖轮换状态
      const currentIsPlay = currentState === 'play' || currentState === 'play2';
      const targetIsPlay = timeState === 'play';
      if (!(currentIsPlay && targetIsPlay) && timeState !== currentState) {
        setState(timeState);
      }
    }
  }, 60 * 1000);
}



// ============================================================
// Play variant rotation
// ============================================================

// 当前变体
let currentPlayVariant = 'play';
let currentDazeVariant = 'daze';

function startPlayRotation() {
  setInterval(() => {
    if (userLockEndTime > Date.now()) return; // 处于 10 分钟维持期内，锁定特定变体画面不自动轮换

    // 切换变体
    currentPlayVariant = currentPlayVariant === 'play' ? 'play2' : 'play';
    currentDazeVariant = currentDazeVariant === 'daze' ? 'daze2' : 'daze';
    // 如果当前正在相应状态，立即切换到新变体
    if (currentState === 'play' || currentState === 'play2') {
      currentState = currentPlayVariant;
    } else if (currentState === 'daze' || currentState === 'daze2') {
      currentState = currentDazeVariant;
    }
  }, 30 * 1000); // 30 秒轮换一次
}

// ============================================================
// Auto Behavior
// ============================================================

function startAutoActions() {
  scheduleNextAction();
}

function scheduleNextAction() {
  // 用户禁用自动行为时彻底跳过调度
  if (!userSettings.autoActions) {
    autoActionTimer = setTimeout(scheduleNextAction, 30000); // 每 30 秒重新检查一次开关状态
    return;
  }

  const range = FREQUENCY_RANGES[userSettings.actionFrequency] || FREQUENCY_RANGES.normal;
  const delay = range[0] + Math.random() * (range[1] - range[0]);

  autoActionTimer = setTimeout(() => {
    if (!userSettings.autoActions) {
      scheduleNextAction();
      return;
    }
    if (userLockEndTime > Date.now()) {
      // 处于 10 分钟维持期内，跳过随机动作改变，继续等待下一次调度
      scheduleNextAction();
      return;
    }

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 7 || hour >= 22) {
      setState('sleep');
    } else {
      // 变体视为同一类，随机时不重复切换同类
      const currentBase = (currentState === 'play' || currentState === 'play2') ? 'play' : (currentState === 'daze' || currentState === 'daze2') ? 'daze' : currentState;
      // 仅从当前品种的菜单状态里选随机动作（确保该品种有专属画面或合理 fallback）
      const theme = PET_THEMES[currentPetThemeIndex];
      const themeStates = (theme && theme.menu)
        ? theme.menu.filter(s => ['eat', 'sleep', 'play', 'daze', 'gaze'].includes(s))
        : ['eat', 'sleep', 'play', 'daze'];
      const availableActions = themeStates.filter(a => a !== currentBase);
      if (availableActions.length === 0) {
        scheduleNextAction();
        return;
      }
      const randomAction = availableActions[Math.floor(Math.random() * availableActions.length)];
      setState(randomAction);
    }
    scheduleNextAction();
  }, delay);
}

// ============================================================
// UI: Context Menu
// ============================================================

async function openSettingsWindow() {
  try {
    const windows = await getAllWindows();
    const existing = windows.find(w => w.label === 'settings');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }

    const settingsWin = new WebviewWindow('settings', {
      url: 'settings.html',
      title: 'River Pet 高级设置',
      width: 440,
      height: 760,
      resizable: true,
      decorations: true,
      center: true,
      alwaysOnTop: true
    });

    settingsWin.once('tauri://created', () => {
      console.log('✅ 设置窗口创建成功');
    });
    settingsWin.once('tauri://error', (e) => {
      console.error('❌ 设置窗口创建失败:', e);
    });
  } catch (err) {
    console.error('Failed to open settings window:', err);
  }
}

function renderContextMenu() {
  const body = document.getElementById('menu-body');
  if (!body) return;
  const theme = PET_THEMES[currentPetThemeIndex];
  const items = (theme && theme.menu) || ['eat', 'sleep', 'play', 'daze', 'pet', 'settings'];

  // 双列网格容纳所有项；单数则最后一项独占整行
  const isOdd = items.length % 2 === 1;
  let html = '<div class="menu-grid">';
  items.forEach((id, idx) => {
    const item = MENU_ITEMS[id];
    if (!item) return;
    // 最后一项且总数为奇数：跨双列
    const lastSpan = isOdd && idx === items.length - 1
      ? ' style="grid-column: 1 / span 2;"'
      : '';
    html += `<div class="menu-item" data-action="${id}"${lastSpan}>${item.icon} ${item.label}</div>`;
  });
  html += '</div>';
  body.innerHTML = html;
}

function showContextMenu(x, y) {
  // 每次打开前根据当前品种重新生成菜单内容
  renderContextMenu();
  contextMenu.classList.remove('hidden');

  const menuW = 186;
  // 高度根据菜单项数量动态估算
  const theme = PET_THEMES[currentPetThemeIndex];
  const itemCount = (theme && theme.menu) ? theme.menu.length : 6;
  const rows = Math.ceil(itemCount / 2) + 1; // +1 是退出按钮独占一行
  const menuH = 24 + rows * 28 + 20; // 大致估算，避免被屏幕底部截断
  let mx = x;
  let my = y;
  if (mx + menuW > CANVAS_SIZE) mx = CANVAS_SIZE - menuW;
  if (my + menuH > CANVAS_SIZE) my = CANVAS_SIZE - menuH - 6;
  if (mx < 0) mx = 4;
  if (my < 0) my = 4;

  contextMenu.style.left = mx + 'px';
  contextMenu.style.top = my + 'px';
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
}

// 事件代理：把点击委托到 contextMenu，无论菜单内容怎么变都能响应
contextMenu.addEventListener('click', (e) => {
  const target = e.target.closest('.menu-item');
  if (!target) return;
  const action = target.dataset.action;
  hideContextMenu();

  switch (action) {
    case 'eat':
    case 'sleep':
    case 'play':
    case 'daze':
    case 'gaze':
      setUserState(action);
      break;
    case 'switchPet':
      switchNextPet();
      break;
    case 'settings':
      openSettingsWindow();
      break;
    case 'pet':
      doPetting();
      break;
    case 'quit':
      getCurrentWindow().close();
      break;
  }
});

// ============================================================
// UI: Status Bubble
// ============================================================

let bubbleTimeout = null;

function showBubble(message, duration = 3000) {
  if (bubbleTimeout) clearTimeout(bubbleTimeout);

  statusText.textContent = message;
  statusBubble.classList.remove('hidden');

  // 动态贴在猫咪头顶上方 12px。猫咪绘制高度约 170 * petScale，底部对齐 CANVAS_SIZE - 14
  const petHeight = 170 * petScale;
  const petTop = (CANVAS_SIZE - 14) - petHeight + 6;
  const bubbleBottom = CANVAS_SIZE - petTop + 12;
  statusBubble.style.bottom = bubbleBottom + 'px';

  statusBubble.style.animation = 'none';
  statusBubble.offsetHeight;
  statusBubble.style.animation = '';

  bubbleTimeout = setTimeout(() => {
    statusBubble.classList.add('hidden');
  }, duration);
}

// ============================================================
// Petting (heart particles)
// ============================================================

function doPetting() {
  showRandomMessage('pet');

  for (let i = 0; i < 6; i++) {
    setTimeout(() => spawnHeart(), i * 120);
  }

  stats.petCount = (stats.petCount || 0) + 1;
  saveStats();
}

function spawnHeart() {
  const hearts = ['❤️', '🧡', '💛', '💖', '✨'];
  const heart = document.createElement('div');
  heart.className = 'heart-particle';
  heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];

  // 心形粒子从猫咪上半身位置浮起，跟随尺寸缩放
  const petHeight = 170 * petScale;
  const petWidth = 170 * petScale;
  const petLeft = (CANVAS_SIZE - petWidth) / 2;
  const petTop = (CANVAS_SIZE - 14) - petHeight + 6;

  heart.style.left = (petLeft + petWidth * 0.25 + Math.random() * petWidth * 0.5) + 'px';
  heart.style.top = (petTop + petHeight * 0.2 + Math.random() * petHeight * 0.3) + 'px';
  document.body.appendChild(heart);

  setTimeout(() => heart.remove(), 1200);
}

// ============================================================
// Mouse Interaction & Drag
// ============================================================

let isDragging = false;

canvas.addEventListener('mousedown', async (e) => {
  if (e.button === 0) {
    hideContextMenu();
    isDragging = true;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error('Drag error:', err);
    }
    isDragging = false;
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY);
});

canvas.addEventListener('dblclick', () => {
  doPetting();
});

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target) && !contextMenu.classList.contains('hidden')) {
    hideContextMenu();
  }
});

// 当窗口失去焦点（切换到其他页面或应用）时自动隐藏右键菜单
window.addEventListener('blur', () => {
  hideContextMenu();
});

// ============================================================
// 生日守望
// ============================================================

function startBirthdayWatcher() {
  let lastTriggeredDate = '';

  const check = () => {
    if (!userSettings.birthday) return;
    const today = new Date();
    const md = `${today.getMonth() + 1}-${today.getDate()}`;
    const todayKey = `${today.getFullYear()}-${md}`;

    // 取生日的"月-日"部分
    let birthdayMd = '';
    try {
      const bd = new Date(userSettings.birthday);
      if (!isNaN(bd.getTime())) {
        birthdayMd = `${bd.getMonth() + 1}-${bd.getDate()}`;
      }
    } catch (e) {}

    if (birthdayMd && birthdayMd === md && lastTriggeredDate !== todayKey) {
      lastTriggeredDate = todayKey;
      // 庆祝
      showBubble('🎂 生日快乐！喵呜~ 今天有蛋糕吗？', 6000);
      for (let i = 0; i < 12; i++) {
        setTimeout(() => spawnHeart(), i * 150);
      }
    }
  };

  check();
  // 每 5 分钟检查一次（应付跨日 + 临时改生日的情况）
  setInterval(check, 5 * 60 * 1000);
}

// ============================================================
// Pixel-Perfect Click-Through (仅猫咪本体响应鼠标)
// ============================================================
// 通过轮询鼠标位置 + 采样 canvas 像素 alpha 通道，决定窗口是否忽略鼠标事件。
// 当鼠标悬停在透明像素（猫咪外的空白区域）时，鼠标事件穿透到下层应用；
// 当鼠标进入猫咪本体（含气泡和右键菜单等可交互 DOM）时，恢复正常事件接收。

let cursorIgnoreState = false; // 当前窗口是否处于 ignore 模式

async function startCursorHitTesting() {
  let pollHandle = null;

  const poll = async () => {
    try {
      // 拖拽中或右键菜单展开时一律保持可交互，避免中断
      const menuOpen = !contextMenu.classList.contains('hidden');
      if (isDragging || menuOpen) {
        if (cursorIgnoreState) {
          await invoke('set_ignore_cursor', { ignore: false });
          cursorIgnoreState = false;
        }
        return;
      }

      const [cx, cy] = await invoke('get_cursor_pos');

      // 鼠标在窗口外时不需要处理
      if (cx < 0 || cy < 0 || cx >= CANVAS_SIZE || cy >= CANVAS_SIZE) {
        return;
      }

      // 检查鼠标位置是否落在 DOM UI 元素（气泡、菜单、心形）上 —— 这些必须可交互
      const hoveredEl = document.elementFromPoint(cx, cy);
      const onUI = hoveredEl && (
        hoveredEl.closest('.context-menu') ||
        hoveredEl.closest('.status-bubble') ||
        hoveredEl.closest('.heart-particle')
      );

      let shouldIgnore = false;

      if (onUI) {
        shouldIgnore = false;
      } else {
        // 采样 canvas 该位置的 alpha 通道
        try {
          const pixel = ctx.getImageData(Math.floor(cx), Math.floor(cy), 1, 1).data;
          // alpha < 阈值视为透明，鼠标穿透
          shouldIgnore = pixel[3] < 10;
        } catch (e) {
          shouldIgnore = false;
        }
      }

      if (shouldIgnore !== cursorIgnoreState) {
        await invoke('set_ignore_cursor', { ignore: shouldIgnore });
        cursorIgnoreState = shouldIgnore;
      }
    } catch (e) {
      // 命令调用偶发失败可忽略
    }
  };

  // 60ms 轮询：足够流畅响应鼠标移动，性能开销极低
  pollHandle = setInterval(poll, 60);
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('🐱 River Pet initializing...');

  // 应用用户偏好（透明度等）
  applyOpacity();

  loadAllSprites();
  startTimeBasedBehavior();
  startPlayRotation();
  startAutoActions();
  startBirthdayWatcher();

  // 显式初始化透明窗口接收鼠标事件状态，确保 macOS 和 Windows 均可正常响应点击和拖拽。
  // 彻底移除高频 mousemove 动态修改 ignore 状态的逻辑，避免在按住拖拽时底层窗口属性被不断重置中断。
  try {
    await invoke('set_ignore_cursor', { ignore: false });
    // 同时监听原生窗口级别的焦点状态变化，确保跨平台绝对可靠
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) hideContextMenu();
    });
  } catch (e) {
    console.error('Init cursor error:', e);
  }

  // 启动像素级命中检测：仅猫咪不透明像素响应鼠标，背景透明区域穿透
  startCursorHitTesting();

  // 监听来自托盘菜单的事件（Windows 任务栏 / macOS 菜单栏）
  try {
    await listen('tray://switch-pet', () => {
      switchNextPet();
    });
    await listen('tray://open-settings', () => {
      openSettingsWindow();
    });
  } catch (e) {
    console.error('Tray listener error:', e);
  }

  setTimeout(() => {
    showBubble('你好呀~ 我是你的桌宠喵！🐱', 4000);
  }, 500);
});
