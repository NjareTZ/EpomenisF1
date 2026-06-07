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


def find_latest_race():
    """
    Walk backwards from current year to find the most recent
    race that actually has data available on FastF1.
    """
    for year in [2025, 2024, 2023]:
        try:
            schedule = fastf1.get_event_schedule(year)
            completed = schedule[
                pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()
            ]
            if completed.empty:
                continue

            # Try from most recent going backwards
            for i in range(len(completed) - 1, -1, -1):
                row = completed.iloc[i]
                event_name = str(row["EventName"])
                try:
                    session = fastf1.get_session(year, event_name, "R")
                    session.load(
                        telemetry=True,
                        weather=False,
                        messages=False,
                        laps=True,
                    )
                    # Check data actually loaded
                    if len(session.drivers) > 0 and len(session.laps) > 0:
                        print(f"Found valid session: {event_name} {year}")
                        return session, row, year
                    else:
                        print(f"No data for {event_name} {year}, trying earlier race...")
                except Exception as e:
                    print(f"Failed {event_name} {year}: {e}")
                    continue
        except Exception as e:
            print(f"Failed year {year}: {e}")
            continue

    return None, None, None


@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy", "cache_dir": CACHE_DIR}


@app.get("/replay/latest")
async def replay_latest():
    try:
        session, latest_row, year = find_latest_race()

        if session is None:
            return {"error": "No race data available"}

        event_name = str(latest_row["EventName"])
        round_num  = int(latest_row.get("RoundNumber", 0))

        print(f"Building replay for {event_name} {year}...")

        replay = build_replay(session)

        # Build timeline safely
        try:
            timeline = build_timeline(session)
        except Exception as e:
            print(f"Timeline error (non-fatal): {e}")
            timeline = []

        response = {
            "race":         f"{event_name} {year}",
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


# ── Live endpoint (OpenF1) ────────────────────────────────────────────────────

from services.live import build_live

@app.get("/live")
async def live():
    try:
        data = await build_live()
        return jsonable_encoder(convert_numpy(data))
    except Exception as e:
        print("Live error:", traceback.format_exc())
        return {"error": str(e)}