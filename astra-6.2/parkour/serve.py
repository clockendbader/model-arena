"""Serve the game locally with room for simultaneous texture requests."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial

class LocalServer(ThreadingHTTPServer):
    request_queue_size = 128

if __name__ == "__main__":
    handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).parent))
    print("Dusk Runner is available at http://localhost:8000", flush=True)
    LocalServer(("127.0.0.1", 8000), handler).serve_forever()
