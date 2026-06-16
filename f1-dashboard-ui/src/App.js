import { useEffect, useState, useRef, useCallback } from "react";
import Track from "./Track";
import Leaderboard from "./Leaderboard";

const API = "https://epomenisf1-1.onrender.com";

// How many ms between each position frame (OpenF1 = 3.7Hz = ~270ms)
const FRAME_INTERVAL_MS = 270;

export default function App() {
  const [mode, setMode]               = useState("replay");
  const [sessions, setSessions]       = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedName, setSelectedName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Race metadata
  const [track, setTrack]             = useState([]);
  const [svgUrl, setSvgUrl]           = useState(null);
  const [drivers, setDrivers]         = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [pitStops, setPitStops]       = useState([]);
  const [race, setRace]               = useState("");
  const [circuitName, setCircuitName] = useState("");
  const [circuitInfo, setCircuitInfo] = useState("");
  const [totalLaps, setTotalLaps]     = useState(66);
  const [sessionKey, setSessionKey]   = useState(null);

  // Animation state
  const [cars, setCars]               = useState([]);
  const [currentLap, setCurrentLap]   = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [playing, setPlaying]         = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [loading, setLoading]         = useState(true);
  const [lapLoading, setLapLoading]   = useState(false);
  const [loadingMsg, setLoadingMsg]   = useState("Connecting...");
  const [error, setError]             = useState(null);

  // Live mode
  const [isLive, setIsLive]           = useState(false);
  const liveRef = useRef(null);

  // Animation refs
  const framesRef    = useRef([]);   // current lap frames
  const frameIdxRef  = useRef(0);
  const animRef      = useRef(null);
  const lapRef       = useRef(1);
  const playingRef   = useRef(false);
  const speedRef     = useRef(1);
  const sessionRef   = useRef(null);
  const driversRef   = useRef([]);
  const nextLapRef   = useRef(null); // pre-fetched next lap frames

  // Keep refs in sync
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Load sessions on mount
  useEffect(() => {
    fetch(`${API}/replay/sessions`)
      .then(r => r.json())
      .then(d => {
        const list = d.sessions || [];
        setSessions(list);
        if (list.length > 0) {
          const latest = list[list.length - 1];
          setSelectedKey(latest.session_key);
          setSelectedName(`${latest.year} · ${latest.name}`);
        }
      })
      .catch(e => console.warn("Sessions:", e));
  }, []);

  // Pre-fetch next lap in background
  const prefetchLap = useCallback(async (key, lap, driverList) => {
    if (lap > totalLaps) return;
    try {
      const driversParam = encodeURIComponent(JSON.stringify(driverList));
      const res  = await fetch(`${API}/replay/lap/${key}/${lap}?drivers=${driversParam}`);
      const data = await res.json();
      nextLapRef.current = data.frames || [];
    } catch (e) {
      console.warn(`Prefetch lap ${lap}:`, e);
    }
  }, [totalLaps]);

  // Load a lap and start animation
  const loadAndPlayLap = useCallback(async (key, lap, driverList, useCache = false) => {
    setLapLoading(true);
    lapRef.current = lap;
    setCurrentLap(lap);
    frameIdxRef.current = 0;

    let frames;

    // Use pre-fetched data if available
    if (useCache && nextLapRef.current?.length > 0) {
      frames = nextLapRef.current;
      nextLapRef.current = null;
    } else {
      try {
        const driversParam = encodeURIComponent(JSON.stringify(driverList));
        const res  = await fetch(`${API}/replay/lap/${key}/${lap}?drivers=${driversParam}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        frames = data.frames || [];
      } catch (e) {
        console.warn(`Load lap ${lap}:`, e.message);
        frames = [];
      }
    }

    framesRef.current = frames;
    setTotalFrames(frames.length);
    setLapLoading(false);

    // Show first frame immediately
    if (frames.length > 0) {
      setCars(frames[0].cars || []);
    }

    // Start pre-fetching next lap
    if (lap < lapRef.current + 1) {
      prefetchLap(key, lap + 1, driverList);
    }
  }, [prefetchLap]);

  // Animation loop
  const startAnimation = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);

    let lastTime = null;
    const frameMs = FRAME_INTERVAL_MS;

    function tick(timestamp) {
      if (!playingRef.current) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!lastTime) lastTime = timestamp;
      const elapsed = timestamp - lastTime;
      const step    = elapsed / (frameMs / speedRef.current);

      if (step >= 1) {
        lastTime = timestamp;
        const frames = framesRef.current;
        const idx    = frameIdxRef.current;

        if (idx < frames.length) {
          const frame = frames[idx];
          if (frame?.cars) setCars(frame.cars);
          frameIdxRef.current = idx + 1;
          setCurrentFrame(idx + 1);
        } else {
          // Lap finished — load next lap
          const nextLap = lapRef.current + 1;
          if (nextLap <= sessionRef.current?.total_laps) {
            loadAndPlayLap(
              sessionRef.current.session_key,
              nextLap,
              driversRef.current,
              true  // use cache
            );
          } else {
            // Race finished
            playingRef.current = false;
            setPlaying(false);
          }
        }
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
  }, [loadAndPlayLap]);

  // Load replay metadata
  const loadReplay = useCallback(async (key = null) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setLoading(true); setError(null); setCars([]); setPlaying(false);
    setLoadingMsg("Loading race info...");
    frameIdxRef.current = 0;
    framesRef.current   = [];
    nextLapRef.current  = null;

    try {
      const url  = key ? `${API}/replay/session/${key}` : `${API}/replay/latest`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      sessionRef.current = data;
      driversRef.current = data.drivers || [];

      setTrack(data.track || []);
      setSvgUrl(data.svg_url || null);
      setDrivers(data.drivers || []);
      setLeaderboard(data.leaderboard || []);
      setPitStops(data.pit_events || []);
      setRace(data.race || "");
      setCircuitName(data.circuit_name || "");
      setCircuitInfo(data.circuit_info || "");
      setTotalLaps(data.total_laps || 66);
      setSessionKey(data.session_key);
      setCurrentLap(1);
      lapRef.current = 1;

      setLoadingMsg("Loading lap 1 positions...");

      // Load lap 1
      await loadAndPlayLap(data.session_key, 1, data.drivers || []);

      setLoading(false);
      setPlaying(true);
      playingRef.current = true;
      startAnimation();

    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [loadAndPlayLap, startAnimation]);

  // Live mode
  const loadLive = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/live`);
      const data = await res.json();
      if (data.error) return;
      const driverMap = {};
      (data.drivers || []).forEach(d => { driverMap[d.number] = d; });
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
      console.warn("Live:", e.message);
    }
  }, []);

  // Switch mode/race
  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
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

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (liveRef.current) clearInterval(liveRef.current);
    };
  }, [mode, selectedKey]);

  // Jump to lap manually
  const jumpToLap = useCallback(async (lap) => {
    if (!sessionRef.current) return;
    setPlaying(false);
    playingRef.current = false;
    frameIdxRef.current = 0;
    nextLapRef.current  = null;
    await loadAndPlayLap(sessionRef.current.session_key, lap, driversRef.current);
    setPlaying(true);
    playingRef.current = true;
  }, [loadAndPlayLap]);

  // Scrubber
  const scrubToFrame = (pct) => {
    const frames = framesRef.current;
    const idx    = Math.floor(pct * frames.length);
    frameIdxRef.current = idx;
    setCurrentFrame(idx);
    if (frames[idx]?.cars) setCars(frames[idx].cars);
    setPlaying(false);
    playingRef.current = false;
  };

  const lapProgress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;
  const raceProgress = totalLaps > 0 ? ((currentLap - 1) / totalLaps) * 100 : 0;

  const sessionsByYear = sessions.reduce((acc, s) => {
    const y = s.year || "?";
    if (!acc[y]) acc[y] = [];
    acc[y].push(s);
    return acc;
  }, {});

  const driverMap = {};
  drivers.forEach(d => { driverMap[d.number] = d; });

  return (
    <div style={{ background:"#060910", minHeight:"100vh", color:"#fff", padding:20, fontFamily:"'Courier New', monospace" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:12, flexWrap:"wrap" }}>
        <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:"0.08em", color:"#e2e8f0", margin:0 }}>
          F1 RACE DASHBOARD
        </h1>
        <span style={{ fontSize:12, color:"#475569" }}>{race}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button onClick={() => { setMode("replay"); }} style={btnStyle(mode==="replay"?"#f59e0b":"#1e2d3d")}>⏪ REPLAY</button>
          <button onClick={() => setMode("live")}       style={btnStyle(mode==="live"?"#22c55e":"#1e2d3d")}>{isLive?"🔴 LIVE":"📡 LATEST"}</button>
        </div>
      </div>

      {/* Race selector */}
      {mode === "replay" && (
        <div style={{ position:"relative", marginBottom:12 }}>
          <button onClick={() => setShowDropdown(d => !d)} style={{
            background:"#0d1117", border:"1px solid #1e2530", color:"#e2e8f0",
            padding:"8px 16px", borderRadius:8, fontSize:12, cursor:"pointer",
            fontFamily:"'Courier New', monospace", display:"flex", alignItems:"center",
            gap:10, width:"100%", maxWidth:480,
          }}>
            <span style={{ color:"#475569", fontSize:10 }}>RACE</span>
            <span style={{ flex:1, textAlign:"left" }}>{selectedName || "Select a race..."}</span>
            <span style={{ color:"#475569" }}>{showDropdown?"▲":"▼"}</span>
          </button>

          {showDropdown && (
            <div style={{
              position:"absolute", top:"110%", left:0, zIndex:100,
              background:"#0d1117", border:"1px solid #1e2530", borderRadius:8,
              width:"100%", maxWidth:480, maxHeight:300, overflowY:"auto",
              boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
            }}>
              {Object.entries(sessionsByYear).sort(([a],[b]) => Number(b)-Number(a)).map(([year, races]) => (
                <div key={year}>
                  <div style={{ padding:"6px 14px", fontSize:10, color:"#475569", background:"#111827", borderBottom:"1px solid #1e2530", letterSpacing:"0.1em" }}>
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
                        color: selectedKey===s.session_key?"#60a5fa":"#94a3b8",
                        background: selectedKey===s.session_key?"#1e3a5f":"transparent",
                        borderBottom:"1px solid #0a0f16",
                        display:"flex", justifyContent:"space-between",
                      }}>
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

      {/* Replay controls */}
      {mode === "replay" && !loading && (
        <>
          <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center", flexWrap:"wrap" }}>
            <button onClick={() => { setPlaying(p => { playingRef.current = !p; return !p; })} } style={btnStyle("#22c55e")}>
              {playing?"⏸ PAUSE":"▶ PLAY"}
            </button>
            {[1,2,4,8].map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={btnStyle(speed===s?"#f59e0b":"#1e2d3d")}>×{s}</button>
            ))}
            <span style={{ fontSize:11, color:"#334155", marginLeft:4 }}>
              LAP <span style={{ color:"#94a3b8" }}>{currentLap}</span> / {totalLaps}
            </span>
            {lapLoading && <span style={{ fontSize:10, color:"#22c55e" }}>⟳ loading lap...</span>}
          </div>

          {/* Lap scrubber */}
          <div style={{ marginBottom:4 }}>
            <div style={{ fontSize:9, color:"#334155", marginBottom:3 }}>LAP PROGRESS</div>
            <div style={{ width:"100%", height:5, background:"#0f1923", borderRadius:3, cursor:"pointer", position:"relative" }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                scrubToFrame((e.clientX - rect.left) / rect.width);
              }}>
              <div style={{ width:`${lapProgress}%`, height:"100%", background:"linear-gradient(90deg,#22c55e,#00ff88)", borderRadius:3 }}/>
            </div>
          </div>

          {/* Race progress */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, color:"#334155", marginBottom:3 }}>RACE PROGRESS</div>
            <div style={{ width:"100%", height:3, background:"#0f1923", borderRadius:2, position:"relative", cursor:"pointer" }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const lap  = Math.max(1, Math.round(((e.clientX - rect.left) / rect.width) * totalLaps));
                jumpToLap(lap);
              }}>
              <div style={{ width:`${raceProgress}%`, height:"100%", background:"#3b82f6", borderRadius:2 }}/>
              {/* Lap markers */}
              {pitStops.filter((p,i,a) => a.findIndex(x=>x.lap===p.lap&&x.driver===p.driver)===i).slice(0,20).map((p,i) => (
                <div key={i} title={`Lap ${p.lap} pit`} style={{
                  position:"absolute", top:"50%", transform:"translate(-50%,-50%)",
                  left:`${(p.lap/totalLaps)*100}%`,
                  width:4, height:4, borderRadius:"50%", background:"#f59e0b", zIndex:2,
                }}/>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Live status */}
      {mode === "live" && !loading && (
        <div style={{ display:"flex", gap:12, marginBottom:14, alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:isLive?"rgba(34,197,94,0.1)":"rgba(71,85,105,0.1)", border:`1px solid ${isLive?"#22c55e":"#334155"}`, borderRadius:20, padding:"4px 12px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:isLive?"#22c55e":"#475569", animation:isLive?"pulse 1.5s infinite":"none" }}/>
            <span style={{ fontSize:11, color:isLive?"#22c55e":"#475569", fontWeight:700 }}>{isLive?"LIVE":"LATEST SESSION"}</span>
          </div>
          <span style={{ fontSize:11, color:"#334155" }}>LAP <span style={{ color:"#94a3b8" }}>{currentLap}</span> · {cars.length} cars</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign:"center", marginTop:80 }}>
          <div style={{ fontSize:12, color:"#22c55e", letterSpacing:"0.15em", marginBottom:8 }}>⏳ {loadingMsg}</div>
          <div style={{ fontSize:10, color:"#1e2d3d" }}>Powered by OpenF1 · 3.7Hz position data</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color:"#e8002d", fontSize:12, marginTop:40, textAlign:"center", background:"#1a0a0a", border:"1px solid #3a1010", borderRadius:8, padding:"16px 24px" }}>
          ⚠ {error}
          <br/>
          <button onClick={() => loadReplay(selectedKey)} style={{ ...btnStyle("#e8002d"), marginTop:12, fontSize:10 }}>RETRY</button>
        </div>
      )}

      {/* Main layout */}
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
            <Leaderboard cars={cars} results={leaderboard} drivers={driverMap} mode={mode==="live"&&isLive?"live":"replay"}/>

            {/* Pit stops */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>PIT STOPS</div>
              <div style={{ maxHeight:200, overflowY:"auto", padding:"4px 0" }}>
                {pitStops.slice(0,20).map((p,i) => {
                  const driver = driverMap[p.driver] || {};
                  return (
                    <div key={i} style={{ ...eventRowStyle, borderLeft:`2px solid ${driver.color||"#334155"}` }}>
                      <span style={{ color:"#eab308" }}>L{p.lap}</span>
                      <span style={{ color: driver.color||"#94a3b8", fontWeight:700 }}>{driver.short||`#${p.driver}`}</span>
                      {p.duration && p.duration < 60 && <span style={{ color:"#475569" }}>{parseFloat(p.duration).toFixed(1)}s</span>}
                    </div>
                  );
                })}
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
const eventRowStyle    = { display:"flex", gap:8, padding:"4px 12px", fontSize:11, borderBottom:"1px solid #0a0f16", fontFamily:"'Courier New', monospace", alignItems:"center" };
