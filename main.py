import os
import json
import threading
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import tkinter as tk
from tkinter import messagebox
from tkwry import WebView
from backend import MusicBackend


def log(msg):
    print(f"[LOG] {msg}", flush=True)


def log_error(msg, exc=None):
    print(f"[ERROR] {msg}", flush=True)
    if exc:
        traceback.print_exc()


# ================= HTTP API СЕРВЕР =================
class ApiHandler(BaseHTTPRequestHandler):
    backend = None

    def do_GET(self):
        parsed = urlparse(self.path)

        # --- Статика ---
        if parsed.path == '/' or parsed.path == '/index.html':
            self.serve_file("index.html", "text/html")
            return
        elif parsed.path == '/style.css':
            self.serve_file("style.css", "text/css")
            return
        elif parsed.path == '/script.js':
            self.serve_file("script.js", "application/javascript")
            return

        # --- API GET ---
        log(f"GET запрос: {self.path}")
        if parsed.path == '/api/search':
            query = parse_qs(parsed.query).get('q', [''])[0]
            log(f"Поиск: '{query}'")
            try:
                tracks = self.backend.search_tracks(query)
                self._send_json([t.to_dict() for t in tracks])
            except Exception as e:
                log_error(f"Ошибка поиска: {e}", e)
                self._send_json({'error': str(e)}, 500)
        elif parsed.path == '/api/playlists':
            try:
                self._send_json([p.to_dict() for p in self.backend.get_playlists()])
            except Exception as e:
                log_error(f"Ошибка получения плейлистов: {e}", e)
                self._send_json({'error': str(e)}, 500)
        elif parsed.path == '/api/stream':
            track_id = parse_qs(parsed.query).get('id', [''])[0]
            try:
                url = self.backend.get_stream_url(track_id)
                self._send_json({'url': url})
            except Exception as e:
                log_error(f"Ошибка получения ссылки: {e}", e)
                self._send_json({'error': str(e)}, 500)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length else '{}'
        try:
            data = json.loads(body)
        except:
            data = {}

        log(f"POST запрос: {self.path}")

        try:
            if parsed.path == '/api/create_playlist':
                pl = self.backend.create_playlist(data.get('name', ''))
                self._send_json(pl.to_dict())
            elif parsed.path == '/api/add_track':
                from models import Track
                track = Track.from_dict(data.get('track', {}))
                ok = self.backend.add_track_to_playlist(data.get('playlist_id'), track)
                self._send_json({'ok': ok})
            elif parsed.path == '/api/remove_track':
                ok = self.backend.remove_track_from_playlist(data.get('playlist_id'), data.get('track_id'))
                self._send_json({'ok': ok})
            elif parsed.path == '/api/rename_playlist':
                ok = self.backend.rename_playlist(data.get('id'), data.get('name'))
                self._send_json({'ok': ok})
            elif parsed.path == '/api/delete_playlist':
                ok = self.backend.delete_playlist(data.get('id'))
                self._send_json({'ok': ok})
            else:
                self.send_error(404)
        except Exception as e:
            log_error(f"Ошибка POST запроса: {e}", e)
            self._send_json({'error': str(e)}, 500)

    def serve_file(self, filename, content_type):
        base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
        filepath = os.path.join(base_dir, filename)
        if os.path.exists(filepath):
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            with open(filepath, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404)

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        pass


def start_api_server(backend, port=8765):
    log(f"Запуск API сервера на порту {port}...")
    ApiHandler.backend = backend
    server = HTTPServer(('127.0.0.1', port), ApiHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    log(f"API сервер успешно запущен на http://127.0.0.1:{port}")
    return server


# ================= ПРИЛОЖЕНИЕ =================
class MusicApp:
    def __init__(self, root, backend: MusicBackend):
        self.root = root
        self.backend = backend
        container = tk.Frame(root)
        container.pack(fill=tk.BOTH, expand=True)

        log("Создание WebView...")
        self.web = WebView(container, width=900, height=600)
        self.web.pack(fill=tk.BOTH, expand=True)

        url = "http://127.0.0.1:8765/index.html"
        log(f"Загрузка страницы: {url}")
        self.web.load_url(url)


def main():
    log("Запуск приложения...")
    try:
        backend = MusicBackend()
        log("Бэкенд успешно инициализирован.")
    except Exception as e:
        log_error(f"Ошибка инициализации бэкенда: {e}", e)
        return

    try:
        start_api_server(backend, port=8765)
    except Exception as e:
        log_error("Критическая ошибка: сервер не запустился.", e)
        return

    root = tk.Tk()
    root.title("NEON MUSIC")
    root.geometry("900x600")

    try:
        app = MusicApp(root, backend)
        root.mainloop()
    except Exception as e:
        log_error(f"Критическая ошибка в UI: {e}", e)


if __name__ == "__main__":
    main()