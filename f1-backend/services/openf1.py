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
        {
            "driver":   p.get("driver_number"),
            "lap":      p.get("lap_number"),
            "duration": p.get("pit_duration"),
        }
        for p in (pit_data or [])
    ]

# ── HIGHLIGHTS ────────────────────────────────────────────────────────────────

def get_positions_at_date(position_data, target_date, window_seconds=3):
    """Get all driver positions closest to a target timestamp."""
    from datetime import timedelta
    try:
        target = datetime.fromisoformat(target_date.replace("Z", "+00:00"))
    except Exception:
        return {}

    # Group by driver, find closest point to target
    by_driver = defaultdict(list)
    for p in position_data:
        num  = p.get("driver_number")
        date = p.get("date", "")
        x, y = p.get("x"), p.get("y")
        if num and date and x is not None and y is not None:
            try:
                t = datetime.fromisoformat(date.replace("Z", "+00:00"))
                diff = abs((t - target).total_seconds())
                if diff <= window_seconds:
                    by_driver[num].append((diff, float(x), float(y)))
            except Exception:
                pass

    result = {}
    for num, pts in by_driver.items():
        pts.sort(key=lambda p: p[0])
        result[num] = {"x": pts[0][1], "y": pts[0][2]}
    return result


def build_highlight_snapshot(moment_type, lap, description, positions, driver_map, featured_drivers=None):
    """Build a single highlight snapshot."""
    cars = []
    for num, pos in positions.items():
        driver = driver_map.get(num, {})
        cars.append({
            "driver":   num,
            "number":   num,
            "short":    driver.get("short", f"#{num}"),
            "name":     driver.get("name", ""),
            "team":     driver.get("team", ""),
            "color":    driver.get("color", "#ffffff"),
            "x":        pos["x"],
            "y":        pos["y"],
            "featured": num in (featured_drivers or []),
        })
    return {
        "type":        moment_type,
        "lap":         lap,
        "description": description,
        "cars":        cars,
    }


def build_highlights(laps_data, position_data, pit_data, driver_map):
    """
    Build key race highlights:
    - Race start (lap 1)
    - Overtakes per lap (position changes)
    - Top 10 pit stops
    - Race finish (final lap)
    """
    highlights = []
    total_laps = max((l.get("lap_number", 0) or 0 for l in laps_data), default=0) if laps_data else 0

    # Build lap-by-lap positions per driver
    by_driver_lap = defaultdict(dict)
    for lap in (laps_data or []):
        num    = lap.get("driver_number")
        lap_no = lap.get("lap_number", 0)
        pos    = lap.get("position")
        date   = lap.get("date_start") or lap.get("lap_start_time") or ""
        if num and lap_no and pos:
            by_driver_lap[lap_no][num] = {
                "position": int(pos),
                "date":     date,
                "duration": lap.get("lap_duration"),
            }

    # ── 1. RACE START (Lap 1) ──
    if 1 in by_driver_lap:
        lap1 = by_driver_lap[1]
        # Get earliest timestamp from lap 1
        dates = [v["date"] for v in lap1.values() if v["date"]]
        if dates:
            start_date = min(dates)
            positions  = get_positions_at_date(position_data, start_date)
            if positions:
                snap = build_highlight_snapshot(
                    "race_start", 1,
                    "🚦 RACE START — Lights out!",
                    positions, driver_map
                )
                highlights.append(snap)

    # ── 2. OVERTAKES (position changes per lap) ──
    prev_positions = {}
    for lap_no in sorted(by_driver_lap.keys()):
        curr = by_driver_lap[lap_no]
        if prev_positions:
            lap_overtakes = []
            for num, data in curr.items():
                if num in prev_positions:
                    prev_pos = prev_positions[num]["position"]
                    curr_pos = data["position"]
                    if curr_pos < prev_pos and curr_pos <= 10:
                        lap_overtakes.append({
                            "driver": num,
                            "from":   prev_pos,
                            "to":     curr_pos,
                            "date":   data["date"],
                        })

            if lap_overtakes:
                # Sort by most impactful (highest position gain)
                lap_overtakes.sort(key=lambda x: x["from"] - x["to"], reverse=True)
                top = lap_overtakes[0]
                driver = driver_map.get(top["driver"], {})
                positions = get_positions_at_date(position_data, top["date"])
                if positions:
                    featured = [o["driver"] for o in lap_overtakes]
                    desc = f"⚡ LAP {lap_no} — {driver.get('short','?')} overtakes! P{top['from']}→P{top['to']}"
                    snap = build_highlight_snapshot(
                        "overtake", lap_no, desc,
                        positions, driver_map, featured
                    )
                    highlights.append(snap)

        prev_positions = curr

    # ── 3. TOP 10 PIT STOPS ──
    pits = sorted(
        [p for p in (pit_data or []) if p.get("pit_duration")],
        key=lambda x: x.get("pit_duration", 999)
    )[:10]

    for pit in pits:
        num      = pit.get("driver_number")
        lap_no   = pit.get("lap_number", 0)
        duration = pit.get("pit_duration", 0)
        date     = pit.get("date_start") or pit.get("date") or ""
        driver   = driver_map.get(num, {})
        if date:
            positions = get_positions_at_date(position_data, date)
            if positions:
                desc = f"🔧 LAP {lap_no} — {driver.get('short','?')} pits in {duration:.1f}s"
                snap = build_highlight_snapshot(
                    "pit_stop", lap_no, desc,
                    positions, driver_map, [num]
                )
                highlights.append(snap)

    # ── 4. RACE FINISH (final lap) ──
    if total_laps > 0 and total_laps in by_driver_lap:
        final_lap = by_driver_lap[total_laps]
        dates = [v["date"] for v in final_lap.values() if v["date"]]
        if dates:
            finish_date = max(dates)
            positions   = get_positions_at_date(position_data, finish_date, window_seconds=10)
            if positions:
                # Get winner
                sorted_drivers = sorted(final_lap.items(), key=lambda x: x[1]["position"])
                winner = driver_map.get(sorted_drivers[0][0], {}) if sorted_drivers else {}
                desc   = f"🏁 RACE FINISH — {winner.get('short','?')} wins!"
                snap   = build_highlight_snapshot(
                    "race_finish", total_laps, desc,
                    positions, driver_map,
                    [d[0] for d in sorted_drivers[:3]]
                )
                highlights.append(snap)

    # Sort all highlights by lap number
    highlights.sort(key=lambda x: (x["lap"], x["type"] == "race_finish"))

    print(f"Built {len(highlights)} highlights")
    return highlights, total_laps


# ── Main functions ────────────────────────────────────────────────────────────

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

        print(f"Building highlights: {meeting_name} {year} key={key}")

        # Fetch all data in parallel
        drivers_data, position_data, laps_data, pit_data = await asyncio.gather(
            fetch(client, "drivers",  {"session_key": key}),
            fetch(client, "position", {"session_key": key}),
            fetch(client, "laps",     {"session_key": key}),
            fetch(client, "pit",      {"session_key": key}),
        )

        driver_map  = build_drivers(drivers_data)
        track       = build_track_outline(position_data)
        leaderboard = build_leaderboard(laps_data, driver_map)
        pit_events  = build_pit_events(pit_data)
        highlights, total_laps = build_highlights(laps_data, position_data, pit_data, driver_map)

        # Build overtakes list for sidebar
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

        return {
            "race":             f"{meeting_name} {year}",
            "circuit_name":     meeting_name,
            "circuit_info":     f"{year} · Round {session.get('meeting_key', '')}",
            "year":             year,
            "session_key":      key,
            "total_laps":       total_laps,
            "svg_url":          ci.get("svg_url"),
            "circuit_id":       ci.get("circuit_id"),
            "drivers":          list(driver_map.values()),
            "track":            track,
            "highlights":       highlights,
            "leaderboard":      leaderboard,
            "pit_events":       pit_events,
            "overtake_events":  overtakes,
            # Keep frames empty — highlights replace frames
            "frames":           [],
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

        driver_map = build_drivers(drivers_data)

        latest_pos = {}
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
