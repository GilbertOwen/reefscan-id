"""Local static server for app/ with the MIME types the app needs (.mjs, .wasm, .onnx) and no caching.

usage: python tools/serve_app.py [port] [--isolate]   (serves the app folder next to this tools folder)
--isolate adds the cross-origin isolation headers (COOP/COEP), which let onnxruntime-web use several threads.
"""
import functools, http.server, os, sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".onnx": "application/octet-stream", ".json": "application/json", ".csv": "text/csv", ".woff2": "font/woff2"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        if ISOLATE:
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


ISOLATE = "--isolate" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
port = int(args[0]) if args else 5173
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=APP)).serve_forever()
