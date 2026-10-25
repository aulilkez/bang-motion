from __future__ import annotations

from contextlib import asynccontextmanager
from html import escape
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .core.workflow import ConflictError, ValidationError
from .core.state import store
from .routes import api, web


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init()
    yield


app = FastAPI(title="Bang Motion Studio", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.mount("/studio/static", StaticFiles(directory=Path(__file__).parent / "static"), name="studio-static")
app.include_router(api.router)
app.include_router(web.router)


@app.middleware("http")
async def protect_local_mutations(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        client = request.client.host if request.client else ""
        if client not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            return JSONResponse({"error": "Studio accepts local connections only."}, status_code=403)
        origin = request.headers.get("origin")
        if origin:
            from urllib.parse import urlparse
            parsed = urlparse(origin)
            host = parsed.hostname or ""
            if host not in {"127.0.0.1", "::1", "localhost"} or (parsed.port and parsed.port != (request.url.port or 4179)):
                return JSONResponse({"error": "Cross-origin changes are not allowed."}, status_code=403)
        if request.headers.get("x-studio-request") != "1":
            return JSONResponse({"error": "Missing Studio request header."}, status_code=403)
    return await call_next(request)


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"error": str(exc), "current": exc.current}, status_code=409)
    if request.headers.get("hx-request") == "true":
        return HTMLResponse(f'<div class="alert alert-error" role="alert">{escape(str(exc))}</div>', status_code=200)
    return web.render(request, "error.html", {"request": request, "status": 409, "message": str(exc)}, 409)


@app.exception_handler(ValidationError)
async def validation_handler(request: Request, exc: ValidationError):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"error": str(exc), "issues": exc.issues}, status_code=400)
    if request.headers.get("hx-request") == "true":
        return HTMLResponse(f'<div class="alert alert-error" role="alert">{escape(str(exc))}</div>', status_code=200)
    return web.render(request, "error.html", {"request": request, "status": 400, "message": str(exc)}, 400)


@app.exception_handler(FileNotFoundError)
async def missing_handler(request: Request, _: FileNotFoundError):
    if request.url.path.startswith("/api/") or "/preview/" in request.url.path:
        return JSONResponse({"error": "Not found."}, status_code=404)
    return web.render(request, "error.html", {"request": request, "status": 404, "message": "Project not found."}, 404)
