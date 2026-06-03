def build_timeline(session):

    laps = session.laps

    total_laps = int(
        laps["LapNumber"].max()
    )

    race_time = None

    try:
        if session.results is not None:
            race_time = str(
                session.results.iloc[0].get("Time")
            )
    except:
        race_time = None

    timeline = []

    for lap in range(
        1,
        total_laps + 1
    ):
        timeline.append({
            "lap": lap
        })

    return {
        "current_lap": total_laps,
        "total_laps": total_laps,
        "race_time": race_time,
        "timeline": timeline
    }