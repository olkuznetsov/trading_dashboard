"""
Dashboard configuration — paths to the crypto_trader bot.
"""

from pathlib import Path

# ── Bot reference ──────────────────────────────────────────────
BOT_DIR = Path(__file__).resolve().parent.parent / "crypto_trader"

# ── launchctl (macOS service) ─────────────────────────────────
LAUNCHCTL_LABEL = "com.cryptobot.trader"
LAUNCHCTL_PLIST = Path.home() / "Library" / "LaunchAgents" / "com.cryptobot.trader.plist"
BOT_LOG_FILE = BOT_DIR / "logs" / "bot.log"
BOT_TRADES_FILE = BOT_DIR / "logs" / "trades.json"
BOT_OPEN_TRADES_FILE = BOT_DIR / "logs" / "open_trades.json"
BOT_CLOSED_TRADES_FILE = BOT_DIR / "logs" / "closed_trades.jsonl"
BOT_AI_PREDICTIONS_FILE = BOT_DIR / "logs" / "ai_predictions.jsonl"
BOT_AI_LEARNINGS_FILE = BOT_DIR / "logs" / "ai_learnings.json"
BOT_AI_CONFIG_FILE = BOT_DIR / "logs" / "ai_config.json"
BOT_SHADOW_WISDOM_FILE = BOT_DIR / "logs" / "shadow_wisdom.json"
BOT_SHADOW_PENDING_FILE = BOT_DIR / "logs" / "shadow_pending.json"
BOT_PAPER_STATS_FILE = BOT_DIR / "logs" / "paper_stats.json"
BOT_STRATEGY_FILE = BOT_DIR / "logs" / "strategy_adjustments.json"

# ── Dashboard settings ─────────────────────────────────────────
DASHBOARD_HOST = "0.0.0.0"
DASHBOARD_PORT = 8501
LOG_TAIL_LINES = 200  # how many lines to send on initial WS connect
