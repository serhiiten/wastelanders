"""Look at the built wiki locally the way GitHub Pages will serve it.

    python site/build.py && python site/serve.py [port]      → http://localhost:8800/wastelanders/rules/

/wastelanders/rules/… comes from _site/rules, /wastelanders/404.html from _site, everything else under /wastelanders/
(the Terminal, the sheets, owlbear/) from the repository itself; a missing address gets _site/404.html with status 404,
as on Pages.
"""
import functools
import http.server
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(REPO, "_site")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                      ".css": "text/css; charset=utf-8", ".json": "application/json"}

    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        if not path.startswith("/wastelanders/"):
            return os.path.join(SITE, "__none__")
        rest = path[len("/wastelanders/"):]
        base = SITE if rest.startswith("rules/") or rest.startswith("rules?") or rest in ("rules", "404.html") else REPO
        if rest.startswith("wiki/") or rest.startswith("site/") or rest.startswith("."):
            return os.path.join(SITE, "__none__")     # the workflow does not publish these (plan §2.7)
        return os.path.join(base, *[p for p in rest.split("/") if p and p != ".."])

    def send_error(self, code, message=None, explain=None):
        if code == 404 and os.path.exists(os.path.join(SITE, "404.html")):
            with open(os.path.join(SITE, "404.html"), "rb") as fh:
                body = fh.read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=SITE))
    print(f"http://localhost:{port}/wastelanders/rules/")
    srv.serve_forever()


if __name__ == "__main__":
    main()
