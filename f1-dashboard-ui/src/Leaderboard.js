export default function Leaderboard({ cars, results, drivers, mode }) {
  const entries = results.length > 0
    ? results
        .sort((a, b) => a.position - b.position)
        .map(r => {
          const d = drivers[r.driver_number] || {};
          const live = cars.find(c => c.number === r.driver_number);
          return {
            position: r.position,
            number: r.driver_number,
            short: d.short || `#${r.driver_number}`,
            name: d.name || "",
            team: d.team || "",
            color: live?.color || d.color || "#fff",
            gap: r.gap_to_leader,
          };
        })
    : cars.map((c, i) => ({
        position: i + 1,
        number: c.number,
        short: c.short,
        name: c.name,
        team: c.team,
        color: c.color,
      }));

  return (
    <div style={{
      width: 240, background: "#0a0a0a", borderRadius: 12,
      border: "1px solid #333", overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{
        background: "#1a1a1a", padding: "10px 14px",
        borderBottom: "1px solid #333", display: "flex",
        justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>LEADERBOARD</span>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 10,
          background: mode === "live" ? "#00e676" : "#e8002d",
          color: mode === "live" ? "#000" : "#fff", fontWeight: "bold",
        }}>
          {mode === "live" ? "LIVE" : "REPLAY"}
        </span>
      </div>

      <div style={{ maxHeight: 460, overflowY: "auto" }}>
        {entries.map((e, i) => (
          <div key={e.number || i} style={{
            display: "flex", alignItems: "center",
            padding: "7px 12px", borderBottom: "1px solid #1a1a1a", gap: 8,
          }}>
            <span style={{
              color: i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "#555",
              fontWeight: "bold", fontSize: 12, width: 18, textAlign: "right",
            }}>
              {e.position || i + 1}
            </span>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              backgroundColor: e.color, boxShadow: `0 0 5px ${e.color}`, flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>{e.short}</div>
              <div style={{ color: "#555", fontSize: 10 }}>{e.team}</div>
            </div>
            {e.gap != null && e.gap !== 0 && (
              <span style={{ color: "#666", fontSize: 10 }}>
                {typeof e.gap === "number" ? `+${e.gap.toFixed(1)}s` : e.gap}
              </span>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <p style={{ color: "#666", textAlign: "center", padding: 20, fontSize: 12 }}>
            Waiting for data...
          </p>
        )}
      </div>
    </div>
  );
}