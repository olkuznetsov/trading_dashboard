#!/bin/bash
# ── Trading Dashboard launcher ──
DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$DIR/venv"

if [ ! -d "$VENV" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q -r "$DIR/requirements.txt"
fi

echo "Starting Trading Dashboard on http://localhost:8501"
"$VENV/bin/uvicorn" server:app --host 0.0.0.0 --port 8501 --reload --app-dir "$DIR"
