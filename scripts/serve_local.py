from __future__ import annotations

import argparse
import functools
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class TractMapHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".pbf": "application/x-protobuf",
    }

    def end_headers(self) -> None:
        suffix = Path(self.path.split("?", 1)[0]).suffix.lower()
        if suffix == ".pbf":
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Cache-Control", "public, max-age=3600")
        elif suffix in {".json", ".html", ".js", ".css"}:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the tract map locally.")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Directory to serve",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    os.chdir(root)
    handler = functools.partial(TractMapHandler, directory=str(root))
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)
    print(f"Serving {root} at http://localhost:{args.port}/web/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
