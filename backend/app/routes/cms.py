import httpx
from fastapi import APIRouter

router = APIRouter()

@router.post("/verify-connection")
async def verify_connection(payload: dict):

    base_url = payload["url"]
    user = payload["username"]
    app_password = payload["password"]

    auth = (user, app_password)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base_url}/wp-json/wp/v2/categories", auth=auth)

        if r.status_code == 200:
            return {"success": True, "categories": r.json()}

        return {"success": False, "message": r.text}

    except Exception as e:
        return {"success": False, "message": str(e)}
