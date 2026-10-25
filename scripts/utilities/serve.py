"""Serve the current directory on localhost without browser caching.

Usage:
    python scripts/utilities/serve.py [port]

The default port is 5178. Run the command from the directory you want to serve.
"""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheRequestHandler(SimpleHTTPRequestHandler):
    """Static file handler that forces the browser to fetch fresh files."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        # Request logs add noise during local design iteration.
        return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", type=int, default=5178)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    address = ("127.0.0.1", args.port)
    server = ThreadingHTTPServer(address, NoCacheRequestHandler)
    print(f"Serving http://{address[0]}:{address[1]} (cache disabled)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
