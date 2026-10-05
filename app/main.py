import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.application.service import TalentService
from app.infrastructure.database import Store
from app.infrastructure.seed import seed_store
from app.web.api import router


def create_app(database_path: str | Path | None = None) -> FastAPI:
    path = Path(database_path or os.environ.get("KONTUR_DATABASE", "data/kontur.sqlite3"))

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
        title="Контур API",
        summary="Подтверждённые компетенции и обратный подбор в ИТ",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(router)
    return app


app = create_app()
