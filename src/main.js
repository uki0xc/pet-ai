// ============================================================
// Desktop Pet - Main Application
// ============================================================

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

// ============================================================
// Configuration
// ============================================================

const CANVAS_SIZE = 200;
const FRAME_DURATION = 400; // ms per animation frame (slower, cozier feel)

// Each sprite sheet is a 2x2 grid = 4 frames
const GRID_COLS = 2;
const GRID_ROWS = 2;

// Pet states -> sprite sheets
const STATES = {
  eat:   { src: '/assets/cat_eat.png',   frames: 4, label: '吃饭中~' },
  sleep: { src: '/assets/cat_sleep.png', frames: 4, label: 'Zzz...' },
  play:  { src: '/assets/cat_play.png',  frames: 4, label: '玩耍中~' },
};

// Random messages for each state
const MESSAGES = {
  eat: ['好吃！', '嗷呜嗷呜~', '还想再来一碗！', '🐟🐟🐟', '吃饱了~', '这个罐头不错！'],
  sleep: ['Zzz...', '做了个好梦...', '别吵...', '(˘ω˘)', '五分钟后叫我...'],
  play: ['好开心！', '✨✨✨', '来抓我呀~', '耶！', '再来再来！'],
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
const totalSprites = Object.keys(STATES).length;

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
  for (const [state, config] of Object.entries(STATES)) {
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

      // Check if pixel is near-white background
      function isBg(idx) {
        return data[idx] > 235 && data[idx+1] > 235 && data[idx+2] > 235 && data[idx+3] > 0;
      }

      // Flood fill from all edges
      const stack = [];
      const visited = new Uint8Array(width * height);
      for(let x=0; x<width; x++) { stack.push([x, 0]); stack.push([x, height-1]); }
      for(let y=0; y<height; y++) { stack.push([0, y]); stack.push([width-1, y]); }

      while(stack.length > 0) {
        const [x, y] = stack.pop();
        const i = y * width + x;
        if(visited[i]) continue;
        visited[i] = 1;

        const pIdx = i * 4;
        if(isBg(pIdx)) {
          data[pIdx + 3] = 0; // Set transparent
          
          if(x > 0) stack.push([x - 1, y]);
          if(x < width - 1) stack.push([x + 1, y]);
          if(y > 0) stack.push([x, y - 1]);
          if(y < height - 1) stack.push([x, y + 1]);
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      spriteSheets[state] = {
        img: offCanvas,
        frameWidth: img.width / GRID_COLS,
        frameHeight: img.height / GRID_ROWS,
      };
      spritesLoaded++;
      console.log(`✅ Loaded ${state}`);
      if (spritesLoaded === totalSprites) {
        requestAnimationFrame(gameLoop);
      }
    };
    img.onerror = (e) => {
      console.error(`Failed to load sprite for ${state}`, e);
      spritesLoaded++;
      if (spritesLoaded === totalSprites) {
        requestAnimationFrame(gameLoop);
      }
    };
    img.src = config.src;
  }
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

  const sheet = spriteSheets[currentState];
  if (!sheet) {
    drawFallbackPet(timestamp);
    return;
  }

  // Update animation frame
  if (timestamp - lastFrameTime > FRAME_DURATION) {
    const stateConfig = STATES[currentState];
    currentFrame = (currentFrame + 1) % stateConfig.frames;
    lastFrameTime = timestamp;
  }

  const { col, row } = getFrameCoords(currentFrame);
  const sx = col * sheet.frameWidth;
  const sy = row * sheet.frameHeight;

  // Draw subtle shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.beginPath();
  ctx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE - 14, 55, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Calculate draw dimensions
  const drawSize = 170;
  const offsetX = (CANVAS_SIZE - drawSize) / 2;
  const offsetY = (CANVAS_SIZE - drawSize) / 2 - 8;

  ctx.save();
  
  // Add a soft white glow so dark outlines and ZZZs stand out on any background
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 8;
  
  ctx.drawImage(
    sheet.img,
    sx, sy, sheet.frameWidth, sheet.frameHeight,
    offsetX, offsetY, drawSize, drawSize
  );
  
  ctx.restore();
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

function setState(newState) {
  if (currentState === newState) return;
  currentState = newState;
  currentFrame = 0;
  lastFrameTime = 0;
  showRandomMessage(newState);
}

function showRandomMessage(state) {
  const msgs = MESSAGES[state] || MESSAGES.eat;
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  showBubble(msg);
}



// ============================================================
// Auto Behavior
// ============================================================

function startAutoActions() {
  scheduleNextAction();
}

function scheduleNextAction() {
  const delay = 15000 + Math.random() * 30000;
  autoActionTimer = setTimeout(() => {
    const actions = ['eat', 'sleep', 'play'];
    // Filter out current state so it actually changes
    const availableActions = actions.filter(a => a !== currentState);
    const randomAction = availableActions[Math.floor(Math.random() * availableActions.length)];
    setState(randomAction);

    scheduleNextAction();
  }, delay);
}

// ============================================================
// UI: Context Menu
// ============================================================

function showContextMenu(x, y) {
  contextMenu.classList.remove('hidden');

  const menuW = 160;
  const menuH = 260;
  let mx = x;
  let my = y;
  if (mx + menuW > CANVAS_SIZE) mx = CANVAS_SIZE - menuW;
  if (my + menuH > CANVAS_SIZE) my = CANVAS_SIZE - menuH - 10;
  if (mx < 0) mx = 4;
  if (my < 0) my = 4;

  contextMenu.style.left = mx + 'px';
  contextMenu.style.top = my + 'px';
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
}

document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    const action = e.currentTarget.dataset.action;
    hideContextMenu();

    switch (action) {
      case 'eat':
        setState('eat');
        break;
      case 'sleep':
        setState('sleep');
        break;
      case 'play':
        setState('play');
        break;
      case 'pet':
        doPetting();
        break;
      case 'quit':
        getCurrentWindow().close();
        break;
    }
  });
});

// ============================================================
// UI: Status Bubble
// ============================================================

let bubbleTimeout = null;

function showBubble(message, duration = 3000) {
  if (bubbleTimeout) clearTimeout(bubbleTimeout);

  statusText.textContent = message;
  statusBubble.classList.remove('hidden');

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
}

function spawnHeart() {
  const hearts = ['❤️', '🧡', '💛', '💖', '✨'];
  const heart = document.createElement('div');
  heart.className = 'heart-particle';
  heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
  heart.style.left = (60 + Math.random() * 80) + 'px';
  heart.style.top = (50 + Math.random() * 40) + 'px';
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

// ============================================================
// Cursor pass-through for transparent areas
// ============================================================

document.addEventListener('mousemove', async (e) => {
  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2 - 10;
  const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);

  const isOverPet = dist < 85;

  if (!contextMenu.classList.contains('hidden')) return;

  try {
    await invoke('set_ignore_cursor', { ignore: !isOverPet });
  } catch (err) {
    // Ignore errors during rapid movement
  }
});

// ============================================================
// Initialization
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
  console.log('🐱 Desktop Pet initializing... (Codex style fat orange cat!)');
  loadAllSprites();
  startAutoActions();

  setTimeout(() => {
    showBubble('你好呀~ 我是你的桌宠喵！🐱', 4000);
  }, 500);
});
