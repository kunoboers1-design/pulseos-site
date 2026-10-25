#!/usr/bin/env python3
"""Lokale statische preview, zonder Apple-authenticatie of echte Premium-verificatie."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


# MARK: - Lokale preview
# Comment NL: API-configuratie is expliciet uitgeschakeld; geen credentials of live mocktoegang.
class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/api/pulsefx-config':
            self.respond_json({'enabled': False}, 200)
        elif self.path.startswith('/api/pulsefx-premium/'):
            self.respond_json({'error': 'NOT_CONFIGURED'}, 503)
        else:
            super().do_GET()

    def do_POST(self):
        self.respond_json({'error': 'NOT_CONFIGURED'}, 503)

    def do_DELETE(self):
        self.respond_json({'error': 'NOT_CONFIGURED'}, 503)

    def respond_json(self, body, status):
        content = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8766), partial(PreviewHandler, directory=str(ROOT / 'dist')))
    print('Preview: http://127.0.0.1:8766/pulsefx/icloud/?statistics=demo#premium-statistics', flush=True)
    server.serve_forever()
