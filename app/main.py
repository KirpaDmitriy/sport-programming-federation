import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.application.service import TalentService
from app.infrastructure.database import Store
from app.infrastructure.seed import seed_store
from app.web.api import router
from app.web.auth import router as auth_router
from app.web.account import router as account_router
from app.web.assessments import router as assessments_router
from app.web.invitations import router as invitations_router


def create_app(database_path: str | Path | None = None) -> FastAPI:
    path = Path(
        database_path
        or os.environ.get("KODRAZRYAD_DATABASE")
        or os.environ.get("KONTUR_DATABASE", "data/kodrazryad.sqlite3")
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        path.parent.mkdir(parents=True, exist_ok=True)
        store = Store(path)
        store.initialize()
        if store.count("skills") == 0:
            seed_store(store)
        app.state.service = TalentService(store)
        yield

    app = FastAPI(
        title="КодРазряд API",
        summary="Подтверждённые компетенции и обратный подбор в ИТ",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(account_router)
    app.include_router(assessments_router)
    app.include_router(invitations_router)
    static_dir = Path(__file__).parent / "web" / "static"
    app.mount("/assets", StaticFiles(directory=static_dir), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(static_dir / "index.html")

    return app


app = create_app()
