from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared import init_redis_pool, close_redis_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_redis_pool()
    yield
    await close_redis_pool()


app = FastAPI(title="Reader Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "reader"}


from app.routers import reader, tokens  # noqa: E402

app.include_router(reader.router, prefix="/api/reader")
app.include_router(tokens.router, prefix="/api/token")
