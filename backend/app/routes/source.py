from fastapi import APIRouter
from app.scraper.sitemap import discover_latest_from_sitemap
from app.scraper.rss import discover_from_rss
from app.scraper.html_scraper import discover_from_html

router = APIRouter()

@router.post("/test-source")
async def test_source(payload: dict):

    url = payload["url"]

    # Try Sitemap
    result = await discover_latest_from_sitemap(url)
    if result:
        return {"method": "sitemap", **result}

    # Try RSS
    result = await discover_from_rss(url)
    if result:
        return {"method": "rss", **result}

    # Fallback HTML
    result = await discover_from_html(url)
    if result:
        return {"method": "html", **result}

    return {"error": "Failed to detect article"}
