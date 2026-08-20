from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared import init_redis_pool, close_redis_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_redis_pool()
    yield
    await close_redis_pool()


app = FastAPI(title="Catalog Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "catalog"}


from app.routers import series, chapters  # noqa: E402

app.include_router(series.router, prefix="/api/catalog")
app.include_router(chapters.router, prefix="/api/catalog")
