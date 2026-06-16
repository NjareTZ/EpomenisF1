from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

import fastf1
import pandas as pd
import numpy as np
import os
import traceback
import asyncio
import threading
from datetime import datetime, timedelta

from services.replay import build_replay
from services.timeline import build_timeline
from services.live import build_live

app = FastAPI(title="Epomenis F1 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)
print(f"Cache directory: {CACHE_DIR}")

# ── In-memory cache ───────────────────────────────────────────────────────────
_cache = {
    "data":      None,
    "loaded_at": None,
    "loading":   False,
    "error":     None,
}
_CACHE_TTL = timedelta(hours=6)


def convert_numpy(obj):
    if isinstance(obj, dict):
        return {str(k): convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(item) for item in obj]
    elif isinstance(obj, tuple):
        return [convert_numpy(item) for item in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    else:
        try:
            if pd.isna(obj):
                return None
        except Exception:
            pass
    return obj


def find_and_build_replay():
    """Run in a background thread — finds latest race and builds replay data."""
    if _cache["loading"]:
        return
    _cache["loading"] = True
    _cache["error"]   = None

    try:
        for year in [2025, 2024, 2023]:
            try:
                schedule  = fastf1.get_event_schedule(year)
                completed = schedule[
                    pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
                ]
                if completed.empty:
                    continue

                for i in range(len(completed) - 1, -1, -1):
                    row        = completed.iloc[i]
                    event_name = str(row["EventName"])
                    try:
                        print(f"Trying {event_name} {year}...")
                        session = fastf1.get_session(year, event_name, "R")
                        session.load(
                            telemetry=True,
                            weather=False,
                            messages=False,
                            laps=True,
                        )
                        if len(session.drivers) > 0 and len(session.laps) > 0:
                            print(f"✓ Valid: {event_name} {year}")

                            replay = build_replay(session)
                            try:
                                timeline = build_timeline(session)
                            except Exception:
                                timeline = []

                            round_num = int(row.get("RoundNumber", 0))
                            response  = {
                                "race":         f"{event_name} {year}",
                                "circuit_name": event_name,
                                "circuit_info": f"{year} · Round {round_num}",
                                "year":         int(year),
                                **convert_numpy(replay),
                                "timeline":     convert_numpy(timeline),
                            }

                            _cache["data"]      = jsonable_encoder(response)
                            _cache["loaded_at"] = datetime.utcnow()
                            _cache["loading"]   = False
                            print(f"✓ Cache ready. Frames: {len(replay.get('frames',[]))}")
                            return

                    except Exception as e:
                        print(f"✗ {event_name} {year}: {e}")
                        continue
            except Exception as e:
                print(f"✗ Year {year}: {e}")
                continue

        _cache["error"]   = "No race data found"
        _cache["loading"] = False

    except Exception as e:
        print("Background load error:", traceback.format_exc())
        _cache["error"]   = str(e)
        _cache["loading"] = False


def start_background_load():
    t = threading.Thread(target=find_and_build_replay, daemon=True)
    t.start()


# ── Startup — begin loading in background immediately ─────────────────────────
@app.on_event("startup")
async def startup_event():
    print("Starting background data load...")
    start_background_load()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {
        "status":     "healthy",
        "cache_dir":  CACHE_DIR,
        "data_ready": _cache["data"] is not None,
        "loading":    _cache["loading"],
        "error":      _cache["error"],
        "loaded_at":  str(_cache["loaded_at"]) if _cache["loaded_at"] else None,
    }


@app.get("/replay/latest")
async def replay_latest():
    try:
        # If data is ready return it immediately
        if _cache["data"] is not None:
            now = datetime.utcnow()
            if (
                _cache["loaded_at"] and
                now - _cache["loaded_at"] < _CACHE_TTL
            ):
                return _cache["data"]
            else:
                # Cache stale — refresh in background, return stale data for now
                start_background_load()
                return _cache["data"]

        # Still loading — return status so frontend can poll
        if _cache["loading"]:
            return JSONResponse(
                status_code=202,
                content={
                    "status":  "loading",
                    "message": "Race data is being prepared, please wait...",
                }
            )

        # Error state
        if _cache["error"]:
            # Try again
            start_background_load()
            return JSONResponse(
                status_code=202,
                content={
                    "status":  "loading",
                    "message": f"Retrying after error: {_cache['error']}",
                }
            )

        # Not started yet
        start_background_load()
        return JSONResponse(
            status_code=202,
            content={
                "status":  "loading",
                "message": "Starting data load...",
            }
        )

    except Exception as e:
        print("Replay error:", traceback.format_exc())
        return {"error": str(e)}


@app.get("/replay/status")
async def replay_status():
    return {
        "data_ready": _cache["data"] is not None,
        "loading":    _cache["loading"],
        "error":      _cache["error"],
        "loaded_at":  str(_cache["loaded_at"]) if _cache["loaded_at"] else None,
    }


@app.get("/replay/refresh")
async def replay_refresh():
    _cache["data"]      = None
    _cache["loaded_at"] = None
    start_background_load()
    return {"status": "refreshing in background"}


@app.get("/replay/sessions")
async def replay_sessions():
    try:
        year      = datetime.now().year
        schedule  = fastf1.get_event_schedule(year)
        completed = schedule[
            pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
        ]
        sessions = []
        for _, row in completed.iterrows():
            sessions.append({
                "name":  str(row["EventName"]),
                "date":  str(row["EventDate"]),
                "round": int(row.get("RoundNumber", 0)),
            })
        return {"sessions": sessions, "year": int(year)}
    except Exception as e:
        return {"error": str(e)}


@app.get("/live")
async def live():
    try:
        data = await build_live()
        return jsonable_encoder(convert_numpy(data))
    except Exception as e:
        print("Live error:", traceback.format_exc())
        return {"error": str(e)}