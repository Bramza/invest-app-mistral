"""InvestTrack - portfolio-webapp.

Draait met alleen de Python-standaardbibliotheek:
    python3 app.py
Open daarna http://localhost:8000
"""

import json
import os
import random
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "portfolio.json")

HOST = "127.0.0.1"
PORT = 8000

HOLDING_TYPES = ("aandeel", "etf", "crypto", "obligatie", "grondstof")

_lock = threading.RLock()


def _seed_holdings():
    now = time.time()
    return [
        {"id": uuid.uuid4().hex[:12], "name": "ASML", "type": "aandeel", "amount": 12,
         "buy_price": 612.40, "current_price": 742.85, "created_at": now - 212 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "NVIDIA", "type": "aandeel", "amount": 40,
         "buy_price": 48.20, "current_price": 131.60, "created_at": now - 540 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "Apple", "type": "aandeel", "amount": 25,
         "buy_price": 178.15, "current_price": 227.48, "created_at": now - 320 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "Bitcoin", "type": "crypto", "amount": 0.42,
         "buy_price": 42500.00, "current_price": 91250.00, "created_at": now - 700 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "Ethereum", "type": "crypto", "amount": 6.5,
         "buy_price": 2310.00, "current_price": 3415.75, "created_at": now - 455 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "VWRL (VWCE)", "type": "etf", "amount": 85,
         "buy_price": 104.30, "current_price": 118.92, "created_at": now - 980 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "iShares MSCI World", "type": "etf", "amount": 60,
         "buy_price": 82.75, "current_price": 96.40, "created_at": now - 620 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "Goud", "type": "grondstof", "amount": 15,
         "buy_price": 78.10, "current_price": 96.85, "created_at": now - 150 * 86400},
        {"id": uuid.uuid4().hex[:12], "name": "Staatslening NL 2,5%", "type": "obligatie", "amount": 10,
         "buy_price": 98.20, "current_price": 101.35, "created_at": now - 260 * 86400},
    ]


def _seed_history(total_value):
    now = time.time()
    random.seed(7)
    points = []
    value = total_value * 0.78
    for i in range(30, -1, -1):
        points.append({"t": round(now - i * 86400), "v": round(value, 2)})
        value *= 1 + random.gauss(0.0016, 0.011)
    points[-1]["v"] = round(total_value, 2)
    return points


def _load():
    with _lock:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        holdings = _seed_holdings()
        invested = sum(h["amount"] * h["buy_price"] for h in holdings)
        value = sum(h["amount"] * h["current_price"] for h in holdings)
        data = {
            "cash": 4250.00,
            "holdings": holdings,
            "history": _seed_history(value),
        }
        _save(data)
        return data


def _save(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


def _totals(data):
    holdings_value = sum(h["amount"] * h["current_price"] for h in data["holdings"])
    invested = sum(h["amount"] * h["buy_price"] for h in data["holdings"])
    total = holdings_value + data.get("cash", 0.0)
    pl = total - (invested + data.get("cash", 0.0))
    pl_holdings = holdings_value - invested
    pl_pct = (pl_holdings / invested * 100) if invested else 0.0
    return {
        "cash": data.get("cash", 0.0),
        "holdings_value": round(holdings_value, 2),
        "invested": round(invested, 2),
        "total_value": round(total, 2),
        "pl": round(pl_holdings, 2),
        "pl_pct": round(pl_pct, 2),
        "positions": len(data["holdings"]),
    }


def _portfolio_payload():
    data = _load()
    return {
        "totals": _totals(data),
        "cash": data.get("cash", 0.0),
        "holdings": data["holdings"],
        "history": data["history"],
        "types": list(HOLDING_TYPES),
    }


def _validate_holding(body, partial=False):
    errors = {}
    out = {}
    if not partial or "name" in body:
        name = str(body.get("name", "")).strip()
        if not name:
            errors["name"] = "Naam is verplicht"
        elif len(name) > 60:
            errors["name"] = "Naam is te lang (max 60 tekens)"
        else:
            out["name"] = name
    if not partial or "type" in body:
        t = str(body.get("type", "")).strip().lower()
        if t not in HOLDING_TYPES:
            errors["type"] = "Kies een geldig type"
        else:
            out["type"] = t
    for field, label in (("amount", "Aantal"), ("buy_price", "Aankoopprijs"), ("current_price", "Huidige prijs")):
        if not partial or field in body:
            try:
                v = float(body.get(field))
                if v < 0:
                    errors[field] = f"{label} mag niet negatief zijn"
                else:
                    out[field] = round(v, 6)
            except (TypeError, ValueError):
                errors[field] = f"{label} moet een getal zijn"
    if not partial and ("amount" in body or "amount" in errors):
        if "amount" not in errors:
            if out.get("amount", 1) <= 0:
                errors["amount"] = "Aantal moet groter dan 0 zijn"
    return out, errors


class Handler(BaseHTTPRequestHandler):
    server_version = "InvestTrack/1.0"

    def log_message(self, fmt, *args):
        pass

    # ---------- helpers ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message, errors=None):
        payload = {"error": message}
        if errors:
            payload["errors"] = errors
        self._send_json(payload, status)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def _send_file(self, path):
        ctypes = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }
        ext = os.path.splitext(path)[1].lower()
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self._send_error_json(404, "Niet gevonden")
            return
        self.send_response(200)
        self.send_header("Content-Type", ctypes.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    # ---------- routing ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            self._send_file(os.path.join(STATIC_DIR, "index.html"))
        elif path == "/api/portfolio":
            self._send_json(_portfolio_payload())
        elif path.startswith("/static/"):
            rel = path[len("/static/"):]
            full = os.path.realpath(os.path.join(STATIC_DIR, rel))
            if not (full == os.path.realpath(STATIC_DIR) or full.startswith(os.path.realpath(STATIC_DIR) + os.sep)):
                self._send_error_json(403, "Verboden")
                return
            self._send_file(full)
        else:
            self._send_error_json(404, "Niet gevonden")

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/holdings":
            body = self._read_body()
            if body is None:
                self._send_error_json(400, "Ongeldige JSON")
                return
            fields, errors = _validate_holding(body)
            if errors:
                self._send_error_json(422, "Controleer de invoervelden", errors)
                return
            with _lock:
                data = _load()
                holding = {
                    "id": uuid.uuid4().hex[:12],
                    "created_at": time.time(),
                    **fields,
                }
                data["holdings"].append(holding)
                _save(data)
            self._send_json({"ok": True, "holding": holding}, 201)
        elif path == "/api/cash":
            body = self._read_body()
            if body is None:
                self._send_error_json(400, "Ongeldige JSON")
                return
            try:
                cash = float(body.get("amount"))
                if cash < 0:
                    raise ValueError
            except (TypeError, ValueError):
                self._send_error_json(422, "Contant bedrag moet een getal >= 0 zijn")
                return
            with _lock:
                data = _load()
                data["cash"] = round(cash, 2)
                _save(data)
            self._send_json({"ok": True, "portfolio": _portfolio_payload()})
        elif path == "/api/simulate":
            with _lock:
                data = _load()
                for h in data["holdings"]:
                    drift = random.gauss(0.0009, 0.018)
                    shock = random.random() < 0.06
                    if shock:
                        drift += random.uniform(-0.05, 0.06)
                    h["current_price"] = round(max(0.01, h["current_price"] * (1 + drift)), 6)
                data["history"].append({"t": round(time.time()), "v": _totals(data)["total_value"]})
                data["history"] = data["history"][-120:]
                _save(data)
            self._send_json({"ok": True, "portfolio": _portfolio_payload()})
        else:
            self._send_error_json(404, "Niet gevonden")

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/holdings/"):
            hid = path.rsplit("/", 1)[-1]
            body = self._read_body()
            if body is None:
                self._send_error_json(400, "Ongeldige JSON")
                return
            fields, errors = _validate_holding(body, partial=True)
            if errors:
                self._send_error_json(422, "Controleer de invoervelden", errors)
                return
            with _lock:
                data = _load()
                for h in data["holdings"]:
                    if h["id"] == hid:
                        h.update(fields)
                        _save(data)
                        self._send_json({"ok": True, "holding": h})
                        return
            self._send_error_json(404, "Belegging niet gevonden")
        else:
            self._send_error_json(404, "Niet gevonden")

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/holdings/"):
            hid = path.rsplit("/", 1)[-1]
            with _lock:
                data = _load()
                before = len(data["holdings"])
                data["holdings"] = [h for h in data["holdings"] if h["id"] != hid]
                if len(data["holdings"]) == before:
                    self._send_error_json(404, "Belegging niet gevonden")
                    return
                _save(data)
            self._send_json({"ok": True})
        else:
            self._send_error_json(404, "Niet gevonden")


def main():
    _load()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"InvestTrack draait op http://localhost:{PORT}  (Ctrl+C om te stoppen)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
