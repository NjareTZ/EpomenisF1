import { useEffect, useState, useRef, useCallback } from "react";
import Track from "./Track";
import Leaderboard from "./Leaderboard";

const API = "https://epomenisf1-1.onrender.com";

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

function groupFramesByTime(frames, driverMap) {
  if (!frames?.length) return [];
  const buckets = new Map();
  frames.forEach(f => {
    const key = f.time ?? f.timestamp ?? f.t ?? String(f.lap);
    if (!buckets.has(key)) buckets.set(key, { time: key, lap: f.lap || 1, cars: [] });
    const d = driverMap[f.driver] || {};
    buckets.get(key).cars.push({
      driver: f.driver, number: f.driver,
      short:  d.short  || `#${f.driver}`,
      name:   d.name   || d.short || `Car ${f.driver}`,
      team:   d.team   || "",
      color:  d.color  || "#fff",
      x: f.x, y: f.y,
    });
  });
  return Array.from(buckets.values()).sort((a, b) => a.time < b.time ? -1 : 1);
}

export default function App() {
  const [mode, setMode]               = useState("replay"); // "replay" | "live"
  const [track, setTrack]             = useState([]);
  const [drivers, setDrivers]         = useState({});
  const [snapshots, setSnapshots]     = useState([]);
  const [cars, setCars]               = useState([]);
  const [pitStops, setPitStops]       = useState([]);
  const [overtakes, setOvertakes]     = useState([]);
  const [race, setRace]               = useState("");
  const [circuitName, setCircuitName] = useState("");
  const [circuitInfo, setCircuitInfo] = useState("");
  const [playing, setPlaying]         = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [snapIndex, setSnapIndex]     = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [isLive, setIsLive]           = useState(false);
  const [currentLap, setCurrentLap]   = useState(1);
  const [totalLaps, setTotalLaps]     = useState(70);
  const liveIntervalRef               = useRef(null);

  // ── Load replay data ────────────────────────────────────
  const loadReplay = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${API}/replay/latest`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const driverMap = {};
      (data.drivers || []).forEach(d => {
        driverMap[d.number] = { ...d, color: TEAM_COLORS[d.team] || "#fff" };
      });

      const snaps = groupFramesByTime(data.frames || [], driverMap);
      setDrivers(driverMap);
      setTrack(data.track       || []);
      setPitStops(data.pit_events    || []);
      setOvertakes(data.overtake_events || []);
      setRace(data.race         || "");
      setCircuitName(data.circuit_name || data.race || "");
      setCircuitInfo(data.circuit_info || "");
      setSnapshots(snaps);
      setTotalLaps(snaps.length ? (snaps[snaps.length - 1]?.lap || 70) : 70);
      setLoading(false);
      setPlaying(true);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // ── Load live data (polls every 2s) ─────────────────────
  const loadLive = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/live`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const driverMap = {};
      (data.drivers || []).forEach(d => {
        driverMap[d.number] = { ...d, color: d.color || TEAM_COLORS[d.team] || "#fff" };
      });

      setDrivers(driverMap);
      setRace(data.race         || "");
      setCircuitName(data.circuit_name || "");
      setCircuitInfo(data.circuit_info || "");
      setTrack(data.track       || []);
      setPitStops(data.pit_events    || []);
      setCars(data.cars         || []);
      setIsLive(data.is_live    || false);
      setCurrentLap(data.current_lap || 1);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // ── Switch modes ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(null); setCars([]); setSnapshots([]);
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);

    if (mode === "replay") {
      setIsLive(false);
      loadReplay();
    } else {
      loadLive();
      liveIntervalRef.current = setInterval(loadLive, 2000);
    }
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, [mode, loadReplay, loadLive]);

  // ── Replay playback ticker ───────────────────────────────
  useEffect(() => {
    if (mode !== "replay" || !playing || !snapshots.length) return;
    const timer = setInterval(() => {
      setSnapIndex(prev => {
        const next = Math.floor(prev) + speed;
        return next >= snapshots.length ? 0 : next;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [mode, playing, speed, snapshots.length]);

  // ── Update cars from snapshot (replay only) ──────────────
  useEffect(() => {
    if (mode !== "replay" || !snapshots.length) return;
    const snap = snapshots[Math.floor(snapIndex)];
    if (snap?.cars) {
      setCars(snap.cars);
      setCurrentLap(snap.lap || 1);
    }
  }, [snapIndex, snapshots, mode]);

  const progress = snapshots.length ? (snapIndex / snapshots.length) * 100 : 0;

  return (
    <div style={{
      background: "#060910", minHeight: "100vh", color: "#fff",
      padding: 20, fontFamily: "'Courier New', monospace",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", color: "#e2e8f0", margin: 0 }}>
          F1 RACE DASHBOARD
        </h1>
        <span style={{ fontSize: 13, color: "#475569" }}>{race}</span>

        {/* Mode toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setMode("replay")}
            style={btnStyle(mode === "replay" ? "#f59e0b" : "#1e2d3d")}>
            ⏪ REPLAY
          </button>
          <button onClick={() => setMode("live")}
            style={btnStyle(mode === "live" ? "#22c55e" : "#1e2d3d")}>
            {isLive ? "🔴 LIVE" : "📡 LATEST"}
          </button>
        </div>
      </div>

      {/* ── Replay controls ── */}
      {mode === "replay" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setPlaying(p => !p)} style={btnStyle("#22c55e")}>
            {playing ? "⏸ PAUSE" : "▶ PLAY"}
          </button>
          {[1, 2, 4].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              style={btnStyle(speed === s ? "#f59e0b" : "#1e2d3d")}>×{s}</button>
          ))}
          <span style={{ fontSize: 11, color: "#334155", marginLeft: 8 }}>
            LAP <span style={{ color: "#94a3b8" }}>{currentLap}</span> / {totalLaps}
          </span>
          <span style={{ fontSize: 10, color: "#1e2d3d", marginLeft: "auto" }}>
            {snapshots.length} frames · {Object.keys(drivers).length} drivers
          </span>
        </div>
      )}

      {/* ── Live status bar ── */}
      {mode === "live" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: isLive ? "rgba(34,197,94,0.1)" : "rgba(71,85,105,0.2)",
            border: `1px solid ${isLive ? "#22c55e" : "#334155"}`,
            borderRadius: 20, padding: "4px 12px",
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: isLive ? "#22c55e" : "#475569",
              animation: isLive ? "pulse 1.5s infinite" : "none",
            }} />
            <span style={{ fontSize: 11, color: isLive ? "#22c55e" : "#475569", fontWeight: 700 }}>
              {isLive ? "LIVE" : "LATEST SESSION"}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#334155" }}>
            LAP <span style={{ color: "#94a3b8" }}>{currentLap}</span>
            {" · "}{cars.length} cars · updates every 2s
          </span>
        </div>
      )}

      {/* ── Progress bar (replay only) ── */}
      {mode === "replay" && (
        <div style={{ width: "100%", height: 3, background: "#0f1923", borderRadius: 2, marginBottom: 18 }}>
          <div style={{
            width: `${progress}%`, height: "100%",
            background: "linear-gradient(90deg, #22c55e, #00ff88)",
            borderRadius: 2, transition: "width 0.05s linear",
          }} />
        </div>
      )}

      {/* ── States ── */}
      {loading && (
        <div style={{ color: "#1e3a2a", fontSize: 13, marginTop: 60, textAlign: "center", letterSpacing: "0.1em" }}>
          {mode === "live" ? "CONNECTING TO LIVE FEED..." : "LOADING RACE DATA..."}
        </div>
      )}

      {error && (
        <div style={{
          color: "#e8002d", fontSize: 12, marginTop: 40, textAlign: "center",
          background: "#1a0a0a", border: "1px solid #3a1010",
          borderRadius: 8, padding: "16px 24px",
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Main layout ── */}
      {!loading && !error && (
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

          <div style={{ width: 255, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <Leaderboard
              cars={cars}
              results={[]}
              drivers={drivers}
              mode={mode === "live" && isLive ? "live" : "replay"}
            />

            <div style={panelStyle}>
              <div style={panelHeaderStyle}>PIT STOPS</div>
              <div style={{ maxHeight: 140, overflowY: "auto", padding: "4px 0" }}>
                {pitStops.slice(0, 20).map((p, i) => (
                  <div key={i} style={eventRowStyle}>
                    <span style={{ color: "#eab308" }}>LAP {p.lap}</span>
                    <span style={{ color: "#1e2d3d" }}>·</span>
                    <span style={{ color: "#94a3b8" }}>CAR {p.driver}</span>
                    {p.duration && <span style={{ color: "#475569" }}>{parseFloat(p.duration).toFixed(1)}s</span>}
                  </div>
                ))}
                {!pitStops.length && <div style={{ color: "#1e2d3d", fontSize: 11, padding: "8px 14px" }}>No pit stops</div>}
              </div>
            </div>

            {mode === "replay" && (
              <div style={panelStyle}>
                <div style={panelHeaderStyle}>OVERTAKES</div>
                <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
                  {overtakes.slice(0, 30).map((o, i) => (
                    <div key={i} style={eventRowStyle}>
                      <span style={{ color: "#a855f7" }}>LAP {o.lap}</span>
                      <span style={{ color: "#1e2d3d" }}>·</span>
                      <span style={{ color: "#94a3b8" }}>CAR {o.driver}</span>
                      <span style={{ color: "#334155" }}>P{o.from}→P{o.to}</span>
                    </div>
                  ))}
                  {!overtakes.length && <div style={{ color: "#1e2d3d", fontSize: 11, padding: "8px 14px" }}>No overtakes</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

const btnStyle = (color) => ({
  background: "transparent", border: `1px solid ${color}`, color,
  padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
  cursor: "pointer", letterSpacing: "0.08em", fontFamily: "'Courier New', monospace",
});
const panelStyle = { background: "#0d1117", borderRadius: 10, border: "1px solid #1e2530", overflow: "hidden" };
const panelHeaderStyle = { background: "#111827", padding: "8px 14px", borderBottom: "1px solid #1e2530", fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.12em" };
const eventRowStyle = { display: "flex", gap: 8, padding: "4px 14px", fontSize: 11, borderBottom: "1px solid #0a0f16", fontFamily: "'Courier New', monospace" };