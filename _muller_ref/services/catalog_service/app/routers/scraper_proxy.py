"""
Scraper proxy router — wires the catalog service to the scraper microservice.

These endpoints let the frontend query scraped series data (from MongoDB via the
scraper service) and trigger syncs into the Postgres catalog — all through the
single gateway, so the frontend never talks to the scraper service directly.

The catalog service acts as the single backend the frontend knows about, and it
delegates scraper-related operations to the scraper_service over HTTP.
"""

import os

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response

router = APIRouter(prefix="/scraper", tags=["scraper"])

SCRAPER_SERVICE_URL = os.getenv("SCRAPER_SERVICE_URL", "http://scraper_service:5000")

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=120.0)
    return _client


async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _proxy(method: str, path: str, **kwargs):
    """Forward a request to the scraper service and return the JSON response."""
    url = f"{SCRAPER_SERVICE_URL}{path}"
    try:
        resp = await get_client().request(method, url, **kwargs)
    except httpx.RequestError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Scraper service unreachable: {exc}",
        )
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(resp.status_code, detail)
    return resp


@router.get("/parent")
async def list_parents(request: Request):
    """List scraped parent series (from MongoDB)."""
    params = dict(request.query_params)
    resp = await _proxy("GET", "/api/scraper/parent", params=params)
    return resp.json()


@router.post("/parent/scrape")
async def scrape_parent(request: Request):
    """Scrape series metadata from a source URL."""
    body = await request.json()
    resp = await _proxy("POST", "/api/scraper/parent/scrape", json=body)
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type="application/json",
    )


@router.get("/parent/{parent_id}")
async def get_parent(parent_id: str):
    """Get a single parent and its children."""
    resp = await _proxy("GET", f"/api/scraper/parent/{parent_id}")
    return resp.json()


@router.get("/parent/{parent_id}/chapter-list")
async def get_chapter_list(parent_id: str):
    """Get available chapters from the source page."""
    resp = await _proxy("GET", f"/api/scraper/parent/{parent_id}/chapter-list")
    return resp.json()


@router.post("/parent/{parent_id}/download-cover")
async def download_cover(parent_id: str):
    """Download and store the cover image for a parent."""
    resp = await _proxy("POST", f"/api/scraper/parent/{parent_id}/download-cover")
    return resp.json()


@router.delete("/parent/{parent_id}")
async def delete_parent(parent_id: str):
    """Delete a parent and all its children."""
    resp = await _proxy("DELETE", f"/api/scraper/parent/{parent_id}")
    return resp.json()


@router.post("/child/scrape")
async def scrape_child(request: Request):
    """Scrape chapter images from a source URL and store in MinIO."""
    body = await request.json()
    resp = await _proxy("POST", "/api/scraper/child/scrape", json=body)
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type="application/json",
    )


@router.get("/child/parent/{parent_id}")
async def list_children(parent_id: str):
    """List all children (chapters) for a parent."""
    resp = await _proxy("GET", f"/api/scraper/child/parent/{parent_id}")
    return resp.json()


@router.get("/child/{child_id}")
async def get_child(child_id: str):
    """Get a single child with full page data."""
    resp = await _proxy("GET", f"/api/scraper/child/{child_id}")
    return resp.json()


@router.get("/child/{child_id}/page/{page_number}")
async def get_child_page(child_id: str, page_number: int):
    """Stream a page image from MinIO via the scraper service."""
    resp = await _proxy(
        "GET",
        f"/api/scraper/child/{child_id}/page/{page_number}",
    )
    return Response(
        content=resp.content,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.delete("/child/{child_id}")
async def delete_child(child_id: str):
    """Delete a child and its MinIO objects."""
    resp = await _proxy("DELETE", f"/api/scraper/child/{child_id}")
    return resp.json()


@router.post("/sync/parent/{parent_id}")
async def sync_parent(parent_id: str):
    """Sync a scraped parent series into the Postgres catalog."""
    resp = await _proxy("POST", f"/api/scraper/sync/parent/{parent_id}")
    return resp.json()


@router.post("/sync/child/{child_id}")
async def sync_child(child_id: str):
    """Sync a scraped child chapter into the Postgres catalog."""
    resp = await _proxy("POST", f"/api/scraper/sync/child/{child_id}")
    return resp.json()


@router.post("/sync/parent/{parent_id}/all")
async def sync_all(parent_id: str):
    """Sync a parent and all its children to the catalog."""
    resp = await _proxy("POST", f"/api/scraper/sync/parent/{parent_id}/all")
    return resp.json()
