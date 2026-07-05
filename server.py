"""
Trading Dashboard — FastAPI backend.

Serves the pixel-office dashboard and provides:
  - GET  /api/status      → bot running/stopped + trade summary
  - GET  /api/brains      → Brain3 cautions, Brain4 config, shadow/paper stats
  - POST /api/bot/start   → start the bot
  - POST /api/bot/stop    → stop the bot
  - WS   /ws/logs         → real-time log streaming + parsed scene events
"""

import asyncio
import json
import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import (
    BOT_DIR,
    BOT_LOG_FILE,
    BOT_OPEN_TRADES_FILE,
    BOT_CLOSED_TRADES_FILE,
    BOT_AI_PREDICTIONS_FILE,
    BOT_AI_LEARNINGS_FILE,
    BOT_AI_CONFIG_FILE,
    BOT_SHADOW_WISDOM_FILE,
    BOT_SHADOW_PENDING_FILE,
    BOT_PAPER_STATS_FILE,
    BOT_STRATEGY_FILE,
    LAUNCHCTL_LABEL,
    LAUNCHCTL_PLIST,
    LOG_TAIL_LINES,
)

app = FastAPI(title="Trading Dashboard")

# ── Helpers ────────────────────────────────────────────────────


def _is_bot_running() -> tuple[bool, Optional[int]]:
    """Check if the bot is running via launchctl."""
    try:
        result = subprocess.run(
            ["launchctl", "list", LAUNCHCTL_LABEL],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return False, None
        for line in result.stdout.strip().split("\n"):
            if "PID" in line:
                for p in line.split():
                    p = p.strip('";')
                    if p.isdigit():
                        return True, int(p)
        result2 = subprocess.run(
            ["launchctl", "list"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result2.stdout.split("\n"):
            if LAUNCHCTL_LABEL in line:
                parts = line.split()
                if parts[0].isdigit():
                    return True, int(parts[0])
                elif parts[0] == "-":
                    return False, None
        return False, None
    except Exception:
        return False, None


def _read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def _read_jsonl_tail(path: Path, n: int = 50) -> list[dict]:
    if not path.exists():
        return []
    try:
        lines = _tail_lines(path, n)
        result = []
        for line in lines:
            try:
                result.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return result
    except Exception:
        return []


def _tail_lines(path: Path, n: int) -> list[str]:
    """Read the last N lines without loading the whole file (bot.log is ~45MB)."""
    if not path.exists():
        return []
    try:
        # ~200 bytes/line typical; over-read 4x to be safe, cap at 2MB
        block = min(max(n * 800, 64 * 1024), 2 * 1024 * 1024)
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - block))
            data = f.read().decode("utf-8", errors="replace")
        lines = data.split("\n")
        if size > block:
            lines = lines[1:]  # drop partial first line
        return [l for l in lines if l.strip()][-n:]
    except Exception:
        return []


def _launchctl_start() -> str:
    result = subprocess.run(
        ["launchctl", "load", str(LAUNCHCTL_PLIST)],
        capture_output=True, text=True, timeout=10,
    )
    return result.stdout + result.stderr


def _launchctl_stop() -> str:
    result = subprocess.run(
        ["launchctl", "unload", str(LAUNCHCTL_PLIST)],
        capture_output=True, text=True, timeout=10,
    )
    return result.stdout + result.stderr


# ── Log line → scene event parser ──────────────────────────────
# Each rule: (compiled regex, actor, action). First match wins.
# detail/extra fields are filled by _enrich() below.

_RULES: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"🧠 Groq Brain1: (BUY|SELL|LONG|SHORT)\b", re.I), "brain1", "decide_trade"),
    (re.compile(r"🧠 Groq Brain1: HOLD", re.I),                    "brain1", "decide_hold"),
    (re.compile(r"🧠 Brain1 memory", re.I),                        "brain1", "think"),
    (re.compile(r"📊 Setup scores:"),                              "brain1", "scan"),
    (re.compile(r"✅ Entry quality|Executing trade", re.I),        "brain1", "work"),
    (re.compile(r"🚫 .*(BLOCK|GUARD)|Trade not executed", re.I),   "brain1", "blocked"),
    (re.compile(r"🧠 Groq Brain2: CLOSE", re.I),                   "brain2", "decide_close"),
    (re.compile(r"🧠 Groq Brain2: HOLD", re.I),                    "brain2", "decide_hold"),
    (re.compile(r"TRAIL SL|Ratchet|partial[- _]?take|uPnL", re.I), "brain2", "work"),
    (re.compile(r"Open positions.*:\s*\d", re.I),                  "brain2", "work"),
    (re.compile(r"🧠 (Groq )?Brain3 (learned|market read|loss pattern)", re.I), "brain3", "learn"),
    (re.compile(r"COIN CAUTION", re.I),                            "brain3", "caution"),
    (re.compile(r"Knowledge Base rebuilt", re.I),                  "brain3", "work"),
    (re.compile(r"🧠 Brain4 Meta-Optimizer", re.I),                "brain4", "tune_start"),
    (re.compile(r"🧠 Brain4\b", re.I),                             "brain4", "tune"),
    (re.compile(r"Coin tiers rebuilt|Direction balance", re.I),    "brain4", "work"),
    (re.compile(r"👻 Shadow"),                                     "shadow", "track"),
    (re.compile(r"VETO", re.I),                                    "shadow", "veto"),
    (re.compile(r"📝 Paper complete.*PAPER_WIN", re.I),            "paper", "paper_win"),
    (re.compile(r"📝 Paper complete.*PAPER_LOSS", re.I),           "paper", "paper_loss"),
    (re.compile(r"📝 Paper", re.I),                                "paper", "track"),
    (re.compile(r"NewsMonitor|Reddit RSS|CoinGecko|news feeds|News Intel|VADER", re.I), "paper", "news"),
    (re.compile(r"Journal: Position CLOSED.*Result: WIN", re.I),   "office", "win"),
    (re.compile(r"Journal: Position CLOSED.*Result: LOSS", re.I),  "office", "loss"),
    (re.compile(r"📓 Position closed:"),                           "office", "closed"),
    (re.compile(r"Journal: Recorded OPEN", re.I),                  "office", "opened"),
    (re.compile(r"--- Starting analysis cycle #(\d+)"),            "office", "cycle"),
    (re.compile(r"Sleeping (\d+)s", re.I),                         "office", "sleep"),
    (re.compile(r"\| ERROR\s+\|"),                                 "office", "error"),
]

_SCORES_RE = re.compile(r"([A-Z0-9]{2,12}):(LONG|SHORT)=(\d+)")
_MSG_RE = re.compile(r"^[\d\-\s:,.]+\|\s*\w+\s*\|\s*[\w.]+:\d+\s*[—\-]\s*")


def _line_message(line: str) -> str:
    """Strip 'date | LEVEL | module:line — ' prefix, keep the human part."""
    return _MSG_RE.sub("", line).strip()


def parse_event(line: str) -> Optional[dict]:
    for rx, actor, action in _RULES:
        m = rx.search(line)
        if not m:
            continue
        msg = _line_message(line)
        ev = {"actor": actor, "action": action, "text": msg[:110]}
        if action == "scan":
            scores = _SCORES_RE.findall(line)[:6]
            ev["scores"] = [[s, side, int(v)] for s, side, v in scores]
        elif action == "cycle":
            ev["cycle"] = int(m.group(1))
        elif action == "sleep":
            ev["seconds"] = int(m.group(1))
        return ev
    return None


# ── API Endpoints ──────────────────────────────────────────────


@app.get("/api/status")
async def get_status():
    running, pid = _is_bot_running()

    open_trades = _read_json(BOT_OPEN_TRADES_FILE, {})
    closed_trades = _read_jsonl_tail(BOT_CLOSED_TRADES_FILE, n=500)
    total_pnl = sum(t.get("pnl_usdt") or 0 for t in closed_trades)
    wins = sum(1 for t in closed_trades if t.get("result") == "WIN")
    losses = sum(1 for t in closed_trades if t.get("result") == "LOSS")
    win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0

    predictions = _read_jsonl_tail(BOT_AI_PREDICTIONS_FILE, n=10)
    strategy = _read_json(BOT_STRATEGY_FILE, {})

    return {
        "bot": {"running": running, "pid": pid, "bot_dir": str(BOT_DIR)},
        "open_trades": open_trades,
        "closed_summary": {
            "total_trades": len(closed_trades),
            "wins": wins,
            "losses": losses,
            "win_rate": round(win_rate, 1),
            "total_pnl_usdt": round(total_pnl, 4),
        },
        "recent_closed": closed_trades[-10:],
        "recent_predictions": predictions,
        "strategy": strategy,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/brains")
async def get_brains():
    """Live data for the office station boards."""
    cfg = _read_json(BOT_AI_CONFIG_FILE, {}) or {}
    learnings = _read_json(BOT_AI_LEARNINGS_FILE, {}) or {}
    wisdom = _read_json(BOT_SHADOW_WISDOM_FILE, {}) or {}
    pending = _read_json(BOT_SHADOW_PENDING_FILE, {}) or {}
    paper = _read_json(BOT_PAPER_STATS_FILE, {}) or {}

    cautions = []
    adj = learnings.get("adjustments")
    items = adj if isinstance(adj, list) else [adj] if adj else []
    for item in items:
        if isinstance(item, dict):
            for c in item.get("coin_caution") or []:
                if isinstance(c, str) and " - " in c:
                    sym, note = c.split(" - ", 1)
                    cautions.append({"symbol": sym.split("/")[0], "note": note[:140]})
                elif isinstance(c, str):
                    cautions.append({"symbol": c.split("/")[0][:12], "note": ""})

    g = wisdom.get("global_stats") or {}
    blocks = paper.get("by_block_reason") or {}
    top_blocks = sorted(
        ((k, v.get("total", v) if isinstance(v, dict) else v) for k, v in blocks.items()),
        key=lambda kv: -(kv[1] if isinstance(kv[1], (int, float)) else 0),
    )[:5]

    return {
        "config": {
            k: cfg.get(k)
            for k in (
                "confidence_min_long", "confidence_min_short",
                "trail_activation_pct", "trail_keep_pct",
                "brain2_min_hold_minutes", "stale_minutes",
                "proactive_win_pct", "updated_reason",
            )
        },
        "cautions": cautions[:8],
        "shadow": {
            "tracked": len(pending) if isinstance(pending, dict) else 0,
            "global_stats": g,
            "total_trades": wisdom.get("total_trades"),
        },
        "paper": {
            "total": paper.get("total", 0),
            "wins": paper.get("paper_wins", 0),
            "losses": paper.get("paper_losses", 0),
            "filter_correct": paper.get("filter_correct", 0),
            "filter_wrong": paper.get("filter_wrong", 0),
            "top_block_reasons": top_blocks,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/bot/start")
async def start_bot():
    running, pid = _is_bot_running()
    if running:
        return {"ok": False, "message": f"Bot already running (PID {pid})"}
    output = _launchctl_start()
    return {"ok": True, "message": output.strip() or "Bot starting via launchctl..."}


@app.post("/api/bot/stop")
async def stop_bot():
    running, _ = _is_bot_running()
    if not running:
        return {"ok": False, "message": "Bot is not running"}
    output = _launchctl_stop()
    return {"ok": True, "message": output.strip() or "Bot stopped via launchctl."}


# ── WebSocket: real-time logs + scene events ───────────────────


@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()

    initial = _tail_lines(BOT_LOG_FILE, LOG_TAIL_LINES)
    await websocket.send_json({"type": "init", "lines": initial})

    try:
        if not BOT_LOG_FILE.exists():
            BOT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            BOT_LOG_FILE.touch()

        last_size = BOT_LOG_FILE.stat().st_size

        while True:
            await asyncio.sleep(0.5)
            try:
                current_size = BOT_LOG_FILE.stat().st_size
            except FileNotFoundError:
                continue

            if current_size > last_size:
                with open(BOT_LOG_FILE, "rb") as f:
                    f.seek(last_size)
                    new_data = f.read().decode("utf-8", errors="replace")
                last_size = current_size
                lines = [l for l in new_data.split("\n") if l.strip()]
                if lines:
                    events = [e for e in (parse_event(l) for l in lines) if e]
                    await websocket.send_json(
                        {"type": "log", "lines": lines, "events": events}
                    )
            elif current_size < last_size:
                last_size = 0  # log rotated
    except WebSocketDisconnect:
        pass


# ── Serve frontend ─────────────────────────────────────────────


@app.get("/")
async def root():
    return FileResponse(
        Path(__file__).parent / "static" / "index.html",
        media_type="text/html",
    )


static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
