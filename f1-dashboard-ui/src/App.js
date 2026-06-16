import { useEffect, useState, useRef, useCallback } from "react";
import Track from "./Track";
import Leaderboard from "./Leaderboard";

const API = "https://epomenisf1-1.onrender.com";

export default function App() {
  const [mode, setMode]               = useState("replay");
  const [sessions, setSessions]       = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [track, setTrack]             = useState([]);
  const [svgUrl, setSvgUrl]           = useState(null);
  const [drivers, setDrivers]         = useState({});
  const [snapshots, setSnapshots]     = useState([]);
  const [cars, setCars]               = useState([]);
  const [pitStops, setPitStops]       = useState([]);
  const [overtakes, setOvertakes]     = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [race, setRace]               = useState("");
  const [circuitName, setCircuitName] = useState("");
  const [circuitInfo, setCircuitInfo] = useState("");
  const [playing, setPlaying]         = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [snapIndex, setSnapIndex]     = useState(0);
  const [loading, setLoading]         = useState(true);
  const [loadingMsg, setLoadingMsg]   = useState("Connecting...");
  const [error, setError]             = useState(null);
  const [isLive, setIsLive]           = useState(false);
  const [currentLap, setCurrentLap]   = useState(1);
  const [totalLaps, setTotalLaps]     = useState(70);
  const [showSessions, setShowSessions] = useState(false);
  const liveRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/replay/sessions`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(e => console.warn("Sessions:", e));
  }, []);

  const applyReplay = useCallback((data) => {
    const driverMap = {};
    (data.drivers || []).forEach(d => { driverMap[d.number] = d; });
    setDrivers(driverMap);
    setTrack(data.track || []);
    setSvgUrl(data.svg_url || null);
    setPitStops(data.pit_events || []);
    setOvertakes(data.overtake_events || []);
    setLeaderboard(data.leaderboard || []);
    setRace(data.race || "");
    setCircuitName(data.circuit_name || "");
    setCircuitInfo(data.circuit_info || "");
    setTotalLaps(data.total_laps || 70);
    setSnapshots(data.frames || []);
    setSnapIndex(0);
    setLoading(false);
    setPlaying(true);
  }, []);

  const loadReplay = useCallback(async (sessionKey = null) => {
    setLoading(true); setError(null); setCars([]); setSnapshots([]);
    setLoadingMsg("Loading race data from OpenF1...");
    try {
      const url  = sessionKey ? `${API}/replay/session/${sessionKey}` : `${API}/replay/latest`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      applyReplay(data);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [applyReplay]);

  const loadLive = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/live`);
      const data = await res.json();
      if (data.error) { console.warn("Live:", data.error); return; }
      const driverMap = {};
      (data.drivers || []).forEach(d => { driverMap[d.number] = d; });
      setDrivers(driverMap);
      setRace(data.race || "");
      setCircuitName(data.circuit_name || "");
      setCircuitInfo(data.circuit_info || "");
      setTrack(data.track || []);
      setSvgUrl(data.svg_url || null);
      setPitStops(data.pit_events || []);
      setLeaderboard(data.leaderboard || []);
      setCars(data.cars || []);
      setIsLive(data.is_live || false);
      setCurrentLap(data.current_lap || 1);
      setLoading(false);
    } catch (e) {
      console.warn("Live fetch:", e.message);
    }
  }, []);

  useEffect(() => {
    if (liveRef.current) clearInterval(liveRef.current);
    setCars([]); setError(null);
    if (mode === "replay") {
      setIsLive(false);
      loadReplay(selectedKey);
    } else {
      setLoading(true);
      setLoadingMsg("Connecting to live feed...");
      loadLive();
      liveRef.current = setInterval(loadLive, 3000);
    }
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, [mode, selectedKey]);

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

  useEffect(() => {
    if (mode !== "replay" || !snapshots.length) return;
    const snap = snapshots[Math.floor(snapIndex)];
    if (snap) { setCars(snap.cars || []); setCurrentLap(snap.lap || 1); }
  }, [snapIndex, snapshots, mode]);

  const progress = snapshots.length ? (snapIndex / snapshots.length) * 100 : 0;

  return (
    <div style={{ background:"#060910", minHeight:"100vh", color:"#fff", padding:20, fontFamily:"'Courier New', monospace" }}>
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:10, flexWrap:"wrap" }}>
        <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:"0.08em", color:"#e2e8f0", margin:0 }}>F1 RACE DASHBOARD</h1>
        <span style={{ fontSize:12, color:"#475569" }}>{race}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button onClick={() => { setMode("replay"); setSelectedKey(null); }} style={btnStyle(mode==="replay"?"#f59e0b":"#1e2d3d")}>⏪ REPLAY</button>
          <button onClick={() => setMode("live")} style={btnStyle(mode==="live"?"#22c55e":"#1e2d3d")}>{isLive?"🔴 LIVE":"📡 LATEST"}</button>
          {mode==="replay" && <button onClick={() => setShowSessions(s=>!s)} style={btnStyle("#6366f1")}>🗓 RACES</button>}
        </div>
      </div>

      {showSessions && mode==="replay" && (
        <div style={{ background:"#0d1117", border:"1px solid #1e2530", borderRadius:10, padding:12, marginBottom:12, maxHeight:200, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:"#475569", marginBottom:8, letterSpacing:"0.1em" }}>SELECT RACE — {sessions.length} available</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {sessions.map(s => (
              <button key={s.session_key} onClick={() => { setSelectedKey(s.session_key); setShowSessions(false); }}
                style={{ background:selectedKey===s.session_key?"#1e3a5f":"#111827", border:`1px solid ${selectedKey===s.session_key?"#3b82f6":"#1e2530"}`, color:selectedKey===s.session_key?"#60a5fa":"#94a3b8", padding:"4px 10px", borderRadius:6, fontSize:10, cursor:"pointer", fontFamily:"'Courier New', monospace" }}>
                {s.year} · {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode==="replay" && !loading && (
        <div style={{ display:"flex", gap:10, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={() => setPlaying(p=>!p)} style={btnStyle("#22c55e")}>{playing?"⏸ PAUSE":"▶ PLAY"}</button>
          {[1,2,4,8].map(s => <button key={s} onClick={() => setSpeed(s)} style={btnStyle(speed===s?"#f59e0b":"#1e2d3d")}>×{s}</button>)}
          <span style={{ fontSize:11, color:"#334155", marginLeft:8 }}>LAP <span style={{ color:"#94a3b8" }}>{currentLap}</span> / {totalLaps}</span>
          <span style={{ fontSize:10, color:"#1e2d3d", marginLeft:"auto" }}>{snapshots.length} frames · {Object.keys(drivers).length} drivers</span>
        </div>
      )}

      {mode==="live" && !loading && (
        <div style={{ display:"flex", gap:12, marginBottom:10, alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:isLive?"rgba(34,197,94,0.1)":"rgba(71,85,105,0.1)", border:`1px solid ${isLive?"#22c55e":"#334155"}`, borderRadius:20, padding:"4px 12px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:isLive?"#22c55e":"#475569", animation:isLive?"pulse 1.5s infinite":"none" }}/>
            <span style={{ fontSize:11, color:isLive?"#22c55e":"#475569", fontWeight:700 }}>{isLive?"LIVE":"LATEST SESSION"}</span>
          </div>
          <span style={{ fontSize:11, color:"#334155" }}>LAP <span style={{ color:"#94a3b8" }}>{currentLap}</span> · {cars.length} cars · updates every 3s</span>
        </div>
      )}

      {mode==="replay" && (
        <div style={{ width:"100%", height:3, background:"#0f1923", borderRadius:2, marginBottom:18 }}>
          <div style={{ width:`${progress}%`, height:"100%", background:"linear-gradient(90deg,#22c55e,#00ff88)", borderRadius:2, transition:"width 0.05s linear" }}/>
        </div>
      )}

      {loading && (
        <div style={{ textAlign:"center", marginTop:80 }}>
          <div style={{ fontSize:12, color:"#22c55e", letterSpacing:"0.15em", marginBottom:8 }}>⏳ {loadingMsg}</div>
          <div style={{ fontSize:10, color:"#1e2d3d" }}>Powered by OpenF1</div>
        </div>
      )}

      {error && (
        <div style={{ color:"#e8002d", fontSize:12, marginTop:40, textAlign:"center", background:"#1a0a0a", border:"1px solid #3a1010", borderRadius:8, padding:"16px 24px" }}>
          ⚠ {error}
          <br/>
          <button onClick={() => loadReplay(selectedKey)} style={{ ...btnStyle("#e8002d"), marginTop:12, fontSize:10 }}>RETRY</button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <Track track={track} svgUrl={svgUrl} cars={cars} circuitName={circuitName} circuitInfo={circuitInfo} lapInfo={`LAP ${currentLap}/${totalLaps}`}/>
          </div>
          <div style={{ width:255, flexShrink:0, display:"flex", flexDirection:"column", gap:14 }}>
            <Leaderboard cars={cars} results={leaderboard} drivers={drivers} mode={mode==="live"&&isLive?"live":"replay"}/>
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>PIT STOPS</div>
              <div style={{ maxHeight:140, overflowY:"auto", padding:"4px 0" }}>
                {pitStops.slice(0,20).map((p,i) => (
                  <div key={i} style={eventRowStyle}>
                    <span style={{ color:"#eab308" }}>LAP {p.lap}</span>
                    <span style={{ color:"#1e2d3d" }}>·</span>
                    <span style={{ color:"#94a3b8" }}>CAR {p.driver}</span>
                    {p.duration && <span style={{ color:"#475569" }}>{parseFloat(p.duration).toFixed(1)}s</span>}
                  </div>
                ))}
                {!pitStops.length && <div style={{ color:"#1e2d3d", fontSize:11, padding:"8px 14px" }}>No pit stops</div>}
              </div>
            </div>
            {mode==="replay" && overtakes.length > 0 && (
              <div style={panelStyle}>
                <div style={panelHeaderStyle}>OVERTAKES</div>
                <div style={{ maxHeight:160, overflowY:"auto", padding:"4px 0" }}>
                  {overtakes.slice(0,30).map((o,i) => (
                    <div key={i} style={eventRowStyle}>
                      <span style={{ color:"#a855f7" }}>LAP {o.lap}</span>
                      <span style={{ color:"#1e2d3d" }}>·</span>
                      <span style={{ color:"#94a3b8" }}>CAR {o.driver}</span>
                      <span style={{ color:"#334155" }}>P{o.from}→P{o.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

const btnStyle = c => ({ background:"transparent", border:`1px solid ${c}`, color:c, padding:"5px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", letterSpacing:"0.08em", fontFamily:"'Courier New', monospace" });
const panelStyle       = { background:"#0d1117", borderRadius:10, border:"1px solid #1e2530", overflow:"hidden" };
const panelHeaderStyle = { background:"#111827", padding:"8px 14px", borderBottom:"1px solid #1e2530", fontSize:10, fontWeight:700, color:"#334155", letterSpacing:"0.12em" };
const eventRowStyle    = { display:"flex", gap:8, padding:"4px 14px", fontSize:11, borderBottom:"1px solid #0a0f16", fontFamily:"'Courier New', monospace" };
