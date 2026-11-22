#!/usr/bin/env bash
set -e

# Startup script for Dual-Mode AI Facility Layout Platform

echo "=========================================================="
echo " Starting AI Facility Layout Planning & Optimization System"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Activate Python virtual environment & start FastAPI backend
export PYTHONPATH=.
echo "-> Starting FastAPI Backend on http://localhost:8000..."
.venv/bin/uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 2. Start Vite Frontend
echo "-> Starting React Frontend on http://localhost:5173..."
cd frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT

echo "Both services running:"
echo "Backend:  http://localhost:8000 (API Docs: http://localhost:8000/docs)"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to terminate."

wait
