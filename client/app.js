/* ═══════════════════════════════════════════════
   TOUCHPAD APP — Client Controller
   ═══════════════════════════════════════════════ */

class TouchpadApp {
  constructor() {
    // ── State ────────────────────────────────
    this.ws = null;
    this.connected = false;
    this.touches = {};
    this.isLandscape = false;

    // ── Settings ─────────────────────────────
    this.sensitivity = parseFloat(localStorage.getItem('sensitivity') || '1.5');
    this.scrollSpeed = parseFloat(localStorage.getItem('scrollSpeed') || '2.5');
    this.hapticEnabled = localStorage.getItem('hapticEnabled') !== 'false';

    // ── Gesture Detection ────────────────────
    this.TAP_MAX_DURATION = 220;      // ms — max time for a tap
    this.TAP_MAX_DISTANCE = 12;       // px — max movement for a tap
    this.DOUBLE_TAP_INTERVAL = 300;   // ms — max between double taps
    this.LONG_PRESS_DURATION = 500;   // ms — hold for right-click
    this.SCROLL_THRESHOLD = 3;        // px — minimum to trigger scroll
    this.SWIPE_THRESHOLD = 50;        // px — minimum for gesture swipe

    this.lastTapTime = 0;
    this.longPressTimer = null;
    this.isDragging = false;
    this.isSelecting = false;
    this.gestureTimeout = null;
    this.maxTouchCount = 0;          // max fingers seen in current gesture
    this._pendingTap = null;

    // ── DOM Elements ─────────────────────────
    this.touchpad = document.getElementById('touchpad');
    this.connectionDot = document.getElementById('connection-dot');
    this.connectionText = document.getElementById('connection-text');
    this.modeLabel = document.getElementById('mode-label');
    this.gestureIndicator = document.getElementById('gesture-indicator');
    this.gestureText = document.getElementById('gesture-text');
    this.rippleContainer = document.getElementById('ripple-container');

    this.touchpadMode = document.getElementById('touchpad-mode');
    this.keyboardMode = document.getElementById('keyboard-mode');

    this.settingsPanel = document.getElementById('settings-panel');
    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsClose = document.getElementById('settings-close');
    this.settingsOverlay = document.getElementById('settings-overlay');

    this.sensitivitySlider = document.getElementById('sensitivity-slider');
    this.sensitivityValue = document.getElementById('sensitivity-value');
    this.scrollSpeedSlider = document.getElementById('scroll-speed-slider');
    this.scrollSpeedValue = document.getElementById('scroll-speed-value');
    this.hapticToggle = document.getElementById('haptic-toggle');
    this.connectionInfo = document.getElementById('connection-info');

    this.btnLeft = document.getElementById('btn-left');
    this.btnRight = document.getElementById('btn-right');

    // ── Initialize ───────────────────────────
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.setupTouchEvents();
    this.setupButtons();
    this.setupSettings();
    this.setupOrientation();
    this.loadSettings();
  }

  // ═══════════════════════════════════════════
  // WebSocket Connection
  // ═══════════════════════════════════════════

  connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // WebSocket runs on port 8765, HTTP serves on 8766
    const wsHost = location.hostname + ':8765';
    const url = `${protocol}//${wsHost}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.updateConnectionUI(true);
      console.log('[WS] Connected');
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.updateConnectionUI(false);
      console.log('[WS] Disconnected — reconnecting in 2s...');
      setTimeout(() => this.connectWebSocket(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected') {
          this.connectionInfo.textContent = location.host;
        }
      } catch (e) { /* ignore non-JSON */ }
    };
  }

  updateConnectionUI(connected) {
    this.connectionDot.className = `dot ${connected ? 'connected' : 'disconnected'}`;
    this.connectionText.textContent = connected ? 'Connected' : 'Reconnecting...';
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ═══════════════════════════════════════════
  // Touch Event Handling
  // ═══════════════════════════════════════════

  setupTouchEvents() {
    this.touchpad.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.touchpad.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.touchpad.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    this.touchpad.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  onTouchStart(e) {
    // Track gesture start time on first finger
    if (Object.keys(this.touches).length === 0) {
      this._gestureStartTime = Date.now();
      this._gestureHadMovement = false;
    }
    e.preventDefault();
    this.touchpad.classList.add('touching');

    for (const touch of e.changedTouches) {
      this.touches[touch.identifier] = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startTime: Date.now(),
        moved: false
      };
    }

    const touchCount = Object.keys(this.touches).length;

    // Track peak finger count for this gesture
    if (touchCount > this.maxTouchCount) {
      this.maxTouchCount = touchCount;
    }

    // Start long press detection (single finger only)
    if (touchCount === 1) {
      this.clearLongPress();
      this.longPressTimer = setTimeout(() => {
        const touch = Object.values(this.touches)[0];
        if (touch && !touch.moved) {
          this.send({ type: 'rightclick' });
          this.haptic(50);
          this.showGesture('Right Click');
          this.longPressTimer = null;
        }
      }, this.LONG_PRESS_DURATION);
    } else {
      this.clearLongPress();
    }

    // Double-tap + hold → enter select/drag mode
    if (touchCount === 1) {
      const now = Date.now();
      if (now - this.lastTapTime < this.DOUBLE_TAP_INTERVAL && this._pendingTap) {
        // Second tap started quickly → cancel the pending single click
        clearTimeout(this._pendingTap);
        this._pendingTap = null;
        // Start select mode (mouse down for text selection)
        this.isSelecting = true;
        this.send({ type: 'drag_start' });
        this.haptic(20);
        this.showGesture('Select');
      }
    }

    // Show gesture indicator for multi-touch
    if (touchCount === 2) {
      this.showGesture('Scroll');
    } else if (touchCount === 3) {
      this.showGesture('3-Finger Tap');
    } else if (touchCount === 4) {
      this.showGesture('Switch Desktop');
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    const touchCount = e.touches.length;

    if (touchCount === 1) {
      // ── Single Finger → Cursor Movement ──
      const touch = e.touches[0];
      const data = this.touches[touch.identifier];
      if (!data) return;

      const deltaX = (touch.clientX - data.lastX) * this.sensitivity;
      const deltaY = (touch.clientY - data.lastY) * this.sensitivity;

      data.lastX = touch.clientX;
      data.lastY = touch.clientY;

      // Check if we've moved enough to count as movement
      const totalDx = touch.clientX - data.startX;
      const totalDy = touch.clientY - data.startY;
      if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > this.TAP_MAX_DISTANCE) {
        data.moved = true;
        this._gestureHadMovement = true;
        this._gestureStartX = this._gestureStartX || data.startX;
        this.clearLongPress();
      }

      if (data.moved) {
        if (this.isDragging || this.isSelecting) {
          this.send({ type: 'drag_move', deltaX, deltaY, sensitivity: 1 });
        } else {
          this.send({ type: 'move', deltaX, deltaY, sensitivity: 1 });
        }
      }

    } else if (touchCount === 2) {
      // ── Two Fingers → Scroll ──
      this.handleTwoFingerMove(e);

    } else if (touchCount >= 3) {
      // ── Three/Four Fingers → Track for swipe gestures ──
      this.handleMultiFingerMove(e, touchCount);
    }
  }

  handleTwoFingerMove(e) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const d1 = this.touches[t1.identifier];
    const d2 = this.touches[t2.identifier];
    if (!d1 || !d2) return;

    const avgDeltaX = ((t1.clientX - d1.lastX) + (t2.clientX - d2.lastX)) / 2;
    const avgDeltaY = ((t1.clientY - d1.lastY) + (t2.clientY - d2.lastY)) / 2;

    d1.lastX = t1.clientX; d1.lastY = t1.clientY;
    d2.lastX = t2.clientX; d2.lastY = t2.clientY;
    d1.moved = true; d2.moved = true;
    this._gestureHadMovement = true;

    // Pinch detection
    const currentDist = this.getDistance(t1, t2);
    if (this._lastPinchDist !== undefined) {
      const pinchDelta = currentDist - this._lastPinchDist;
      if (Math.abs(pinchDelta) > 5) {
        this.send({ type: 'zoom', delta: pinchDelta > 0 ? 1 : -1 });
        this._lastPinchDist = currentDist;
        return;
      }
    }
    this._lastPinchDist = currentDist;

    // Scroll
    if (Math.abs(avgDeltaX) > this.SCROLL_THRESHOLD || Math.abs(avgDeltaY) > this.SCROLL_THRESHOLD) {
      this.send({
        type: 'scroll',
        deltaX: avgDeltaX * this.scrollSpeed,
        deltaY: avgDeltaY * this.scrollSpeed
      });
    }
  }

  handleMultiFingerMove(e, count) {
    // Track the first finger's movement for swipe direction
    const touch = e.touches[0];
    const data = this.touches[touch.identifier];
    if (!data) return;

    data.lastX = touch.clientX;
    data.lastY = touch.clientY;
    data.moved = true;
    this._gestureHadMovement = true;
  }

  onTouchEnd(e) {
    e.preventDefault();

    for (const touch of e.changedTouches) {
      const data = this.touches[touch.identifier];
      if (!data) continue;

      const duration = Date.now() - data.startTime;
      const dx = touch.clientX - data.startX;
      const dy = touch.clientY - data.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      delete this.touches[touch.identifier];
    }

    const remainingTouches = Object.keys(this.touches).length;

    // Only process gestures when ALL fingers are lifted
    if (remainingTouches === 0) {
      this.touchpad.classList.remove('touching');
      this._lastPinchDist = undefined;
      this.hideGesture();
      this.clearLongPress();

      // End select mode
      if (this.isSelecting) {
        this.isSelecting = false;
        this.send({ type: 'drag_end' });
      }

      // End drag mode
      if (this.isDragging) {
        this.isDragging = false;
        this.send({ type: 'drag_end' });
      }

      // Determine what gesture just happened using maxTouchCount
      const lastTouch = e.changedTouches[e.changedTouches.length - 1];
      const lastData = {
        startX: lastTouch.clientX,
        startY: lastTouch.clientY,
        startTime: Date.now()
      };

      // Use the *first* ended touch for direction calculation
      const t = e.changedTouches[0];
      const firstTouchId = t.identifier;

      // We already deleted from this.touches, so compute from the touch event
      // We need to reconstruct from captured data - use a simpler approach:
      // Check if any touch in this gesture moved
      const anyMoved = this._gestureHadMovement;
      const gestureDuration = Date.now() - (this._gestureStartTime || Date.now());

      if (this.maxTouchCount >= 4 && anyMoved) {
        // Four-finger swipe → Switch Desktop
        const dx = t.clientX - (this._gestureStartX || t.clientX);
        const direction = dx > 0 ? 'right' : 'left';
        this.send({ type: 'four_finger_swipe', direction });
        this.haptic(30);
        this.showGesture('Switch Desktop');

      } else if (this.maxTouchCount === 3 && anyMoved && gestureDuration < 600) {
        // Three-finger swipe → Alt+Tab
        this.send({ type: 'three_finger_swipe' });
        this.haptic(30);
        this.showGesture('Alt+Tab');

      } else if (this.maxTouchCount === 3 && !anyMoved && gestureDuration < this.TAP_MAX_DURATION) {
        // ── Three-finger tap → Middle click ──
        this.send({ type: 'middleclick' });
        this.haptic(20);
        this.showGesture('Middle Click');
        this.showRipple(t.clientX, t.clientY, false);

      } else if (this.maxTouchCount === 2 && !anyMoved && gestureDuration < this.TAP_MAX_DURATION) {
        // ── Two-finger tap → Right click ──
        this.send({ type: 'rightclick' });
        this.haptic(25);
        this.showGesture('Right Click');
        this.showRipple(t.clientX, t.clientY, false);

      } else if (this.maxTouchCount === 1 && !anyMoved && gestureDuration < this.TAP_MAX_DURATION) {
        // ── Single Tap → Click (with double-tap detection) ──
        if (!this.isSelecting) {
          const now = Date.now();
          if (now - this.lastTapTime < this.DOUBLE_TAP_INTERVAL) {
            // Double tap
            clearTimeout(this._pendingTap);
            this._pendingTap = null;
            this.send({ type: 'doubleclick' });
            this.haptic(15);
            this.showRipple(t.clientX, t.clientY, true);
            this.lastTapTime = 0;
          } else {
            // Single tap — wait briefly for potential double tap
            this.lastTapTime = now;
            const tapX = t.clientX;
            const tapY = t.clientY;
            this._pendingTap = setTimeout(() => {
              if (this.lastTapTime === now) {
                this.send({ type: 'click' });
                this.haptic(10);
                this.showRipple(tapX, tapY, false);
              }
              this._pendingTap = null;
            }, this.DOUBLE_TAP_INTERVAL);
          }
        }
      }

      // Reset gesture tracking
      this.maxTouchCount = 0;
      this._gestureHadMovement = false;
      this._gestureStartTime = undefined;
      this._gestureStartX = undefined;
    }
  }

  // ═══════════════════════════════════════════
  // Mouse Buttons
  // ═══════════════════════════════════════════

  setupButtons() {
    // Left button
    this.btnLeft.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.send({ type: 'click' });
      this.haptic(10);
    });

    // Left button long press → drag
    let leftLongPress = null;
    this.btnLeft.addEventListener('touchstart', (e) => {
      leftLongPress = setTimeout(() => {
        this.isDragging = true;
        this.send({ type: 'drag_start' });
        this.haptic(30);
        this.showGesture('Dragging');
      }, this.LONG_PRESS_DURATION);
    });
    this.btnLeft.addEventListener('touchend', () => {
      clearTimeout(leftLongPress);
      if (this.isDragging) {
        this.isDragging = false;
        this.send({ type: 'drag_end' });
        this.hideGesture();
      }
    });

    // Right button
    this.btnRight.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.send({ type: 'rightclick' });
      this.haptic(25);
    });
  }

  // ═══════════════════════════════════════════
  // Keyboard / Media Buttons
  // ═══════════════════════════════════════════

  setupKeyboardButtons() {
    document.querySelectorAll('.kb-btn').forEach((btn) => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const key = btn.dataset.key;
        const mod = btn.dataset.mod;
        this.send({
          type: 'key',
          key: key,
          modifiers: mod ? [mod] : []
        });
        this.haptic(10);
      });
    });
  }

  // ═══════════════════════════════════════════
  // Orientation Detection
  // ═══════════════════════════════════════════

  setupOrientation() {
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape !== this.isLandscape) {
        this.isLandscape = isLandscape;
        this.switchMode(isLandscape);
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => {
      setTimeout(checkOrientation, 100);
    });

    // Setup keyboard buttons once
    this.setupKeyboardButtons();

    // Initial check
    checkOrientation();
  }

  switchMode(landscape) {
    if (landscape) {
      this.touchpadMode.classList.add('hidden');
      this.keyboardMode.classList.remove('hidden');
      this.modeLabel.textContent = 'KEYBOARD';
    } else {
      this.touchpadMode.classList.remove('hidden');
      this.keyboardMode.classList.add('hidden');
      this.modeLabel.textContent = 'TOUCHPAD';
    }
    this.haptic(15);
  }

  // ═══════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════

  setupSettings() {
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.settingsClose.addEventListener('click', () => this.closeSettings());
    this.settingsOverlay.addEventListener('click', () => this.closeSettings());

    this.sensitivitySlider.addEventListener('input', () => {
      this.sensitivity = parseFloat(this.sensitivitySlider.value);
      this.sensitivityValue.textContent = `${this.sensitivity.toFixed(1)}x`;
      localStorage.setItem('sensitivity', this.sensitivity);
    });

    this.scrollSpeedSlider.addEventListener('input', () => {
      this.scrollSpeed = parseFloat(this.scrollSpeedSlider.value);
      this.scrollSpeedValue.textContent = `${this.scrollSpeed.toFixed(1)}x`;
      localStorage.setItem('scrollSpeed', this.scrollSpeed);
    });

    this.hapticToggle.addEventListener('change', () => {
      this.hapticEnabled = this.hapticToggle.checked;
      localStorage.setItem('hapticEnabled', this.hapticEnabled);
    });
  }

  loadSettings() {
    this.sensitivitySlider.value = this.sensitivity;
    this.sensitivityValue.textContent = `${this.sensitivity.toFixed(1)}x`;
    this.scrollSpeedSlider.value = this.scrollSpeed;
    this.scrollSpeedValue.textContent = `${this.scrollSpeed.toFixed(1)}x`;
    this.hapticToggle.checked = this.hapticEnabled;
  }

  openSettings() {
    this.settingsPanel.classList.remove('hidden');
  }

  closeSettings() {
    this.settingsPanel.classList.add('hidden');
  }

  // ═══════════════════════════════════════════
  // Feedback
  // ═══════════════════════════════════════════

  haptic(duration = 10) {
    if (this.hapticEnabled && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }

  showRipple(x, y, isDouble = false) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    if (isDouble) {
      ripple.style.background = 'var(--accent-light)';
    }
    this.rippleContainer.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  showGesture(text) {
    this.gestureText.textContent = text;
    this.gestureIndicator.classList.remove('hidden');
    this.gestureIndicator.classList.add('visible');
    clearTimeout(this.gestureTimeout);
  }

  hideGesture() {
    this.gestureIndicator.classList.remove('visible');
    this.gestureTimeout = setTimeout(() => {
      this.gestureIndicator.classList.add('hidden');
    }, 200);
  }

  clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  // ═══════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════

  getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// ── Boot ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  new TouchpadApp();
});
