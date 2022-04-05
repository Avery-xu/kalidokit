import logging
import json
# from urllib import parse
from queue import Queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):

    def _set_response(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header("Access-Control-Allow-Methods", "GET,POST")
        self.send_header("Access-Control-Allow-Headers", "x-api-key,Content-Type")
        self.end_headers()

    def do_GET(self):
        self._set_response()
        json_data = json.dumps(q.get())
        self.wfile.write(json_data.encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        json_data = json.loads(post_data)
        q.put(json_data)

    def do_OPTIONS(self):
        self._set_response()

def serve(server_class=ThreadingHTTPServer, handler_class=Handler, port=42024):
    logging.basicConfig(level=logging.INFO)
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    logging.info('Starting httpd at %s:%s \n' % ('0.0.0.0', port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    logging.info('Stopping httpd...\n')

port = 43034
q = Queue()
serve(port=port)