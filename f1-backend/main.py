from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder

import fastf1
import pandas as pd
import numpy as np
import os
import traceback

from datetime import datetime

from services.replay import build_replay
from services.timeline import build_timeline

app = FastAPI(title="Epomenis F1 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Absolute cache path — works locally and on Render
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

print(f"Cache directory: {CACHE_DIR}")


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


def get_latest_completed(year):
    schedule = fastf1.get_event_schedule(year)
    completed = schedule[
        pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
    ]
    return completed


@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy", "cache_dir": CACHE_DIR}


@app.get("/replay/latest")
async def replay_latest():
    try:
        year = datetime.now().year
        completed = get_latest_completed(year)

        # Fall back to previous year if nothing completed yet
        if completed.empty:
            year -= 1
            completed = get_latest_completed(year)

        if completed.empty:
            return {"error": "No completed races found"}

        latest     = completed.iloc[-1]
        event_name = str(latest["EventName"])
        round_num  = int(latest.get("RoundNumber", 0))

        print(f"Loading: {event_name} {year}")

        session = fastf1.get_session(year, event_name, "R")

        # Load with telemetry + position data explicitly
        session.load(
            telemetry=True,
            weather=False,
            messages=False,
            laps=True,
        )

        print("Session loaded. Building replay...")

        replay   = build_replay(session)
        timeline = build_timeline(session)

        response = {
            "race":         event_name,
            "circuit_name": event_name,
            "circuit_info": f"{year} · Round {round_num}",
            "year":         int(year),
            **convert_numpy(replay),
            "timeline":     convert_numpy(timeline),
        }

        print(f"Done. Frames: {len(replay.get('frames', []))}, Track pts: {len(replay.get('track', []))}")

        return jsonable_encoder(response)

    except Exception as e:
        print("Replay error:", traceback.format_exc())
        return {"error": str(e)}


@app.get("/replay/sessions")
async def replay_sessions():
    try:
        year     = datetime.now().year
        schedule = fastf1.get_event_schedule(year)

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