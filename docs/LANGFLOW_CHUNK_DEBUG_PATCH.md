# Langflow AIMessageChunk Debug Patch

Use this to patch the Langflow container in place and print the full `AIMessageChunk` structure during agent streaming.

## Patch command

```bash
docker exec -i langflow python - <<'PY'
from pathlib import Path

path = Path("/app/.venv/lib/python3.12/site-packages/lfx/base/agents/events.py")
text = path.read_text()

needle = """    elif isinstance(data_chunk, AIMessageChunk):
        output_text = _extract_output_text(data_chunk.content)
"""

insert = """    elif isinstance(data_chunk, AIMessageChunk):
        try:
            print(
                "AIMessageChunk debug:",
                {
                    "content": getattr(data_chunk, "content", None),
                    "additional_kwargs": getattr(data_chunk, "additional_kwargs", None),
                    "response_metadata": getattr(data_chunk, "response_metadata", None),
                    "tool_call_chunks": getattr(data_chunk, "tool_call_chunks", None),
                    "chunk_dump": data_chunk.model_dump() if hasattr(data_chunk, "model_dump") else str(data_chunk),
                },
                flush=True,
            )
        except Exception as e:
            print(f"AIMessageChunk debug failed: {e}", flush=True)

        output_text = _extract_output_text(data_chunk.content)
"""

if needle not in text:
    raise SystemExit("Needle not found; file may differ from expected.")

path.write_text(text.replace(needle, insert, 1))
print("Patched", path)
PY
```

## Restart container

```bash
docker restart langflow
```

## Optional verify patch landed

```bash
docker exec -it langflow sh -lc "sed -n '300,340p' /app/.venv/lib/python3.12/site-packages/lfx/base/agents/events.py"
```

## Read logs after one test message

```bash
docker logs --tail 200 langflow
```

Or filter just the debug lines:

```bash
docker logs langflow 2>&1 | grep "AIMessageChunk debug"
```

