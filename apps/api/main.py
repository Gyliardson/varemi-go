"""ASGI entrypoint; feature routes are added on the vertical-slice branch."""

from fastapi import FastAPI

app = FastAPI(title="Varemi Go API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
