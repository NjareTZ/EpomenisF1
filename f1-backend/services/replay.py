import pandas as pd
import numpy as np


def safe(v):
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def build_replay(session):

    drivers      = []
    frames       = []
    track        = []
    pit_events   = []
    overtake_events = []

    # ── Drivers ──────────────────────────────────────
    for drv in session.drivers:
        try:
            info = session.get_driver(drv)
            drivers.append({
                "number": int(drv),
                "name":   str(info["FullName"]),
                "short":  str(info["Abbreviation"]),
                "team":   str(info["TeamName"]),
            })
        except Exception as e:
            print("Driver error:", e)

    # ── Track outline (from leader's fastest lap) ────
    try:
        leader  = session.drivers[0]
        fastest = session.laps.pick_drivers([leader]).pick_fastest()
        pos     = fastest.get_pos_data()

        for _, row in pos.iterrows():
            if pd.notna(row["X"]) and pd.notna(row["Y"]):
                track.append({
                    "x": float(row["X"]),
                    "y": float(row["Y"]),
                })

    except Exception as e:
        print("Track error:", e)

    # ── Replay frames ────────────────────────────────
    try:
        for drv in session.drivers:
            laps = session.laps.pick_driver(drv)

            for _, lap in laps.iterrows():
                try:
                    telemetry = lap.get_pos_data()

                    for _, p in telemetry.iterrows():
                        if pd.notna(p["X"]) and pd.notna(p["Y"]):
                            frames.append({
                                "driver": int(drv),
                                "lap":    int(lap["LapNumber"]),
                                "x":      float(p["X"]),
                                "y":      float(p["Y"]),
                                "time":   str(p["Date"]),
                            })
                except Exception:
                    pass

    except Exception as e:
        print("Frame error:", e)

    # ── Pit stops ────────────────────────────────────
    try:
        for drv in session.drivers:
            laps = session.laps.pick_driver(drv)

            for _, lap in laps.iterrows():
                if (
                    pd.notna(lap.get("PitInTime"))
                    or pd.notna(lap.get("PitOutTime"))
                ):
                    pit_events.append({
                        "driver": int(drv),
                        "lap":    int(lap["LapNumber"]),
                    })

    except Exception as e:
        print("Pit stop error:", e)

    # ── Overtakes ────────────────────────────────────
    try:
        standings = []

        for drv in session.drivers:
            laps = session.laps.pick_driver(drv)

            for _, lap in laps.iterrows():
                if pd.notna(lap["Position"]):
                    standings.append({
                        "driver":   int(drv),
                        "lap":      int(lap["LapNumber"]),
                        "position": int(lap["Position"]),
                    })

        df       = pd.DataFrame(standings)
        previous = {}

        for lap_num in sorted(df["lap"].unique().tolist()):
            current   = df[df["lap"] == lap_num].sort_values("position")
            positions = {int(r["driver"]): int(r["position"]) for _, r in current.iterrows()}

            if previous:
                for drv_num, pos in positions.items():
                    if drv_num in previous and pos < previous[drv_num]:
                        overtake_events.append({
                            "driver": drv_num,
                            "lap":    lap_num,
                            "from":   previous[drv_num],
                            "to":     pos,
                        })

            previous = positions

    except Exception as e:
        print("Overtake error:", e)

    return {
        "track":            track,
        "drivers":          drivers,
        "frames":           frames,
        "pit_events":       pit_events,
        "overtake_events":  overtake_events,
    }