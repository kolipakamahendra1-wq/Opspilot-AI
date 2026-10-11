#!/bin/sh
set -e

# If the local LLM is not reachable, fall back to the deterministic agent and offline
# embeddings so the stack still works end to end on any machine.
if [ "${LLM_PROVIDER:-ollama}" = "ollama" ] || [ "${EMBED_PROVIDER:-ollama}" = "ollama" ]; then
  if ! python -c "import httpx,os,sys; httpx.get(os.environ.get('OLLAMA_URL','http://127.0.0.1:11434')+'/api/tags', timeout=3).raise_for_status()" 2>/dev/null; then
    echo "[opspilot] Ollama not reachable at ${OLLAMA_URL}; using LLM_PROVIDER=rules and EMBED_PROVIDER=hash"
    export LLM_PROVIDER=rules EMBED_PROVIDER=hash
  fi
fi

python -m backend.database.seed
exec uvicorn backend.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
