import { useEffect, useState, useRef } from "react";
import Track from "./Track";
import Leaderboard from "./Leaderboard";

const API = "http://localhost:8000";

const TEAM_COLORS = {
  Ferrari: "#e8002d",
  "Red Bull Racing": "#3671c6",
  Mercedes: "#27f4d2",
  McLaren: "#ff8000",
  "Aston Martin": "#358c75",
  Alpine: "#0093cc",
  Williams: "#64c4ff",
  Cadillac: "#00c853",
  Audi: "#9c27b0",
  "Haas F1 Team": "#b6babd",
  "Racing Bulls": "#6692ff",
};

export default function App() {
  const [track, setTrack] = useState([]);
  const [drivers, setDrivers] = useState({});
  const [frames, setFrames] = useState([]);      // raw frames array
  const [snapshots, setSnapshots] = useState([]); // grouped: [{timestamp, cars:[...]}, ...]
  const [cars, setCars] = useState([]);
  const [pitStops, setPitStops] = useState([]);
  const [overtakes, setOvertakes] = useState([]);
  const [race, setRace] = useState("");
  const [circuitName, setCircuitName] = useState("");
  const [circuitInfo, setCircuitInfo] = useState("");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [snapIndex, setSnapIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const driversRef = useRef({});

  useEffect(() => {
    async function loadReplay() {
      try {
        const response = await fetch(`${API}/replay/latest`);
        const data = await response.json();

        const driverMap = {};
        (data.drivers || []).forEach(d => {
          driverMap[d.number] = {
            ...d,
            color: TEAM_COLORS[d.team] || "#fff",
          };
        });

        driversRef.current = driverMap;
        setDrivers(driverMap);
        setTrack(data.track || []);
        setFrames(data.frames || []);
        setPitStops(data.pit_events || []);
        setOvertakes(data.overtake_events || []);
        setRace(data.race || "");
        setCircuitName(data.circuit_name || data.race || "");
        setCircuitInfo(data.circuit_info || "");

        // Group frames by timestamp so all drivers move together
        const grouped = groupFrames(data.frames || [], driverMap);
        setSnapshots(grouped);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load replay:", err);
        setLoading(false);
      }
    }
    loadReplay();
  }, []);

  // Playback ticker
  useEffect(() => {
    if (!playing || !snapshots.length) return;
    const timer = setInterval(() => {
      setSnapIndex(prev => {
        const next = prev + speed;
        return next >= snapshots.length ? 0 : next;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [playing, speed, snapshots]);

  // Update cars from snapshot
  useEffect(() => {
    if (!snapshots.length) return;
    const snap = snapshots[Math.floor(snapIndex)];
    if (snap) setCars(snap.cars);
  }, [snapIndex, snapshots]);

  const totalSnaps = snapshots.length;
  const progress = totalSnaps ? (snapIndex / totalSnaps) * 100 : 0;
  const currentSnap = snapshots[Math.floor(snapIndex)];
  const currentLap = currentSnap?.lap || 1;
  const totalLaps = snapshots.length ? (snapshots[snapshots.length - 1]?.lap || 70) : 70;

  return (
    <div style={{
      background: "#060910",
      minHeight: "100vh",
      color: "white",
      padding: 20,
      fontFamily: "'Courier New', monospace",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", color: "#e2e8f0" }}>
          F1 RACE REPLAY
        </h1>
        <span style={{ fontSize: 13, color: "#475569", letterSpacing: "0.04em" }}>{race}</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
        <button onClick={() => setPlaying(!playing)} style={btnStyle("#22c55e")}>
          {playing ? "⏸ PAUSE" : "▶ PLAY"}
        </button>
        {[1, 2, 4].map(s => (
          <button key={s} onClick={() => setSpeed(s)}
            style={btnStyle(speed === s ? "#f59e0b" : "#334155")}>
            ×{s}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "#475569", marginLeft: 8, letterSpacing: "0.06em" }}>
          LAP <span style={{ color: "#94a3b8" }}>{currentLap}</span> / {totalLaps}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", height: 4, background: "#1e2530", borderRadius: 2, marginBottom: 18 }}>
        <div style={{
          width: `${progress}%`, height: "100%",
          background: "linear-gradient(90deg, #22c55e, #00ff88)",
          borderRadius: 2, transition: "width 0.05s linear",
        }} />
      </div>

      {loading && (
        <div style={{ color: "#334155", fontSize: 13, marginTop: 60, textAlign: "center", letterSpacing: "0.1em" }}>
          LOADING RACE DATA...
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Track
              track={track}
              cars={cars}
              circuitName={circuitName}
              circuitInfo={circuitInfo}
              lapInfo={`LAP ${currentLap}/${totalLaps}`}
            />
          </div>

          <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <Leaderboard
              cars={cars}
              results={[]}
              drivers={drivers}
              mode="replay"
            />

            <div style={panelStyle}>
              <div style={panelHeaderStyle}>PIT STOPS</div>
              <div style={{ maxHeight: 140, overflowY: "auto", padding: "4px 0" }}>
                {pitStops.slice(0, 20).map((p, i) => (
                  <div key={i} style={eventRowStyle}>
                    <span style={{ color: "#eab308" }}>LAP {p.lap}</span>
                    <span style={{ color: "#475569" }}>·</span>
                    <span style={{ color: "#94a3b8" }}>CAR {p.driver}</span>
                  </div>
                ))}
                {!pitStops.length && <div style={{ color: "#334155", fontSize: 11, padding: "8px 14px" }}>No pit stops</div>}
              </div>
            </div>

            <div style={panelStyle}>
              <div style={panelHeaderStyle}>OVERTAKES</div>
              <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
                {overtakes.slice(0, 30).map((o, i) => (
                  <div key={i} style={eventRowStyle}>
                    <span style={{ color: "#a855f7" }}>LAP {o.lap}</span>
                    <span style={{ color: "#475569" }}>·</span>
                    <span style={{ color: "#94a3b8" }}>CAR {o.driver}</span>
                    <span style={{ color: "#475569" }}>P{o.from}→P{o.to}</span>
                  </div>
                ))}
                {!overtakes.length && <div style={{ color: "#334155", fontSize: 11, padding: "8px 14px" }}>No overtakes</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Group raw frames (one entry per driver per timestamp) into snapshots
 * where every snapshot contains ALL drivers at that moment.
 *
 * Your API returns frames like: [{driver, x, y, lap, timestamp}, ...]
 * We group by timestamp so all drivers move together.
 */
function groupFrames(frames, driverMap) {
  if (!frames.length) return [];

  // Group by timestamp (or by sequential index if no timestamp)
  const byTime = {};
  frames.forEach(f => {
    const key = f.timestamp ?? f.t ?? f.index ?? frames.indexOf(f);
    if (!byTime[key]) byTime[key] = { lap: f.lap || 1, cars: [] };
    const driver = driverMap[f.driver] || {};
    byTime[key].cars.push({
      driver: f.driver,
      number: f.driver,
      short: driver.short || `#${f.driver}`,
      name: driver.name || driver.short || `Car ${f.driver}`,
      team: driver.team || "",
      color: driver.color || "#fff",
      x: f.x,
      y: f.y,
    });
  });

  // Sort by key and return as array
  return Object.keys(byTime)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => byTime[k]);
}

const btnStyle = (color) => ({
  background: "transparent",
  border: `1px solid ${color}`,
  color,
  padding: "5px 14px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.08em",
  fontFamily: "'Courier New', monospace",
});

const panelStyle = {
  background: "#0d1117",
  borderRadius: 10,
  border: "1px solid #1e2530",
  overflow: "hidden",
};

const panelHeaderStyle = {
  background: "#111827",
  padding: "8px 14px",
  borderBottom: "1px solid #1e2530",
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.1em",
};

const eventRowStyle = {
  display: "flex",
  gap: 8,
  padding: "4px 14px",
  fontSize: 11,
  borderBottom: "1px solid #0d1117",
  fontFamily: "'Courier New', monospace",
};