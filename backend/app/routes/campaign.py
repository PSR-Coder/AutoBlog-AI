from fastapi import APIRouter, WebSocket
from app.worker.worker import run_campaign_worker

router = APIRouter()

@router.websocket("/run-campaign")
async def run_campaign_socket(ws: WebSocket):
    await ws.accept()

    async for log in run_campaign_worker():
        await ws.send_text(log)

    await ws.close()
