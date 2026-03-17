# 🖱️ Wireless Touchpad

Turn your smartphone into a wireless touchpad for your laptop.

## How It Works

Your laptop runs a lightweight Python server. Your phone connects to it via WiFi (same network) through a web browser — **no app installation required**.

```
📱 Phone (browser)  ←—— WebSocket ——→  💻 Laptop (Python server)
   Touch events                          Mouse/keyboard simulation
```

## Quick Start

### 1. Prerequisites

- **Python** 3.8+ installed on your laptop

### 2. Install Dependencies & Run

```bash
cd server
pip install -r requirements.txt
python server.py
```

### 3. Connect Your Phone

1. Make sure your phone and laptop are on the **same WiFi network**
2. The server will display a **QR code** in the terminal — scan it with your phone camera
3. Or manually open the URL shown (e.g., `http://192.168.1.x:8766`) in your phone's browser
4. Start using your phone as a touchpad! 🎉

## Features

### Portrait Mode — Touchpad
| Gesture | Action |
|---------|--------|
| Single finger drag | Move cursor |
| Single tap | Left click |
| Double tap | Double click (select word) |
| Double tap + hold + drag | Select text |
| Long press | Right click |
| Two-finger tap | Right click |
| Two-finger swipe | Scroll (vertical + horizontal) |
| Three-finger tap | Middle click (e.g., open link in new tab) |
| Three-finger swipe | Switch apps (Alt+Tab) |
| Four-finger swipe | Switch virtual desktops |
| Pinch (two fingers) | Zoom in/out |
| Left button area | Left click (bottom bar) |
| Right button area | Right click (bottom bar) |
| Hold left button + drag | Drag and drop |

### Landscape Mode — Keyboard Shortcuts
Rotate your phone to access media controls and shortcuts:
- **Media**: Play/Pause, Next, Previous, Volume, Mute
- **Shortcuts**: Alt+Tab, Win+D, Win+L, Win+E, Ctrl+C/V/Z/A
- **Navigation**: Esc, Delete, Enter, Space, Backspace

### Settings
- Cursor sensitivity control
- Scroll speed adjustment
- Haptic feedback toggle
- Settings persist across sessions

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't connect | Ensure both devices are on the same WiFi network |
| Cursor doesn't move | Run `server.py` as administrator |
| High latency | Move closer to WiFi router |
| No haptic feedback | Only works on mobile devices with vibration hardware |

## Project Structure

```
Touchpad app/
├── server/
│   ├── server.py          # Python server (pyautogui + websockets)
│   └── requirements.txt   # Python dependencies
├── client/
│   ├── index.html         # Mobile web app
│   ├── style.css          # Dark theme styling
│   └── app.js             # Touch gesture handling
└── README.md
```

## Tech Stack

- **Server**: Python, pyautogui, websockets
- **Client**: Vanilla HTML/CSS/JS, Web Vibration API
- **Communication**: WebSocket (low latency, bidirectional)
