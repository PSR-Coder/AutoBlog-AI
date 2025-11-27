import asyncio
from app.scraper.playwright_scraper import fetch_with_playwright

async def run_campaign_worker():
    yield "[INFO] Starting worker..."

    try:
        html = await fetch_with_playwright(
            "https://example.com",
            retries=3,
            proxies=[
                "http://proxy1.com",
                "http://proxy2.com"
            ]
        )
        yield "[SUCCESS] Fetched page"

    except Exception as e:
        yield f"[ERROR] {str(e)}"

    yield "[INFO] Worker complete"
