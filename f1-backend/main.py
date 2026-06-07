from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder

import fastf1
import pandas as pd
import numpy as np
import os

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

# Use absolute path so it works both locally and on Render
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)


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

        print(f"Fetching schedule for {year}...")
        schedule = fastf1.get_event_schedule(year)

        completed = schedule[
            pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
        ]

        if completed.empty:
            # Try previous year if no completed races yet
            year -= 1
            schedule = fastf1.get_event_schedule(year)
            completed = schedule[
                pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
            ]

        if completed.empty:
            return {"error": "No completed races found"}

        latest = completed.iloc[-1]
        event_name = str(latest["EventName"])

        print(f"Loading session: {event_name} {year}")

        session = fastf1.get_session(year, event_name, "R")
        session.load()

        replay = build_replay(session)
        timeline = build_timeline(session)

        response = {
            "race": event_name,
            "circuit_name": event_name,
            "circuit_info": f"{year} · Round {int(latest.get('RoundNumber', 0))}",
            "year": int(year),
            **convert_numpy(replay),
            "timeline": convert_numpy(timeline),
        }

        return jsonable_encoder(response)

    except Exception as e:
        import traceback
        print("Replay error:", traceback.format_exc())
        return {"error": str(e)}


@app.get("/replay/sessions")
async def replay_sessions():
    try:
        year = datetime.now().year
        schedule = fastf1.get_event_schedule(year)

        completed = schedule[
            pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
        ]

        sessions = []
        for _, row in completed.iterrows():
            sessions.append({
                "name": str(row["EventName"]),
                "date": str(row["EventDate"]),
                "round": int(row.get("RoundNumber", 0)),
            })

        return {"sessions": sessions, "year": int(year)}

    except Exception as e:
        return {"error": str(e)}