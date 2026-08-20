from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared import init_redis_pool, close_redis_pool
from app.routers.scraper_proxy import close_client as close_scraper_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_redis_pool()
    yield
    await close_redis_pool()
    await close_scraper_client()


app = FastAPI(title="Catalog Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "catalog"}


from app.routers import series, chapters, scraper_proxy  # noqa: E402

app.include_router(series.router, prefix="/api/catalog")
app.include_router(chapters.router, prefix="/api/catalog")
app.include_router(scraper_proxy.router, prefix="/api/catalog")
