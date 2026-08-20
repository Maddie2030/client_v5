from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared import init_redis_pool, close_redis_pool

from app.middleware.hmac_auth import HMACValidationMiddleware
from app.middleware.hotlink_protection import HotlinkProtectionMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_redis_pool()
    yield
    await close_redis_pool()


app = FastAPI(title="Image Service", lifespan=lifespan)
app.add_middleware(HotlinkProtectionMiddleware)
app.add_middleware(HMACValidationMiddleware)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "image"}


from app.routers import images, upload  # noqa: E402

app.include_router(images.router)
app.include_router(upload.router, prefix="/api/upload")
