import re
import httpx
from bs4 import BeautifulSoup

POST_PATTERN = re.compile(r"(post|article|news)(-sitemap)?(\d*)\.xml$")

async def fetch(url):
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        if r.status_code == 200:
            return r.text
    return None

async def discover_latest_from_sitemap(url):
    # Step 1 — detect sitemap_index.xml
    txt = await fetch(url)
    if not txt:
        return None

    soup = BeautifulSoup(txt, "xml")
    sitemap_tags = soup.find_all("loc")

    candidates = []

    for tag in sitemap_tags:
        loc = tag.text.strip()

        m = POST_PATTERN.search(loc)
        if m:
            num = int(m.group(3) or 1)
            candidates.append((num, loc))

    if not candidates:
        return None

    # Step 2 — choose highest number
    candidates.sort(reverse=True)
    latest_url = candidates[0][1]

    # Step 3 — fetch the latest sitemap
    sitemap_xml = await fetch(latest_url)

    soup2 = BeautifulSoup(sitemap_xml, "xml")
    urls = soup2.find_all("loc")
    if not urls:
        return None

    latest_post_url = urls[-1].text.strip()

    return {
        "url": latest_post_url,
        "source": latest_url,
        "title": latest_post_url.split("/")[-1].replace("-", " ").title(),
    }
