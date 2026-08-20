from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared import init_redis_pool, close_redis_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_redis_pool()
    yield
    await close_redis_pool()


app = FastAPI(title="Social Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "social"}


from app.routers import comments, social, notifications  # noqa: E402

app.include_router(social.router, prefix="/api/social")
app.include_router(notifications.router, prefix="/api/notifications")
app.include_router(comments.router, prefix="/api/social")
