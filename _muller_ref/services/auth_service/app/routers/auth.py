import uuid
from datetime import datetime

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared import (
    get_db, get_redis, settings, hash_password, verify_password,
    verify_turnstile, get_current_user, require_user, create_session,
    delete_session, User,
)

router = APIRouter(tags=["auth"])

_USERNAME_RE = __import__("re").compile(r"^[a-zA-Z0-9_]{3,50}$")


def _validate_username(value: str) -> str:
    if not _USERNAME_RE.match(value):
        raise ValueError("Username must be 3-50 chars, letters/digits/underscores only.")
    return value


def _validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    return value


class UserRegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    turnstile_token: str = ""

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str) -> str:
        return _validate_username(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _validate_password(v)


class UserLoginRequest(BaseModel):
    username_or_email: str
    password: str
    turnstile_token: str = ""


class UserProfileUpdateRequest(BaseModel):
    username: str | None = None
    email: EmailStr | None = None

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_username(v)
        return v


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    created_at: datetime


def _set_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key="session_id", value=session_id, httponly=True,
        samesite="lax", secure=settings.COOKIE_SECURE,
        max_age=settings.SESSION_TTL_SECONDS, path="/",
    )


def _clear_cookie(response: Response) -> None:
    response.set_cookie(
        key="session_id", value="", httponly=True,
        samesite="lax", secure=settings.COOKIE_SECURE,
        max_age=0, path="/",
    )


async def _get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def _get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()


async def _get_user_by_username_or_email(db: AsyncSession, identifier: str) -> User | None:
    result = await db.execute(
        select(User).where(
            or_(User.username == identifier, User.email == identifier.lower())
        )
    )
    return result.scalar_one_or_none()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserRegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> UserResponse:
    remote_ip = request.client.host if request.client else None
    if not await verify_turnstile(body.turnstile_token, remote_ip):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Turnstile verification failed.")

    if await _get_user_by_username(db, body.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken.")
    if await _get_user_by_email(db, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered.")

    pw_hash = hash_password(body.password)
    user = User(
        username=body.username, email=body.email.lower(),
        password_hash=pw_hash, role="user", is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    session_id = await create_session(redis, str(user.id), user.username, user.role)
    _set_cookie(response, session_id)

    return UserResponse(
        id=str(user.id), username=user.username, email=user.email,
        role=user.role, created_at=user.created_at,
    )


@router.post("/login", response_model=UserResponse)
async def login(
    body: UserLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> UserResponse:
    remote_ip = request.client.host if request.client else None
    if not await verify_turnstile(body.turnstile_token, remote_ip):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Turnstile verification failed.")

    user = await _get_user_by_username_or_email(db, body.username_or_email)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials.")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is deactivated.")

    session_id = await create_session(redis, str(user.id), user.username, user.role)
    _set_cookie(response, session_id)

    return UserResponse(
        id=str(user.id), username=user.username, email=user.email,
        role=user.role, created_at=user.created_at,
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    redis: aioredis.Redis = Depends(get_redis),
) -> dict:
    session_id = request.cookies.get("session_id")
    if session_id:
        await delete_session(redis, session_id)
    _clear_cookie(response)
    return {"message": "Logged out"}


@router.get("/profile", response_model=UserResponse)
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    user = await _get_user_by_id(db, current_user["user_id"])
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    return UserResponse(
        id=str(user.id), username=user.username, email=user.email,
        role=user.role, created_at=user.created_at,
    )


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: UserProfileUpdateRequest,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    user_id = current_user["user_id"]
    user = await _get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    if body.username is not None:
        existing = await _get_user_by_username(db, body.username)
        if existing and str(existing.id) != user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken.")
        user.username = body.username

    if body.email is not None:
        existing = await _get_user_by_email(db, body.email)
        if existing and str(existing.id) != user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered.")
        user.email = body.email.lower()

    await db.flush()
    await db.refresh(user)

    return UserResponse(
        id=str(user.id), username=user.username, email=user.email,
        role=user.role, created_at=user.created_at,
    )
