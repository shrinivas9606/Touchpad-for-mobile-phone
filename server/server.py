"""
Wireless Touchpad - Desktop Server
Receives gesture data via WebSocket and simulates mouse/keyboard actions.
"""

import asyncio
import json
import os
import socket
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import pyautogui
import websockets

# -- Configuration ------------------------------------------------
PORT_WS = 8765          # WebSocket port
PORT_HTTP = 8766        # HTTP port (serves the mobile client)
SCROLL_SPEED = 5        # Lines per scroll event
SCROLL_THRESHOLD = 5    # Min delta to trigger scroll

# Disable pyautogui's fail-safe (moving to corner pauses)
pyautogui.FAILSAFE = False
# Set minimal pause for low latency
pyautogui.PAUSE = 0

# -- Message Handler ----------------------------------------------

def handle_message(msg: dict):
    """Process incoming gesture messages and simulate input."""
    msg_type = msg.get('type')

    if msg_type == 'move':
        dx = msg.get('deltaX', 0)
        dy = msg.get('deltaY', 0)
        sensitivity = msg.get('sensitivity', 1)
        pyautogui.moveRel(dx * sensitivity, dy * sensitivity, _pause=False)

    elif msg_type == 'click':
        pyautogui.click(_pause=False)

    elif msg_type == 'doubleclick':
        pyautogui.doubleClick(_pause=False)

    elif msg_type == 'rightclick':
        pyautogui.rightClick(_pause=False)

    elif msg_type == 'middleclick':
        pyautogui.middleClick(_pause=False)

    elif msg_type == 'scroll':
        dx = msg.get('deltaX', 0)
        dy = msg.get('deltaY', 0)

        if abs(dy) > SCROLL_THRESHOLD:
            scroll_amount = -SCROLL_SPEED if dy > 0 else SCROLL_SPEED
            pyautogui.scroll(scroll_amount, _pause=False)
        if abs(dx) > SCROLL_THRESHOLD:
            scroll_amount = SCROLL_SPEED if dx > 0 else -SCROLL_SPEED
            pyautogui.hscroll(scroll_amount, _pause=False)

    elif msg_type == 'drag_start':
        pyautogui.mouseDown(_pause=False)

    elif msg_type == 'drag_move':
        dx = msg.get('deltaX', 0)
        dy = msg.get('deltaY', 0)
        sensitivity = msg.get('sensitivity', 1)
        pyautogui.moveRel(dx * sensitivity, dy * sensitivity, _pause=False)

    elif msg_type == 'drag_end':
        pyautogui.mouseUp(_pause=False)

    elif msg_type == 'key':
        key = msg.get('key', '')
        modifiers = msg.get('modifiers', [])
        # Map modifier names
        mod_map = {
            'control': 'ctrl',
            'command': 'win',
            'alt': 'alt',
            'shift': 'shift'
        }
        mapped_mods = [mod_map.get(m, m) for m in modifiers]

        if mapped_mods:
            pyautogui.hotkey(*mapped_mods, key, _pause=False)
        else:
            pyautogui.press(key, _pause=False)

    elif msg_type == 'three_finger_swipe':
        pyautogui.hotkey('alt', 'tab', _pause=False)

    elif msg_type == 'four_finger_swipe':
        direction = msg.get('direction', 'right')
        if direction == 'left':
            pyautogui.hotkey('ctrl', 'win', 'left', _pause=False)
        else:
            pyautogui.hotkey('ctrl', 'win', 'right', _pause=False)

    elif msg_type == 'zoom':
        delta = msg.get('delta', 0)
        pyautogui.keyDown('ctrl', _pause=False)
        scroll_dir = SCROLL_SPEED if delta > 0 else -SCROLL_SPEED
        pyautogui.scroll(scroll_dir, _pause=False)
        pyautogui.keyUp('ctrl', _pause=False)


# -- WebSocket Server ---------------------------------------------

client_count = 0

async def ws_handler(websocket):
    global client_count
    client_count += 1
    print(f"\n[+] Device connected ({client_count} active)")

    try:
        await websocket.send(json.dumps({
            'type': 'connected',
            'message': 'Connected to touchpad server'
        }))

        async for raw in websocket:
            try:
                msg = json.loads(raw)
                handle_message(msg)
            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f"Error handling message: {e}")

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        client_count -= 1
        print(f"[-] Device disconnected ({client_count} active)")


# -- HTTP Server (serves mobile client) ---------------------------

class ClientHandler(SimpleHTTPRequestHandler):
    """Serve files from the client directory."""
    def __init__(self, *args, **kwargs):
        client_dir = str(Path(__file__).parent.parent / 'client')
        super().__init__(*args, directory=client_dir, **kwargs)

    def log_message(self, format, *args):
        pass  # Suppress HTTP logs for cleaner terminal output


def start_http_server(port):
    """Start HTTP server in a background thread."""
    server = HTTPServer(('0.0.0.0', port), ClientHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


# -- Utilities -----------------------------------------------------

def get_local_ip():
    """Get the local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def print_qr(url):
    """Print a QR code to terminal if qrcode library is available."""
    try:
        import qrcode
        qr = qrcode.QRCode(box_size=1, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        matrix = qr.get_matrix()
        for row in matrix:
            line = ''
            for cell in row:
                line += '##' if cell else '  '
            print(line)
    except Exception:
        print(f"  -> Open this URL on your phone: {url}")


# -- Main ----------------------------------------------------------

async def main():
    ip = get_local_ip()
    url = f"http://{ip}:{PORT_HTTP}"

    print()
    print("=" * 50)
    print("      TOUCHPAD SERVER RUNNING")
    print("=" * 50)
    print(f"  URL:       {url}")
    print(f"  WebSocket: ws://{ip}:{PORT_WS}")
    print("-" * 50)
    print("  Scan QR code with your phone:")
    print()
    print_qr(url)
    print(f"\n  Open {url} on your phone")
    print("  (Both devices must be on the same WiFi)\n")

    # Start HTTP server for the mobile client
    start_http_server(PORT_HTTP)

    # Start WebSocket server
    async with websockets.serve(ws_handler, '0.0.0.0', PORT_WS):
        print(f"  [OK] WebSocket server listening on port {PORT_WS}")
        print(f"  [OK] HTTP server listening on port {PORT_HTTP}")
        print("\n  Press Ctrl+C to stop.\n")
        await asyncio.Future()  # Run forever


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        sys.exit(0)
