"""Portaria VinIA — cadastro de entrada.

HTTP stdlib puro (sem Flask/FastAPI) + psycopg2 pra Postgres.
Animação HTML/CSS de catraca com slide-in do crachá.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import psycopg2
import psycopg2.extras

ROOT = Path(__file__).parent
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"

DB_DSN = os.environ.get(
    "PORTARIA_DSN",
    "",  # fallback uses kwargs below
)


def _parse_dsn_kv(dsn: str) -> dict:
    """psycopg2 parse_dsn but preserves 'options' as one value (not re-split)."""
    out = {}
    if not dsn:
        return out
    for part in dsn.split():
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        out[k.strip()] = v.strip()
    return out


# Parse DSN once at import time; use kwargs so 'options' stays one value
_DSN_KW = _parse_dsn_kv(DB_DSN) if DB_DSN else {
    "host": "/var/run/postgresql",
    "port": "5432",
    "dbname": "portaria",
    "user": "vinicius",
}
LIST_TOKEN = os.environ.get("PORTARIA_LIST_TOKEN", "")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8104"))

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
}

# ---------- helpers ----------


def only_digits(s: str) -> str:
    return re.sub(r"\D+", "", s or "")


def cpf_hash(cpf_digits: str) -> str:
    return hashlib.sha256(cpf_digits.encode("utf-8")).hexdigest()


def mask_cpf(cpf_digits: str) -> str:
    d = cpf_digits
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return d


def mask_phone(phone_digits: str) -> str:
    d = phone_digits
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return d


def cpf_is_valid(digits: str) -> bool:
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    s = 0
    for i in range(9):
        s += int(digits[i]) * (10 - i)
    d1 = (s * 10) % 11
    if d1 == 10:
        d1 = 0
    if d1 != int(digits[9]):
        return False
    s = 0
    for i in range(10):
        s += int(digits[i]) * (11 - i)
    d2 = (s * 10) % 11
    if d2 == 10:
        d2 = 0
    return d2 == int(digits[10])


def phone_is_valid(digits: str) -> bool:
    if len(digits) not in (10, 11):
        return False
    ddd = int(digits[:2])
    if ddd < 11 or ddd > 99:
        return False
    if len(digits) == 11 and digits[2] not in ("9",):
        return False
    if len(digits) == 10 and digits[2] == "9":
        # 11 digits expected when starts with 9
        return False
    return True


def name_is_valid(name: str) -> bool:
    n = (name or "").strip()
    parts = n.split()
    return len(n) >= 3 and len(parts) >= 2


# ---------- DB ----------


def db_connect():
    # Build the DSN ourselves. We avoid passing `options=` because libpq/psycopg2
    # has historically mangled '=' inside option values. Instead, we set search_path
    # after connecting.
    parts = [
        f"host={_DSN_KW.get('host', '')}",
        f"port={_DSN_KW.get('port', '5432')}",
        f"dbname={_DSN_KW.get('dbname', '')}",
        f"user={_DSN_KW.get('user', '')}",
    ]
    dsn = " ".join(parts)
    conn = psycopg2.connect(dsn)
    # Force search_path to public (avoids any per-user default issues).
    with conn.cursor() as cur:
        cur.execute("SET search_path TO public")
    conn.commit()
    return conn


def db_insert(nome: str, telefone: str, cpf: str, h: str) -> tuple[bool, str]:
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO cadastros (nome, telefone, cpf, cpf_hash) "
                    "VALUES (%s, %s, %s, %s) RETURNING id, created_at",
                    (nome.strip(), telefone, cpf, h),
                )
                row_id, created_at = cur.fetchone()
                return True, f"#{row_id:04d} · {created_at.strftime('%d/%m/%Y %H:%M:%S')}"
    except psycopg2.errors.UniqueViolation:
        return False, "CPF já cadastrado."
    except psycopg2.OperationalError as e:
        return False, f"Banco indisponível: {e}"


def db_list(limit: int = 200) -> list[dict]:
    with db_connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, nome, telefone, cpf, created_at "
                "FROM cadastros ORDER BY id DESC LIMIT %s",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]


# ---------- HTTP ----------


class Handler(BaseHTTPRequestHandler):
    server_version = "PortariaVinIA/1.0"

    # ---------- low-level ----------

    def _send(self, code: int, ct: str, body: bytes, headers: dict | None = None):
        self.send_response(code)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} - {fmt % args}", flush=True)

    # ---------- routes ----------

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        if path in ("/", "/index.html"):
            body = (TEMPLATES / "index.html").read_bytes()
            return self._send(200, CONTENT_TYPES[".html"], body)

        if path == "/sucesso":
            body = (TEMPLATES / "sucesso.html").read_bytes()
            return self._send(200, CONTENT_TYPES[".html"], body)

        if path == "/admin":
            token = urllib.parse.parse_qs(url.query).get("token", [""])[0]
            if not LIST_TOKEN or not secrets.compare_digest(token, LIST_TOKEN):
                return self._send(
                    403, "text/plain", "403 — token invalido. Use ?token=<seu-token>".encode("utf-8")
                )
            body = (TEMPLATES / "admin.html").read_bytes()
            return self._send(200, CONTENT_TYPES[".html"], body)

        if path == "/health":
            return self._send(200, "application/json", b'{"status":"ok"}')

        if path.startswith("/static/"):
            rel = path.lstrip("/")
            target = ROOT / rel
            if not target.is_file():
                return self._send(404, "text/plain", b"Not found")
            ct = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
            return self._send(200, ct, target.read_bytes())

        if path == "/lista":
            token = urllib.parse.parse_qs(url.query).get("token", [""])[0]
            if not LIST_TOKEN or not secrets.compare_digest(token, LIST_TOKEN):
                return self._send(
                    403, "text/plain", "403 — token invalido. Use ?token=<seu-token>".encode("utf-8")
                )
            rows = db_list()
            data = json.dumps([{
                "id": r["id"],
                "nome": r["nome"],
                "telefone": mask_phone(only_digits(r["telefone"])),
                "cpf": mask_cpf(only_digits(r["cpf"])),
                "created_at": r["created_at"].strftime("%d/%m/%Y %H:%M:%S"),
            } for r in rows], ensure_ascii=False, indent=2).encode("utf-8")
            return self._send(200, CONTENT_TYPES[".json"], data)

        if path == "/api/count":
            with db_connect() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) FROM cadastros")
                    n = cur.fetchone()[0]
            return self._send(200, "application/json", f'{{"count":{n}}}'.encode())

        if path == "/api/admin/cadastros":
            token = urllib.parse.parse_qs(url.query).get("token", [""])[0]
            if not LIST_TOKEN or not secrets.compare_digest(token, LIST_TOKEN):
                return self._send(
                    403, CONTENT_TYPES[".json"], b'{"error":"token invalido"}'
                )
            rows = db_list()
            data = json.dumps([{
                "id": r["id"],
                "nome": r["nome"],
                "telefone": r["telefone"],
                "cpf": r["cpf"],
                "created_at": r["created_at"].isoformat(),
            } for r in rows], ensure_ascii=False).encode("utf-8")
            return self._send(200, CONTENT_TYPES[".json"], data)

        return self._send(404, "text/plain", b"Not found")

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/api/cadastrar":
            return self._send(404, "text/plain", b"Not found")

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            return self._send(
                400, CONTENT_TYPES[".json"], b'{"ok":false,"error":"json invalido"}'
            )

        nome = (data.get("nome") or "").strip()
        telefone_d = only_digits(data.get("telefone") or "")
        cpf_d = only_digits(data.get("cpf") or "")

        if not name_is_valid(nome):
            return self._send(
                400,
                CONTENT_TYPES[".json"],
                json.dumps({"ok": False, "field": "nome", "error": "informe nome completo"}, ensure_ascii=False).encode(),
            )
        if not phone_is_valid(telefone_d):
            return self._send(
                400,
                CONTENT_TYPES[".json"],
                json.dumps({"ok": False, "field": "telefone", "error": "telefone invalido (use DDD + numero)"}, ensure_ascii=False).encode(),
            )
        if not cpf_is_valid(cpf_d):
            return self._send(
                400,
                CONTENT_TYPES[".json"],
                json.dumps({"ok": False, "field": "cpf", "error": "CPF invalido"}).encode(),
            )

        h = cpf_hash(cpf_d)
        ok, msg = db_insert(nome, mask_phone(telefone_d), mask_cpf(cpf_d), h)
        return self._send(
            200 if ok else 409,
            CONTENT_TYPES[".json"],
            json.dumps({
                "ok": ok,
                "msg": msg,
                "nome": nome.split()[0].title(),
            }, ensure_ascii=False).encode(),
        )


def main():
    print(f"Portaria VinIA listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()