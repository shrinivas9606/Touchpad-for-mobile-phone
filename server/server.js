const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const robot = require('robotjs');
const os = require('os');
const path = require('path');
const qrcode = require('qrcode-terminal');

// ── Configuration ──────────────────────────────────────────
const PORT = process.env.PORT || 8765;
const SCROLL_SPEED = 3;         // pixels per scroll tick
const SCROLL_THRESHOLD = 5;     // minimum delta to trigger scroll

// ── Express Setup ──────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Serve the mobile client
app.use(express.static(path.join(__dirname, '..', 'client')));

// ── WebSocket Setup ────────────────────────────────────────
const wss = new WebSocketServer({ server });

let clientCount = 0;

// Disable robotjs mouse acceleration for more precise control
robot.setMouseDelay(0);

wss.on('connection', (ws, req) => {
  clientCount++;
  const clientIP = req.socket.remoteAddress;
  console.log(`\n✅ Device connected: ${clientIP} (${clientCount} active)`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(msg);
    } catch (err) {
      console.error('Invalid message:', err.message);
    }
  });

  ws.on('close', () => {
    clientCount--;
    console.log(`❌ Device disconnected: ${clientIP} (${clientCount} active)`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  // Send acknowledgement
  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to touchpad server' }));
});

// Heartbeat to detect dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

wss.on('close', () => clearInterval(heartbeat));

// ── Message Handler ────────────────────────────────────────
function handleMessage(msg) {
  const { type } = msg;

  switch (type) {
    case 'move': {
      const pos = robot.getMousePos();
      const sensitivity = msg.sensitivity || 1;
      const newX = Math.round(pos.x + msg.deltaX * sensitivity);
      const newY = Math.round(pos.y + msg.deltaY * sensitivity);
      
      // Clamp to screen bounds
      const screenSize = robot.getScreenSize();
      const clampedX = Math.max(0, Math.min(newX, screenSize.width - 1));
      const clampedY = Math.max(0, Math.min(newY, screenSize.height - 1));
      
      robot.moveMouse(clampedX, clampedY);
      break;
    }

    case 'click': {
      robot.mouseClick('left');
      break;
    }

    case 'doubleclick': {
      robot.mouseClick('left', true);
      break;
    }

    case 'rightclick': {
      robot.mouseClick('right');
      break;
    }

    case 'scroll': {
      const dx = msg.deltaX || 0;
      const dy = msg.deltaY || 0;

      // robotjs scrollMouse(x, y) — positive y = scroll down
      if (Math.abs(dy) > SCROLL_THRESHOLD) {
        const scrollAmount = dy > 0 ? -SCROLL_SPEED : SCROLL_SPEED;
        robot.scrollMouse(0, scrollAmount);
      }
      if (Math.abs(dx) > SCROLL_THRESHOLD) {
        const scrollAmount = dx > 0 ? SCROLL_SPEED : -SCROLL_SPEED;
        robot.scrollMouse(scrollAmount, 0);
      }
      break;
    }

    case 'drag_start': {
      robot.mouseToggle('down', 'left');
      break;
    }

    case 'drag_move': {
      const pos = robot.getMousePos();
      const sensitivity = msg.sensitivity || 1;
      const newX = Math.round(pos.x + msg.deltaX * sensitivity);
      const newY = Math.round(pos.y + msg.deltaY * sensitivity);
      robot.moveMouse(newX, newY);
      break;
    }

    case 'drag_end': {
      robot.mouseToggle('up', 'left');
      break;
    }

    case 'key': {
      // For keyboard shortcuts (Phase 2+)
      const modifiers = msg.modifiers || [];
      robot.keyTap(msg.key, modifiers);
      break;
    }

    case 'three_finger_swipe': {
      // Alt+Tab
      robot.keyTap('tab', 'alt');
      break;
    }

    case 'four_finger_swipe': {
      // Win+Ctrl+Left/Right for virtual desktop switching
      const direction = msg.direction; // 'left' or 'right'
      if (direction === 'left') {
        robot.keyTap('left', ['control', 'command']); // 'command' = Win key in robotjs
      } else {
        robot.keyTap('right', ['control', 'command']);
      }
      break;
    }

    case 'zoom': {
      // Ctrl+scroll for zoom
      robot.keyToggle('control', 'down');
      const zoomDir = msg.delta > 0 ? SCROLL_SPEED : -SCROLL_SPEED;
      robot.scrollMouse(0, zoomDir);
      robot.keyToggle('control', 'up');
      break;
    }

    default:
      console.warn('Unknown message type:', type);
  }
}

// ── Get Local IP ───────────────────────────────────────────
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ── Start Server ───────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         🖱️  TOUCHPAD SERVER RUNNING          ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  URL: ${url.padEnd(37)}║`);
  console.log(`║  Port: ${String(PORT).padEnd(36)}║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Scan QR code with your phone:              ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  qrcode.generate(url, { small: true }, (code) => {
    console.log(code);
    console.log(`\n📱 Open ${url} on your phone`);
    console.log('   (Both devices must be on the same WiFi)\n');
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  wss.close();
  server.close();
  process.exit(0);
});
