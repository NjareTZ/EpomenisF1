"""
fetch_race_data.py - Run locally to download race data and save as JSON
Usage: python fetch_race_data.py
       python fetch_race_data.py --year 2025 --race "Monaco Grand Prix"
"""
import fastf1
import pandas as pd
import numpy as np
import json, os, argparse
from datetime import datetime
from services.replay import build_replay
from services.timeline import build_timeline

CACHE_DIR   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
OUTPUT_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "latest_race.json")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

def convert(obj):
    if isinstance(obj, dict):   return {str(k): convert(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [convert(i) for i in obj]
    if isinstance(obj, np.integer):  return int(obj)
    if isinstance(obj, np.floating): return float(obj)
    if isinstance(obj, np.bool_):    return bool(obj)
    try:
        if pd.isna(obj): return None
    except Exception: pass
    return obj

def find_session(year=None, race_name=None):
    if year and race_name:
        print(f"Loading: {race_name} {year}")
        s = fastf1.get_session(year, race_name, "R")
        s.load(telemetry=True, weather=False, messages=False, laps=True)
        return s, race_name, year
    for y in [datetime.now().year, datetime.now().year-1, datetime.now().year-2]:
        try:
            schedule  = fastf1.get_event_schedule(y)
            completed = schedule[pd.to_datetime(schedule["EventDate"]) < pd.Timestamp.now()]
            if completed.empty: continue
            for i in range(len(completed)-1, -1, -1):
                row  = completed.iloc[i]
                name = str(row["EventName"])
                try:
                    print(f"Trying {name} {y}...")
                    s = fastf1.get_session(y, name, "R")
                    s.load(telemetry=True, weather=False, messages=False, laps=True)
                    if len(s.drivers) > 0 and len(s.laps) > 0:
                        print(f"Found: {name} {y}")
                        return s, name, y
                except Exception as e:
                    print(f"  Skip: {e}")
        except Exception as e:
            print(f"Year {y}: {e}")
    return None, None, None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--race", type=str, default=None)
    args = parser.parse_args()
    session, event_name, year = find_session(args.year, args.race)
    if session is None:
        print("No valid session found"); return
    try:
        schedule  = fastf1.get_event_schedule(year)
        row       = schedule[schedule["EventName"] == event_name].iloc[0]
        round_num = int(row.get("RoundNumber", 0))
    except Exception:
        round_num = 0
    print("Building replay...")
    replay = build_replay(session)
    try:
        timeline = build_timeline(session)
    except Exception:
        timeline = []
    data = {
        "race":         f"{event_name} {year}",
        "circuit_name": event_name,
        "circuit_info": f"{year} . Round {round_num}",
        "year":         int(year),
        "generated_at": datetime.utcnow().isoformat(),
        **convert(replay),
        "timeline": convert(timeline),
    }
    with open(OUTPUT_FILE, "w") as f:
        json.dump(data, f)
    size_mb = os.path.getsize(OUTPUT_FILE)/1024/1024
    print(f"Saved to {OUTPUT_FILE} ({size_mb:.1f} MB)")
    print(f"Race: {data['race']}, Frames: {len(data.get('frames',[]))}")

if __name__ == "__main__":
    main()
