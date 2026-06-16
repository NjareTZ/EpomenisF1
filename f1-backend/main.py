from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from typing import List, Optional
import traceback
from datetime import datetime

from services.openf1 import (
    build_replay, build_lap_frames,
    build_live, get_sessions_list
)

app = FastAPI(title="Epomenis F1 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CURRENT_YEAR  = datetime.now().year
PREVIOUS_YEAR = CURRENT_YEAR - 1


class DriverInfo(BaseModel):
    number: int
    short: str
    name: str
    team: str
    color: str


@app.get("/")
async def root():
    return {"status": "ok", "powered_by": "OpenF1"}


@app.get("/health")
async def health():
    return {"status": "healthy", "years": [PREVIOUS_YEAR, CURRENT_YEAR]}


@app.get("/replay/latest")
async def replay_latest():
    try:
        data = await build_replay()
        return jsonable_encoder(data)
    except Exception as e:
        print("Replay error:", traceback.format_exc())
        return {"error": str(e)}


@app.get("/replay/session/{session_key}")
async def replay_session(session_key: int):
    try:
        data = await build_replay(session_key=session_key)
        return jsonable_encoder(data)
    except Exception as e:
        print(f"Replay {session_key} error:", traceback.format_exc())
        return {"error": str(e)}


@app.get("/replay/lap/{session_key}/{lap_number}")
async def replay_lap(session_key: int, lap_number: int, drivers: str = ""):
    """
    Fetch position frames for a specific lap.
    drivers param: JSON string of driver info passed from frontend cache.
    Called per-lap by the frontend animation engine.
    """
    try:
        import json
        driver_list = json.loads(drivers) if drivers else []
        data = await build_lap_frames(session_key, lap_number, driver_list)
        return jsonable_encoder(data)
    except Exception as e:
        print(f"Lap frames error:", traceback.format_exc())
        return {"error": str(e)}


@app.get("/replay/sessions")
async def replay_sessions():
    try:
        sessions = await get_sessions_list([PREVIOUS_YEAR, CURRENT_YEAR])
        return {"sessions": sessions, "total": len(sessions)}
    except Exception as e:
        return {"error": str(e)}


@app.get("/live")
async def live():
    try:
        data = await build_live()
        return jsonable_encoder(data)
    except Exception as e:
        print("Live error:", traceback.format_exc())
        return {"error": str(e)}
