import httpx
import asyncio
from datetime import datetime

OPENF1 = "https://api.openf1.org/v1"

async def fetch(client, url, params=None):
    try:
        r = await client.get(url, params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"OpenF1 fetch error {url}: {e}")
        return []


async def get_live_session_key():
    """Get the current or most recent session key."""
    async with httpx.AsyncClient() as client:
        data = await fetch(client, f"{OPENF1}/sessions", {
            "session_type": "Race",
        })
        if not data:
            return None, None
        # Sort by date descending, return latest
        data.sort(key=lambda x: x.get("date_start", ""), reverse=True)
        latest = data[0]
        return latest.get("session_key"), latest


async def build_live():
    """
    Fetch live/latest race data from OpenF1 API.
    Returns positions, drivers, lap info, pit stops.
    """
    async with httpx.AsyncClient() as client:

        # ── Get latest session ──────────────────────
        sessions = await fetch(client, f"{OPENF1}/sessions", {
            "session_type": "Race",
        })

        if not sessions:
            return {"error": "No sessions found"}

        sessions.sort(key=lambda x: x.get("date_start", ""), reverse=True)
        session     = sessions[0]
        session_key = session.get("session_key")
        is_live     = is_session_live(session)

        print(f"OpenF1 session: {session.get('meeting_name')} key={session_key} live={is_live}")

        # ── Fetch all data in parallel ───────────────
        drivers_data, position_data, laps_data, pit_data, car_data = await asyncio.gather(
            fetch(client, f"{OPENF1}/drivers",   {"session_key": session_key}),
            fetch(client, f"{OPENF1}/position",  {"session_key": session_key}),
            fetch(client, f"{OPENF1}/laps",      {"session_key": session_key}),
            fetch(client, f"{OPENF1}/pit",       {"session_key": session_key}),
            fetch(client, f"{OPENF1}/car_data",  {"session_key": session_key}),
        )

        # ── Build driver map ─────────────────────────
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

        # ── Latest position per driver ───────────────
        latest_positions = {}
        for p in (position_data or []):
            num = p.get("driver_number")
            if num:
                existing = latest_positions.get(num)
                if not existing or p.get("date", "") > existing.get("date", ""):
                    latest_positions[num] = p

        # ── Build cars list ──────────────────────────
        cars = []
        for num, pos in latest_positions.items():
            driver = driver_map.get(num, {})
            cars.append({
                "driver": num,
                "number": num,
                "short":  driver.get("short", f"#{num}"),
                "name":   driver.get("name", ""),
                "team":   driver.get("team", ""),
                "color":  driver.get("color", "#ffffff"),
                "x":      pos.get("x", 0),
                "y":      pos.get("y", 0),
                "z":      pos.get("z", 0),
            })

        # ── Leaderboard from latest laps ─────────────
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
                "position":      lap.get("lap_number", 0),  # will re-sort
                "short":         driver.get("short", f"#{num}"),
                "team":          driver.get("team", ""),
                "color":         driver.get("color", "#ffffff"),
                "lap_number":    lap.get("lap_number", 0),
                "lap_duration":  lap.get("lap_duration"),
                "gap_to_leader": None,
            })

        # Sort leaderboard by lap number desc then lap_duration asc
        leaderboard.sort(key=lambda x: (
            -(x["lap_number"] or 0),
             (x["lap_duration"] or 999)
        ))
        for i, entry in enumerate(leaderboard):
            entry["position"] = i + 1

        # ── Pit stops ────────────────────────────────
        pit_events = []
        for p in (pit_data or []):
            pit_events.append({
                "driver": p.get("driver_number"),
                "lap":    p.get("lap_number"),
                "duration": p.get("pit_duration"),
            })

        # ── Track coordinates ─────────────────────────
        # OpenF1 position data contains x/y/z — use all unique points
        # from all drivers to form the track outline
        track = build_track_from_positions(position_data or [])

        # ── Current lap info ─────────────────────────
        max_lap = max((l.get("lap_number", 0) for l in laps_data), default=0) if laps_data else 0

        return {
            "race":         session.get("meeting_name", ""),
            "circuit_name": session.get("circuit_short_name", session.get("meeting_name", "")),
            "circuit_info": f"{session.get('year', '')} · Round {session.get('meeting_key', '')}",
            "session_key":  session_key,
            "is_live":      is_live,
            "current_lap":  max_lap,
            "drivers":      list(driver_map.values()),
            "cars":         cars,
            "leaderboard":  leaderboard,
            "pit_events":   pit_events,
            "track":        track,
            "frames":       [],   # live mode doesn't use frames
        }


def build_track_from_positions(position_data):
    """
    Build a track outline by sampling position data points.
    Takes one point every N entries to avoid sending millions of coords.
    """
    if not position_data:
        return []

    # Group by driver, take the driver with most data points
    from collections import defaultdict
    by_driver = defaultdict(list)
    for p in position_data:
        num = p.get("driver_number")
        if num and p.get("x") is not None and p.get("y") is not None:
            by_driver[num].append({"x": p["x"], "y": p["y"]})

    if not by_driver:
        return []

    # Pick driver with most points
    best = max(by_driver.values(), key=len)

    # Sample every 10th point to keep response size reasonable
    step = max(1, len(best) // 500)
    return [{"x": p["x"], "y": p["y"]} for p in best[::step]]


def is_session_live(session):
    """Check if the session is currently live."""
    try:
        now   = datetime.utcnow()
        start = datetime.fromisoformat(session.get("date_start", "").replace("Z", ""))
        end   = datetime.fromisoformat(session.get("date_end",   "").replace("Z", ""))
        return start <= now <= end
    except Exception:
        return False