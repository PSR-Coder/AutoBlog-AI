# main.py
import uuid
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any

from app.async_worker import run_campaign_async
from app.ws_manager import ws_manager

app = FastAPI(title="AutoBlog AI Backend (Async Worker + WS)")

# CORS for local dev - adjust for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunCampaignRequest(BaseModel):
    campaign: Dict[str, Any]

# in-memory mapping of run_id -> task (optional)
RUN_TASKS: Dict[str, asyncio.Task] = {}

@app.post("/run-campaign-async")
async def run_campaign_async_endpoint(req: RunCampaignRequest):
    """
    Start an async campaign run. Returns run_id immediately.
    Client should connect to /ws/logs/{run_id} to receive logs.
    """
    run_id = str(uuid.uuid4())
    cfg = req.campaign
    # spawn background task
    task = asyncio.create_task(_background_run(cfg, run_id))
    RUN_TASKS[run_id] = task
    return {"success": True, "run_id": run_id}

async def _background_run(cfg, run_id):
    # Execute and ignore result here (logs are pushed to ws_manager)
    try:
        await run_campaign_async(cfg, run_id=run_id)
    except Exception as e:
        await ws_manager.send(run_id, {"ts": int(__import__("time").time()), "level":"ERROR", "text": f"Background run error: {e}"})
    finally:
        # Optionally signal completion
        await ws_manager.send(run_id, {"ts": int(__import__("time").time()), "level":"INFO", "text": "Run finished"})
        # cleanup: remove from RUN_TASKS
        RUN_TASKS.pop(run_id, None)

@app.websocket("/ws/logs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str):
    """
    WebSocket clients connect to this URL to receive live logs for a specific run_id.
    """
    await ws_manager.connect(run_id, websocket)
    try:
        while True:
            # Keep connection alive; echo pings if needed
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(run_id, websocket)
    except Exception:
        await ws_manager.disconnect(run_id, websocket)
