import os


class Settings:
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://comix_user:secure_pass@db:5432/comix_db",
    )
    REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
    SECRET_KEY = os.getenv("SECRET_KEY", "change_me_generate_random_hex_64_chars")
    TOKEN_SECRET = os.getenv("TOKEN_SECRET", "change_me_hmac_secret_for_signed_urls")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
    COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"
    SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "86400"))
    IMAGE_TOKEN_TTL_SECONDS = int(os.getenv("IMAGE_TOKEN_TTL_SECONDS", "300"))
    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
    RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")
    TURNSTILE_SITE_KEY = os.getenv("TURNSTILE_SITE_KEY", "")
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost")
    STORAGE_PATH = os.getenv("STORAGE_PATH", "/data/manga_storage")


settings = Settings()
