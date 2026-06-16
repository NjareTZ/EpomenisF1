import { useEffect, useState, useRef, useCallback } from "react";
import Track from "./Track";
import Leaderboard from "./Leaderboard";

const API = "https://epomenisf1-1.onrender.com";

const HIGHLIGHT_ICONS = {
  race_start:  "🚦",
  overtake:    "⚡",
  pit_stop:    "🔧",
  race_finish: "🏁",
};

export default function App() {
  const [mode, setMode]               = useState("replay");
  const [sessions, setSessions]       = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedName, setSelectedName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [track, setTrack]             = useState([]);
  const [svgUrl, setSvgUrl]           = useState(null);
  const [drivers, setDrivers]         = useState({});
  const [highlights, setHighlights]   = useState([]);
  const [hlIndex, setHlIndex]         = useState(0);
  const [cars, setCars]               = useState([]);
  const [pitStops, setPitStops]       = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [race, setRace]               = useState("");
  const [circuitName, setCircuitName] = useState("");
  const [circuitInfo, setCircuitInfo] = useState("");
  const [playing, setPlaying]         = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [loading, setLoading]         = useState(true);
  const [loadingMsg, setLoadingMsg]   = useState("Connecting...");
  const [error, setError]             = useState(null);
  const [isLive, setIsLive]           = useState(false);
  const [currentLap, setCurrentLap]   = useState(1);
  const [totalLaps, setTotalLaps]     = useState(70);
  const liveRef = useRef(null);
  const playRef = useRef(null);

  // Group sessions by year for the dropdown
  const sessionsByYear = sessions.reduce((acc, s) => {
    const y = s.year || "Unknown";
    if (!acc[y]) acc[y] = [];
    acc[y].push(s);
    return acc;
  }, {});

  // Load sessions list on mount
  useEffect(() => {
    fetch(`${API}/replay/sessions`)
      .then(r => r.json())
      .then(d => {
        const list = d.sessions || [];
        setSessions(list);
        // Auto-select most recent
        if (list.length > 0 && !selectedKey) {
          const latest = list[list.length - 1];
          setSelectedKey(latest.session_key);
          setSelectedName(`${latest.year} · ${latest.name}`);
        }
      })
      .catch(e => console.warn("Sessions:", e));
  }, []);

  const applyReplay = useCallback((data) => {
    const driverMap = {};
    (data.drivers || []).forEach(d => { driverMap[d.number] = d; });
    setDrivers(driverMap);
    setTrack(data.track || []);
    setSvgUrl(data.svg_url || null);
    setPitStops(data.pit_events || []);
    setLeaderboard(data.leaderboard || []);
    setRace(data.race || "");
    setCircuitName(data.circuit_name || "");
    setCircuitInfo(data.circuit_info || "");
    setTotalLaps(data.total_laps || 70);
    setHighlights(data.highlights || []);
    setHlIndex(0);
    if (data.highlights?.length > 0) setCars(data.highlights[0].cars || []);
    setLoading(false);
    setPlaying(true);
  }, []);

  const loadReplay = useCallback(async (sessionKey = null) => {
    setLoading(true); setError(null); setCars([]); setHighlights([]);
    setLoadingMsg("Loading race highlights from OpenF1...");
    try {
      const url  = sessionKey
        ? `${API}/replay/session/${sessionKey}`
        : `${API}/replay/latest`;
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

  // Switch mode or selected race
  useEffect(() => {
    if (liveRef.current) clearInterval(liveRef.current);
    if (playRef.current) clearInterval(playRef.current);
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
    return () => {
      if (liveRef.current) clearInterval(liveRef.current);
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [mode, selectedKey]);

  // Auto-advance highlights
  useEffect(() => {
    if (playRef.current) clearInterval(playRef.current);
    if (mode !== "replay" || !playing || !highlights.length) return;
    const delay = Math.max(500, 3000 / speed);
    playRef.current = setInterval(() => {
      setHlIndex(prev => {
        const next = prev + 1;
        if (next >= highlights.length) { setPlaying(false); return prev; }
        return next;
      });
    }, delay);
    return () => clearInterval(playRef.current);
  }, [mode, playing, speed, highlights.length]);

  // Update cars from highlight
  useEffect(() => {
    if (mode !== "replay" || !highlights.length) return;
    const hl = highlights[hlIndex];
    if (hl) { setCars(hl.cars || []); setCurrentLap(hl.lap || 1); }
  }, [hlIndex, highlights, mode]);

  const currentHighlight = highlights[hlIndex];
  const progress = highlights.length ? (hlIndex / (highlights.length - 1)) * 100 : 0;

  return (
    <div style={{ background:"#060910", minHeight:"100vh", color:"#fff", padding:20, fontFamily:"'Courier New', monospace" }}>

      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14, flexWrap:"wrap" }}>
        <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:"0.08em", color:"#e2e8f0", margin:0 }}>
          F1 RACE DASHBOARD
        </h1>

        {/* Mode toggle */}
        <div style={{ display:"flex", gap:8, marginLeft:"auto" }}>
          <button onClick={() => setMode("replay")}
            style={btnStyle(mode==="replay" ? "#f59e0b" : "#1e2d3d")}>
            ⏪ REPLAY
          </button>
          <button onClick={() => setMode("live")}
            style={btnStyle(mode==="live" ? "#22c55e" : "#1e2d3d")}>
            {isLive ? "🔴 LIVE" : "📡 LATEST"}
          </button>
        </div>
      </div>

      {/* ── Race selector dropdown ── */}
      {mode === "replay" && (
        <div style={{ position:"relative", marginBottom:14 }}>
          <button
            onClick={() => setShowDropdown(d => !d)}
            style={{
              background:"#0d1117", border:"1px solid #1e2530",
              color:"#e2e8f0", padding:"8px 16px", borderRadius:8,
              fontSize:12, cursor:"pointer", fontFamily:"'Courier New', monospace",
              display:"flex", alignItems:"center", gap:10, width:"100%", maxWidth:500,
            }}>
            <span style={{ color:"#475569", fontSize:10 }}>RACE</span>
            <span style={{ flex:1, textAlign:"left" }}>{selectedName || "Select a race..."}</span>
            <span style={{ color:"#475569" }}>{showDropdown ? "▲" : "▼"}</span>
          </button>

          {showDropdown && (
            <div style={{
              position:"absolute", top:"110%", left:0, zIndex:100,
              background:"#0d1117", border:"1px solid #1e2530",
              borderRadius:8, width:"100%", maxWidth:500,
              maxHeight:320, overflowY:"auto",
              boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
            }}>
              {Object.entries(sessionsByYear)
                .sort(([a],[b]) => Number(b) - Number(a))
                .map(([year, races]) => (
                  <div key={year}>
                    <div style={{
                      padding:"6px 14px", fontSize:10, color:"#475569",
                      background:"#111827", letterSpacing:"0.1em",
                      borderBottom:"1px solid #1e2530",
                    }}>
                      {year} SEASON — {races.length} races
                    </div>
                    {races.slice().reverse().map(s => (
                      <div key={s.session_key}
                        onClick={() => {
                          setSelectedKey(s.session_key);
                          setSelectedName(`${s.year} · ${s.name}`);
                          setShowDropdown(false);
                        }}
                        style={{
                          padding:"8px 14px", fontSize:11, cursor:"pointer",
                          color: selectedKey === s.session_key ? "#60a5fa" : "#94a3b8",
                          background: selectedKey === s.session_key ? "#1e3a5f" : "transparent",
                          borderBottom:"1px solid #0a0f16",
                          display:"flex", justifyContent:"space-between",
                          transition:"background 0.1s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background="#111827"}
                        onMouseLeave={e => e.currentTarget.style.background = selectedKey === s.session_key ? "#1e3a5f" : "transparent"}
                      >
                        <span>{s.name}</span>
                        <span style={{ color:"#334155", fontSize:10 }}>{s.date}</span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Replay controls ── */}
      {mode === "replay" && !loading && (
        <>
          {/* Highlight banner */}
          {currentHighlight && (
            <div style={{
              background:"#111827", border:"1px solid #1e2530",
              borderRadius:8, padding:"8px 14px", marginBottom:10,
              display:"flex", alignItems:"center", gap:12,
            }}>
              <span style={{ fontSize:16 }}>{HIGHLIGHT_ICONS[currentHighlight.type] || "📍"}</span>
              <span style={{ fontSize:12, color:"#e2e8f0", flex:1 }}>{currentHighlight.description}</span>
              <span style={{ fontSize:10, color:"#475569" }}>{hlIndex + 1} / {highlights.length}</span>
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
            <button onClick={() => setHlIndex(i => Math.max(0, i-1))} style={btnStyle("#475569")}>⏮</button>
            <button onClick={() => setPlaying(p => !p)} style={btnStyle("#22c55e")}>{playing ? "⏸ PAUSE" : "▶ PLAY"}</button>
            <button onClick={() => setHlIndex(i => Math.min(highlights.length-1, i+1))} style={btnStyle("#475569")}>⏭</button>
            {[1,2,4].map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={btnStyle(speed===s ? "#f59e0b" : "#1e2d3d")}>×{s}</button>
            ))}
            <span style={{ fontSize:11, color:"#334155", marginLeft:4 }}>
              LAP <span style={{ color:"#94a3b8" }}>{currentLap}</span> / {totalLaps}
            </span>
          </div>

          {/* Progress bar with markers */}
          <div style={{ width:"100%", height:6, background:"#0f1923", borderRadius:3, marginBottom:10, position:"relative", cursor:"pointer" }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct  = (e.clientX - rect.left) / rect.width;
              const idx  = Math.round(pct * (highlights.length - 1));
              setHlIndex(Math.max(0, Math.min(highlights.length-1, idx)));
              setPlaying(false);
            }}>
            <div style={{ width:`${progress}%`, height:"100%", background:"linear-gradient(90deg,#22c55e,#00ff88)", borderRadius:3 }}/>
            {highlights.map((hl, i) => (
              <div key={i} title={hl.description}
                style={{
                  position:"absolute", top:"50%", transform:"translate(-50%,-50%)",
                  left:`${(i / (highlights.length-1||1)) * 100}%`,
                  width:8, height:8, borderRadius:"50%", cursor:"pointer",
                  background: hl.type==="race_start" ? "#22c55e" : hl.type==="race_finish" ? "#f59e0b" : hl.type==="overtake" ? "#a855f7" : "#3b82f6",
                  border: i===hlIndex ? "2px solid #fff" : "2px solid #060910",
                  zIndex:2,
                }}
              />
            ))}
          </div>

          {/* Highlight type filters */}
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {["race_start","overtake","pit_stop","race_finish"].map(type => {
              const count = highlights.filter(h => h.type===type).length;
              if (!count) return null;
              return (
                <button key={type}
                  onClick={() => {
                    const idx = highlights.findIndex(h => h.type===type);
                    if (idx >= 0) { setHlIndex(idx); setPlaying(false); }
                  }}
                  style={{
                    background:"#0d1117", border:"1px solid #1e2530",
                    color:"#64748b", padding:"3px 10px", borderRadius:20,
                    fontSize:10, cursor:"pointer", fontFamily:"monospace",
                  }}>
                  {HIGHLIGHT_ICONS[type]} {type.replace("_"," ")} ({count})
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Live status ── */}
      {mode === "live" && !loading && (
        <div style={{ display:"flex", gap:12, marginBottom:14, alignItems:"center" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            background: isLive ? "rgba(34,197,94,0.1)" : "rgba(71,85,105,0.1)",
            border:`1px solid ${isLive ? "#22c55e" : "#334155"}`,
            borderRadius:20, padding:"4px 12px",
          }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background: isLive ? "#22c55e" : "#475569", animation: isLive ? "pulse 1.5s infinite" : "none" }}/>
            <span style={{ fontSize:11, color: isLive ? "#22c55e" : "#475569", fontWeight:700 }}>
              {isLive ? "LIVE" : "LATEST SESSION"}
            </span>
          </div>
          <span style={{ fontSize:11, color:"#334155" }}>
            LAP <span style={{ color:"#94a3b8" }}>{currentLap}</span> · {cars.length} cars · updates every 3s
          </span>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign:"center", marginTop:80 }}>
          <div style={{ fontSize:12, color:"#22c55e", letterSpacing:"0.15em", marginBottom:8 }}>⏳ {loadingMsg}</div>
          <div style={{ fontSize:10, color:"#1e2d3d" }}>Powered by OpenF1</div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ color:"#e8002d", fontSize:12, marginTop:40, textAlign:"center", background:"#1a0a0a", border:"1px solid #3a1010", borderRadius:8, padding:"16px 24px" }}>
          ⚠ {error}
          <br/>
          <button onClick={() => loadReplay(selectedKey)} style={{ ...btnStyle("#e8002d"), marginTop:12, fontSize:10 }}>RETRY</button>
        </div>
      )}

      {/* ── Main layout ── */}
      {!loading && !error && (
        <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <Track
              track={track} svgUrl={svgUrl} cars={cars}
              circuitName={circuitName} circuitInfo={circuitInfo}
              lapInfo={`LAP ${currentLap}/${totalLaps}`}
            />
          </div>

          <div style={{ width:255, flexShrink:0, display:"flex", flexDirection:"column", gap:14 }}>
            <Leaderboard cars={cars} results={leaderboard} drivers={drivers} mode={mode==="live"&&isLive?"live":"replay"}/>

            {/* Highlights list */}
            {mode === "replay" && highlights.length > 0 && (
              <div style={panelStyle}>
                <div style={panelHeaderStyle}>HIGHLIGHTS ({highlights.length})</div>
                <div style={{ maxHeight:260, overflowY:"auto" }}>
                  {highlights.map((hl, i) => (
                    <div key={i}
                      onClick={() => { setHlIndex(i); setPlaying(false); }}
                      style={{
                        display:"flex", alignItems:"center", gap:8,
                        padding:"7px 12px", borderBottom:"1px solid #0a0f16",
                        cursor:"pointer",
                        background: i===hlIndex ? "#111827" : "transparent",
                      }}>
                      <span style={{ fontSize:11 }}>{HIGHLIGHT_ICONS[hl.type]||"📍"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:10, color: i===hlIndex ? "#e2e8f0" : "#64748b", lineHeight:1.3 }}>
                          {hl.description}
                        </div>
                        <div style={{ fontSize:9, color:"#334155", marginTop:1 }}>Lap {hl.lap}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pit stops */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>PIT STOPS</div>
              <div style={{ maxHeight:140, overflowY:"auto", padding:"4px 0" }}>
                {pitStops.slice(0,10).map((p,i) => (
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
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0a0f16}
        ::-webkit-scrollbar-thumb{background:#1e2530;border-radius:2px}
      `}</style>
    </div>
  );
}

const btnStyle = c => ({
  background:"transparent", border:`1px solid ${c}`, color:c,
  padding:"5px 12px", borderRadius:6, fontSize:11, fontWeight:700,
  cursor:"pointer", letterSpacing:"0.08em", fontFamily:"'Courier New', monospace",
});
const panelStyle       = { background:"#0d1117", borderRadius:10, border:"1px solid #1e2530", overflow:"hidden" };
const panelHeaderStyle = { background:"#111827", padding:"8px 14px", borderBottom:"1px solid #1e2530", fontSize:10, fontWeight:700, color:"#334155", letterSpacing:"0.12em" };
const eventRowStyle    = { display:"flex", gap:8, padding:"4px 14px", fontSize:11, borderBottom:"1px solid #0a0f16", fontFamily:"'Courier New', monospace" };
