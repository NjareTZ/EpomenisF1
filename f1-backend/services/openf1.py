import httpx
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from .circuits import get_circuit_info

BASE = "https://api.openf1.org/v1"

async def fetch(client, endpoint, params=None):
    try:
        r = await client.get(f"{BASE}/{endpoint}", params=params, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"OpenF1 error /{endpoint}: {e}")
        return []

def is_live(session):
    try:
        now   = datetime.now(timezone.utc)
        start = datetime.fromisoformat(session["date_start"].replace("Z", "+00:00"))
        end   = datetime.fromisoformat(session["date_end"].replace("Z", "+00:00"))
        return start <= now <= end
    except Exception:
        return False

def has_ended(session):
    try:
        now = datetime.now(timezone.utc)
        end = datetime.fromisoformat(session["date_end"].replace("Z", "+00:00"))
        return now > end
    except Exception:
        return True

def get_meeting_name(session, meeting):
    for field in ["meeting_official_name", "meeting_name"]:
        val = meeting.get(field, "")
        if val and val.strip():
            return val.strip()
    for field in ["circuit_short_name", "location", "country_name"]:
        val = session.get(field, "")
        if val and val.strip():
            return val.strip()
    return f"Round {session.get('meeting_key', '')}"

def build_drivers(drivers_data):
    driver_map = {}
    for d in (drivers_data or []):
        num = d.get("driver_number")
        if num:
            color = d.get("team_colour", "ffffff")
            if color and not color.startswith("#"):
                color = f"#{color}"
            driver_map[num] = {
                "number": num,
                "short":  d.get("name_acronym", f"#{num}"),
                "name":   d.get("full_name", ""),
                "team":   d.get("team_name", ""),
                "color":  color or "#ffffff",
            }
    return driver_map

def build_track_outline(position_data):
    by_driver = defaultdict(list)
    for p in position_data:
        num = p.get("driver_number")
        x, y = p.get("x"), p.get("y")
        if num and x is not None and y is not None and (x != 0 or y != 0):
            by_driver[num].append({"x": float(x), "y": float(y)})
    if not by_driver:
        return []
    best = max(by_driver.values(), key=len)
    step = max(1, len(best) // 800)
    return best[::step]

def build_leaderboard(laps_data, driver_map):
    latest_laps = {}
    for lap in (laps_data or []):
        num    = lap.get("driver_number")
        lap_no = lap.get("lap_number", 0) or 0
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
            "name":          driver.get("name", ""),
            "team":          driver.get("team", ""),
            "color":         driver.get("color", "#ffffff"),
            "lap_number":    lap.get("lap_number", 0),
            "lap_duration":  lap.get("lap_duration"),
            "gap_to_leader": None,
            "position":      0,
        })
    leaderboard.sort(key=lambda x: (-(x["lap_number"] or 0), (x["lap_duration"] or 9999)))
    for i, e in enumerate(leaderboard):
        e["position"] = i + 1
    return leaderboard

def build_pit_events(pit_data):
    return [
        {"driver": p.get("driver_number"), "lap": p.get("lap_number"), "duration": p.get("pit_duration")}
        for p in (pit_data or [])
    ]

def build_frames_for_lap(location_data, driver_map):
    """
    Build time-ordered frames for a single lap.
    Each frame: {time, cars: [{driver, x, y, short, color, ...}]}
    Groups all drivers by timestamp, interpolates smoothly.
    """
    # Group by timestamp
    buckets = defaultdict(dict)
    for p in location_data:
        num  = p.get("driver_number")
        date = p.get("date", "")
        x, y = p.get("x"), p.get("y")
        if num and date and x is not None and y is not None and (x != 0 or y != 0):
            buckets[date][num] = {"x": float(x), "y": float(y)}

    if not buckets:
        return []

    sorted_times = sorted(buckets.keys())

    # Build last-known positions — carry forward if driver missing from timestamp
    last_known = {}
    frames = []

    for timestamp in sorted_times:
        snapshot = buckets[timestamp]
        # Update last known
        for num, pos in snapshot.items():
            last_known[num] = pos

        # Build cars list with all drivers using last known position
        cars = []
        for num, pos in last_known.items():
            driver = driver_map.get(num, {})
            cars.append({
                "driver": num,
                "number": num,
                "short":  driver.get("short", f"#{num}"),
                "name":   driver.get("name", ""),
                "team":   driver.get("team", ""),
                "color":  driver.get("color", "#ffffff"),
                "x":      pos["x"],
                "y":      pos["y"],
            })

        frames.append({"time": timestamp, "cars": cars})

    return frames


async def get_session(client, session_key=None):
    """Get session object by key or latest completed race."""
    if session_key:
        sessions = await fetch(client, "sessions", {"session_key": session_key})
        return sessions[0] if sessions else None
    else:
        sessions = await fetch(client, "sessions", {"session_type": "Race"})
        sessions = [s for s in sessions if has_ended(s)]
        sessions.sort(key=lambda x: x.get("date_start", ""), reverse=True)
        return sessions[0] if sessions else None


async def build_replay(session_key=None):
    """
    Build full race replay metadata.
    Does NOT include position frames — those are fetched per-lap.
    """
    async with httpx.AsyncClient() as client:
        session = await get_session(client, session_key)
        if not session:
            return {"error": "No session found"}

        key = session["session_key"]
        year = session.get("year", datetime.now().year)

        # Fetch meeting name + drivers + laps + pits in parallel
        meetings_data, drivers_data, laps_data, pit_data, position_sample = await asyncio.gather(
            fetch(client, "meetings", {"meeting_key": session.get("meeting_key")}),
            fetch(client, "drivers",  {"session_key": key}),
            fetch(client, "laps",     {"session_key": key}),
            fetch(client, "pit",      {"session_key": key}),
            fetch(client, "location", {"session_key": key, "driver_number": 1}),
        )

        meeting      = meetings_data[0] if meetings_data else {}
        meeting_name = get_meeting_name(session, meeting)
        ci           = get_circuit_info(meeting_name)

        driver_map  = build_drivers(drivers_data)
        leaderboard = build_leaderboard(laps_data, driver_map)
        pit_events  = build_pit_events(pit_data)

        # Track outline from driver 1 sample
        track = build_track_outline(position_sample)

        # If no track from driver 1, try getting from a few laps
        if not track and position_sample:
            track = build_track_outline(position_sample)

        total_laps = max(
            (l.get("lap_number", 0) or 0 for l in laps_data),
            default=0
        ) if laps_data else 0

        # Build overtakes list
        overtakes = []
        by_driver_lap = defaultdict(dict)
        for lap in (laps_data or []):
            num    = lap.get("driver_number")
            lap_no = lap.get("lap_number", 0)
            pos    = lap.get("position")
            if num and lap_no and pos:
                by_driver_lap[lap_no][num] = int(pos)
        prev = {}
        for lap_no in sorted(by_driver_lap.keys()):
            curr = by_driver_lap[lap_no]
            for num, pos in curr.items():
                if num in prev and pos < prev[num]:
                    overtakes.append({"driver": num, "lap": lap_no, "from": prev[num], "to": pos})
            prev = curr

        print(f"Replay metadata: {meeting_name} {year} key={key} laps={total_laps} drivers={len(driver_map)}")

        return {
            "race":            f"{meeting_name} {year}",
            "circuit_name":    meeting_name,
            "circuit_info":    f"{year}",
            "year":            year,
            "session_key":     key,
            "total_laps":      total_laps,
            "svg_url":         ci.get("svg_url"),
            "circuit_id":      ci.get("circuit_id"),
            "drivers":         list(driver_map.values()),
            "track":           track,
            "leaderboard":     leaderboard,
            "pit_events":      pit_events,
            "overtake_events": overtakes,
        }


async def build_lap_frames(session_key, lap_number, driver_map_data):
    """
    Fetch position data for a specific lap and return animation frames.
    Called per-lap by the frontend as it plays.
    """
    async with httpx.AsyncClient() as client:
        # Fetch location data for this lap — all drivers
        location_data = await fetch(client, "location", {
            "session_key": session_key,
            "lap_number":  lap_number,
        })

        # Rebuild driver map from provided data
        driver_map = {d["number"]: d for d in (driver_map_data or [])}

        frames = build_frames_for_lap(location_data, driver_map)
        print(f"Lap {lap_number}: {len(frames)} frames, {len(location_data)} location points")

        return {
            "session_key": session_key,
            "lap_number":  lap_number,
            "frames":      frames,
            "count":       len(frames),
        }


async def build_live():
    """Build live race data."""
    async with httpx.AsyncClient() as client:
        sessions = await fetch(client, "sessions", {"session_type": "Race"})
        if not sessions:
            return {"error": "No sessions available"}

        sessions.sort(key=lambda x: x.get("date_start", ""), reverse=True)
        session      = sessions[0]
        key          = session["session_key"]
        year         = session.get("year", datetime.now().year)
        live         = is_live(session)

        meetings_data, drivers_data, location_data, laps_data, pit_data = await asyncio.gather(
            fetch(client, "meetings",  {"meeting_key": session.get("meeting_key")}),
            fetch(client, "drivers",   {"session_key": key}),
            fetch(client, "location",  {"session_key": key}),
            fetch(client, "laps",      {"session_key": key}),
            fetch(client, "pit",       {"session_key": key}),
        )

        meeting      = meetings_data[0] if meetings_data else {}
        meeting_name = get_meeting_name(session, meeting)
        ci           = get_circuit_info(meeting_name)
        driver_map   = build_drivers(drivers_data)

        # Latest position per driver
        latest_pos = {}
        for p in (location_data or []):
            num = p.get("driver_number")
            if num:
                existing = latest_pos.get(num)
                if not existing or p.get("date", "") > existing.get("date", ""):
                    latest_pos[num] = p

        cars = []
        for num, pos in latest_pos.items():
            driver = driver_map.get(num, {})
            x, y   = pos.get("x") or 0, pos.get("y") or 0
            if x == 0 and y == 0:
                continue
            cars.append({
                "driver": num, "number": num,
                "short":  driver.get("short", f"#{num}"),
                "name":   driver.get("name", ""),
                "team":   driver.get("team", ""),
                "color":  driver.get("color", "#ffffff"),
                "x": float(x), "y": float(y),
            })

        track       = build_track_outline(location_data)
        leaderboard = build_leaderboard(laps_data, driver_map)
        pit_events  = build_pit_events(pit_data)
        max_lap     = max((l.get("lap_number", 0) or 0 for l in laps_data), default=0) if laps_data else 0

        return {
            "race":         f"{meeting_name} {year}",
            "circuit_name": meeting_name,
            "circuit_info": f"{year}",
            "year":         year,
            "session_key":  key,
            "is_live":      live,
            "current_lap":  max_lap,
            "svg_url":      ci.get("svg_url"),
            "circuit_id":   ci.get("circuit_id"),
            "drivers":      list(driver_map.values()),
            "cars":         cars,
            "leaderboard":  leaderboard,
            "pit_events":   pit_events,
            "track":        track,
            "frames":       [],
        }


async def get_sessions_list(years):
    async with httpx.AsyncClient() as client:
        all_sessions = []
        for year in years:
            data = await fetch(client, "sessions", {"session_type": "Race", "year": year})
            all_sessions.extend(data)
        all_sessions.sort(key=lambda x: x.get("date_start", ""))

        result = []
        for s in all_sessions:
            if not has_ended(s):
                continue
            meetings = await fetch(client, "meetings", {"meeting_key": s.get("meeting_key")})
            meeting  = meetings[0] if meetings else {}
            meeting_name = get_meeting_name(s, meeting)
            ci = get_circuit_info(meeting_name)
            result.append({
                "session_key": s["session_key"],
                "name":        meeting_name,
                "year":        s.get("year"),
                "date":        s.get("date_start", "")[:10],
                "circuit_id":  ci.get("circuit_id"),
                "svg_url":     ci.get("svg_url"),
            })
        return result
