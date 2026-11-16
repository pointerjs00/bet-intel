"""Egress sidecar giving the odds collector a real browser TLS and HTTP/2 fingerprint.

Sessions are persistent curl_cffi objects so the connection, TLS session and cookie jar survive
across calls. Access is token-gated and restricted to Betano hosts: the service is an egress
proxy for one site, not a general one.
"""
import os
import sys
import threading
import uuid
from collections import OrderedDict
from urllib.parse import urljoin, urlparse

from curl_cffi import requests as creq
from flask import Flask, jsonify, request

IMPERSONATE = os.environ.get("BETANO_IMPERSONATE", "chrome")
TOKEN = os.environ.get("BETANO_EGRESS_TOKEN", "")
MAX_SESSIONS = int(os.environ.get("BETANO_MAX_SESSIONS", "8"))
TIMEOUT = 20
MAX_REDIRECTS = 5
MAX_BODY = 4_000_000
ALLOWED_HOSTS = {"www.betano.pt", "betano.pt"}


def _resolve_target(name: str) -> str:
    """Return the concrete browser target curl_cffi uses for an alias such as "chrome"."""
    try:
        from curl_cffi.requests.impersonate import REAL_TARGET_MAP

        return str(REAL_TARGET_MAP.get(name, name))
    except Exception:  # noqa: BLE001 - older curl_cffi without the map
        return name


RESOLVED_IMPERSONATE = _resolve_target(IMPERSONATE)

app = Flask(__name__)
# sid -> (session, per-session lock). curl_cffi sessions are not thread-safe.
_sessions: "OrderedDict[str, tuple[creq.Session, threading.Lock]]" = OrderedDict()
_lock = threading.Lock()


def _allowed(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and parsed.hostname in ALLOWED_HOSTS


def _create(sid: str) -> None:
    session = creq.Session(impersonate=IMPERSONATE, timeout=TIMEOUT)
    _sessions[sid] = (session, threading.Lock())
    while len(_sessions) > MAX_SESSIONS:
        _, (old, _old_lock) = _sessions.popitem(last=False)
        old.close()


def _get(sid: str):
    """Return (session, lock) for a known sid, or None. Only POST /session creates sessions."""
    with _lock:
        entry = _sessions.get(sid)
        if entry is not None:
            _sessions.move_to_end(sid)
        return entry


def _unknown():
    return jsonify(error="unknown session"), 404


@app.before_request
def _auth():
    if request.path == "/ping":
        return None
    if request.headers.get("x-egress-token") != TOKEN:
        return jsonify(error="unauthorized"), 401
    return None


@app.get("/ping")
def ping():
    return jsonify(
        ok=True,
        impersonate=IMPERSONATE,
        resolved=RESOLVED_IMPERSONATE,
        sessions=len(_sessions),
    )


@app.post("/session")
def new_session():
    sid = uuid.uuid4().hex
    with _lock:
        _create(sid)
    return jsonify(sid=sid)


@app.delete("/session/<sid>")
def drop_session(sid: str):
    with _lock:
        entry = _sessions.pop(sid, None)
    if entry is not None:
        entry[0].close()
    return jsonify(ok=True)


@app.get("/cookies/<sid>")
def get_cookies(sid: str):
    entry = _get(sid)
    if entry is None:
        return _unknown()
    session, slock = entry
    with slock:
        return jsonify(cookies={c.name: c.value for c in session.cookies.jar})


@app.post("/cookies/<sid>")
def set_cookies(sid: str):
    entry = _get(sid)
    if entry is None:
        return _unknown()
    session, slock = entry
    cookies = (request.get_json(force=True, silent=True) or {}).get("cookies") or {}
    with slock:
        for name, value in cookies.items():
            session.cookies.set(name, value, domain=".betano.pt")
    return jsonify(ok=True)


@app.post("/fetch")
def fetch():
    body = request.get_json(force=True, silent=True) or {}
    url = body.get("url")
    if not isinstance(url, str) or not body.get("sid"):
        return jsonify(error="pedido inválido"), 400
    if not _allowed(url):
        return jsonify(error=f"host não permitido: {url}"), 400

    entry = _get(body["sid"])
    if entry is None:
        return _unknown()
    session, slock = entry
    method = (body.get("method") or "GET").upper()
    headers = OrderedDict(body.get("headers") or [])
    payload = body.get("body")
    data = payload.encode("utf-8") if payload is not None else None

    current, hops = url, 0
    with slock:
        while True:
            try:
                res = session.request(
                    method, current, headers=dict(headers), data=data, allow_redirects=False
                )
            except Exception as exc:  # noqa: BLE001
                return jsonify(error=str(exc)), 502

            location = res.headers.get("location")
            if res.status_code in (301, 302, 303, 307, 308) and location and hops < MAX_REDIRECTS:
                current = urljoin(current, location)
                if not _allowed(current):
                    return jsonify(error=f"redirect para host não permitido: {current}"), 502
                if res.status_code in (301, 302, 303):
                    method, data = "GET", None
                hops += 1
                continue
            break

    if len(res.content) > MAX_BODY:
        return jsonify(error="corpo demasiado grande"), 502

    return jsonify(
        status=res.status_code,
        headers={k.lower(): v for k, v in res.headers.items()},
        text=res.text,
        url=current,
    )


if __name__ == "__main__":
    if not TOKEN:
        sys.exit("BETANO_EGRESS_TOKEN vazio: define-o (openssl rand -hex 32) antes de arrancar o sidecar.")
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8765")),
        threaded=True,
    )
