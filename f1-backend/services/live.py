import httpx
import asyncio
from datetime import datetime
from collections import defaultdict

OPENF1 = "https://api.openf1.org/v1"

async def fetch(client, url, params=None):
    try:
        r = await client.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"OpenF1 fetch error {url}: {e}")
        return []


async def build_live():
    async with httpx.AsyncClient() as client:

        # Get all race sessions, sorted by most recent
        sessions = await fetch(client, f"{OPENF1}/sessions", {
            "session_type": "Race",
        })

        if not sessions:
            return {"error": "No race sessions available from OpenF1"}

        sessions.sort(key=lambda x: x.get("date_start", ""), reverse=True)
        session     = sessions[0]
        session_key = session.get("session_key")
        is_live     = is_session_live(session)

        print(f"OpenF1: {session.get('meeting_name')} key={session_key} live={is_live}")

        # Fetch all data in parallel
        drivers_data, position_data, laps_data, pit_data = await asyncio.gather(
            fetch(client, f"{OPENF1}/drivers",  {"session_key": session_key}),
            fetch(client, f"{OPENF1}/position", {"session_key": session_key}),
            fetch(client, f"{OPENF1}/laps",     {"session_key": session_key}),
            fetch(client, f"{OPENF1}/pit",      {"session_key": session_key}),
        )

        # Build driver map
        driver_map = {}
        for d in (drivers_data or []):
            num = d.get("driver_number")
            if num:
                driver_map[num] = {
                    "number": num,
                    "short":  d.get("name_acronym", f"#{num}"),
                    "name":   d.get("full_name", ""),
                    "team":   d.get("team_name", ""),
                    "color":  f"#{d.get('team_colour', 'ffffff')}",
                }

        # Latest position per driver
        latest_positions = {}
        for p in (position_data or []):
            num = p.get("driver_number")
            if num:
                existing = latest_positions.get(num)
                if not existing or p.get("date", "") > existing.get("date", ""):
                    latest_positions[num] = p

        # Build cars list
        cars = []
        for num, pos in latest_positions.items():
            driver = driver_map.get(num, {})
            x = pos.get("x") or 0
            y = pos.get("y") or 0
            if x == 0 and y == 0:
                continue
            cars.append({
                "driver": num,
                "number": num,
                "short":  driver.get("short", f"#{num}"),
                "name":   driver.get("name", ""),
                "team":   driver.get("team", ""),
                "color":  driver.get("color", "#ffffff"),
                "x":      float(x),
                "y":      float(y),
            })

        # Latest lap per driver for leaderboard
        latest_laps = {}
        for lap in (laps_data or []):
            num    = lap.get("driver_number")
            lap_no = lap.get("lap_number", 0)
            if num:
                existing = latest_laps.get(num)
                if not existing or lap_no > existing.get("lap_number", 0):
                    latest_laps[num] = lap

        leaderboard = []
        for num, lap in latest_laps.items():
            driver = driver_map.get(num, {})
            leaderboard.append({
                "driver_number": num,
                "short":         driver.get("short", f"#{num}"),
                "team":          driver.get("team", ""),
                "color":         driver.get("color", "#ffffff"),
                "lap_number":    lap.get("lap_number", 0),
                "lap_duration":  lap.get("lap_duration"),
                "gap_to_leader": None,
            })

        leaderboard.sort(key=lambda x: (
            -(x["lap_number"] or 0),
             (x["lap_duration"] or 999)
        ))
        for i, e in enumerate(leaderboard):
            e["position"] = i + 1

        # Pit stops
        pit_events = []
        for p in (pit_data or []):
            pit_events.append({
                "driver":   p.get("driver_number"),
                "lap":      p.get("lap_number"),
                "duration": p.get("pit_duration"),
            })

        # Track from position data
        track = build_track_from_positions(position_data or [])

        # Current lap
        max_lap = max(
            (l.get("lap_number", 0) for l in laps_data),
            default=0
        ) if laps_data else 0

        return {
            "race":         session.get("meeting_name", ""),
            "circuit_name": session.get("circuit_short_name", session.get("meeting_name", "")),
            "circuit_info": f"{session.get('year', '')}",
            "session_key":  session_key,
            "is_live":      is_live,
            "current_lap":  max_lap,
            "drivers":      list(driver_map.values()),
            "cars":         cars,
            "leaderboard":  leaderboard,
            "pit_events":   pit_events,
            "track":        track,
            "frames":       [],
        }


def build_track_from_positions(position_data):
    if not position_data:
        return []

    by_driver = defaultdict(list)
    for p in position_data:
        num = p.get("driver_number")
        x   = p.get("x")
        y   = p.get("y")
        if num and x is not None and y is not None and (x != 0 or y != 0):
            by_driver[num].append({"x": float(x), "y": float(y)})

    if not by_driver:
        return []

    best = max(by_driver.values(), key=len)
    step = max(1, len(best) // 500)
    return [{"x": p["x"], "y": p["y"]} for p in best[::step]]


def is_session_live(session):
    try:
        now   = datetime.utcnow()
        start = datetime.fromisoformat(
            session.get("date_start", "").replace("Z", "")
        )
        end   = datetime.fromisoformat(
            session.get("date_end", "").replace("Z", "")
        )
        return start <= now <= end
    except Exception:
        return False