#!/usr/bin/env python3
"""
Serve the shajrah site and save tree edits from the browser.

  python serve.py
  → http://localhost:8080/shajrah/edit.html

Use this instead of: python -m http.server 8080
"""

import json
import shutil
import sys
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).parent


class ShajrahHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("[api] %s - %s\n" % (self.address_string(), fmt % args))
        elif not self.path.endswith((".js", ".css", ".json", ".jpg", ".png", ".ico")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        if self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/save-tree":
            self._save_tree()
        else:
            self.send_error(404, "Not found")

    def _save_tree(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))

            backup_dir = ROOT / "backups"
            backup_dir.mkdir(exist_ok=True)
            ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            tree_path = ROOT / "master_tree.json"

            if tree_path.exists():
                shutil.copy2(tree_path, backup_dir / f"master_tree_{ts}.json")

            with open(tree_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)

            web_copy = ROOT / "shajrah" / "data" / "master_tree.json"
            web_copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(tree_path, web_copy)

            sys.path.insert(0, str(ROOT))
            from apply_corrections import export_all_files, flatten

            export_all_files(payload["tree"])
            flat = flatten(payload["tree"])
            payload["stats"] = {
                "total_entries": len(flat),
                "unique_persons": len({r["id"] for r in flat}),
                "max_depth": max(r["depth"] for r in flat),
            }
            with open(tree_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            shutil.copy2(tree_path, web_copy)

            body = json.dumps(
                {"ok": True, "backup": f"backups/master_tree_{ts}.json", "persons": payload["stats"]["unique_persons"]},
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            err = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(("127.0.0.1", port), ShajrahHandler)
    print(f"Serving {ROOT}")
    print(f"  Editor:  http://127.0.0.1:{port}/tools/editor/edit.html")
    print(f"  Tree:    http://127.0.0.1:{port}/shajrah/index.html")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
