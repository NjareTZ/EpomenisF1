import httpx
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from .circuits import get_circuit_info

BASE = "https://api.openf1.org/v1"

async def fetch(client, endpoint, params=None):
    try:
        r = await client.get(f"{BASE}/{endpoint}", params=params, timeout=20)
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

def build_frames(position_data, driver_map):
    buckets = defaultdict(list)
    for p in position_data:
        num  = p.get("driver_number")
        x, y = p.get("x"), p.get("y")
        date = p.get("date", "")
        if num and x is not None and y is not None and date:
            buckets[date].append({"driver": num, "x": float(x), "y": float(y)})
    frames = []
    for timestamp in sorted(buckets.keys()):
        cars = []
        for entry in buckets[timestamp]:
            num    = entry["driver"]
            driver = driver_map.get(num, {})
            cars.append({
                "driver": num,
                "number": num,
                "short":  driver.get("short", f"#{num}"),
                "name":   driver.get("name", ""),
                "team":   driver.get("team", ""),
                "color":  driver.get("color", "#ffffff"),
                "x":      entry["x"],
                "y":      entry["y"],
            })
        if cars:
            frames.append({"time": timestamp, "lap": 1, "cars": cars})
    return frames

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
    return [{"driver": p.get("driver_number"), "lap": p.get("lap_number"), "duration": p.get("pit_duration")} for p in (pit_data or [])]

def build_overtakes(laps_data):
    by_lap = defaultdict(dict)
    for lap in (laps_data or []):
        num    = lap.get("driver_number")
        lap_no = lap.get("lap_number", 0)
        pos    = lap.get("position") or lap.get("lap_number")
        if num and lap_no and pos:
            by_lap[lap_no][num] = int(pos)
    overtakes = []
    prev = {}
    for lap_no in sorted(by_lap.keys()):
        curr = by_lap[lap_no]
        for num, pos in curr.items():
            if num in prev and pos < prev[num]:
                overtakes.append({"driver": num, "lap": lap_no, "from": prev[num], "to": pos})
        prev = curr
    return overtakes

async def build_replay(session_key=None):
    async with httpx.AsyncClient() as client:
        if session_key:
            sessions = await fetch(client, "sessions", {"session_key": session_key})
            session  = sessions[0] if sessions else None
        else:
            sessions = await fetch(client, "sessions", {"session_type": "Race"})
            sessions = [s for s in sessions if has_ended(s)]
            sessions.sort(key=lambda x: x.get("date_start", ""), reverse=True)
            session = sessions[0] if sessions else None
        if not session:
            return {"error": "No session found"}
        key          = session["session_key"]
        meeting_name = session.get("meeting_name", "")
        year         = session.get("year", datetime.now().year)
        ci           = get_circuit_info(meeting_name)
        print(f"Building replay: {meeting_name} {year} key={key}")
        drivers_data, position_data, laps_data, pit_data = await asyncio.gather(
            fetch(client, "drivers",  {"session_key": key}),
            fetch(client, "position", {"session_key": key}),
            fetch(client, "laps",     {"session_key": key}),
            fetch(client, "pit",      {"session_key": key}),
        )
        driver_map  = build_drivers(drivers_data)
        track       = build_track_outline(position_data)
        frames      = build_frames(position_data, driver_map)
        leaderboard = build_leaderboard(laps_data, driver_map)
        pit_events  = build_pit_events(pit_data)
        overtakes   = build_overtakes(laps_data)
        max_lap     = max((l.get("lap_number", 0) or 0 for l in laps_data), default=0) if laps_data else 0
        print(f"Done: {len(frames)} frames, {len(track)} track pts, {len(driver_map)} drivers")
        return {
            "race":             f"{meeting_name} {year}",
            "circuit_name":     meeting_name,
            "circuit_info":     f"{year} · Round {session.get('meeting_key', '')}",
            "year":             year,
            "session_key":      key,
            "total_laps":       max_lap,
            "svg_url":          ci.get("svg_url"),
            "circuit_id":       ci.get("circuit_id"),
            "drivers":          list(driver_map.values()),
            "track":            track,
            "frames":           frames,
            "leaderboard":      leaderboard,
            "pit_events":       pit_events,
            "overtake_events":  overtakes,
        }

async def build_live():
    async with httpx.AsyncClient() as client:
        sessions = await fetch(client, "sessions", {"session_type": "Race"})
        if not sessions:
            return {"error": "No sessions available"}
        sessions.sort(key=lambda x: x.get("date_start", ""), reverse=True)
        session      = sessions[0]
        key          = session["session_key"]
        meeting_name = session.get("meeting_name", "")
        year         = session.get("year", datetime.now().year)
        live         = is_live(session)
        ci           = get_circuit_info(meeting_name)
        drivers_data, position_data, laps_data, pit_data, intervals_data = await asyncio.gather(
            fetch(client, "drivers",   {"session_key": key}),
            fetch(client, "position",  {"session_key": key}),
            fetch(client, "laps",      {"session_key": key}),
            fetch(client, "pit",       {"session_key": key}),
            fetch(client, "intervals", {"session_key": key}),
        )
        driver_map  = build_drivers(drivers_data)
        latest_pos  = {}
        for p in (position_data or []):
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
        leaderboard = build_leaderboard(laps_data, driver_map)
        pit_events  = build_pit_events(pit_data)
        track       = build_track_outline(position_data)
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
            meeting_name = s.get("meeting_name", "")
            ci           = get_circuit_info(meeting_name)
            result.append({
                "session_key": s["session_key"],
                "name":        meeting_name,
                "year":        s.get("year"),
                "date":        s.get("date_start", "")[:10],
                "circuit_id":  ci.get("circuit_id"),
                "svg_url":     ci.get("svg_url"),
            })
        return result
