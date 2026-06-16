import { useMemo, useState, useEffect } from "react";

const SECTOR_COLORS = ["#a855f7", "#22c55e", "#eab308"];
const VW = 900, VH = 620;
const PAD = 60;

function normalize(track) {
  if (!track?.length) return { pts:[], scale:1, minX:0, minY:0, offsetX:0, offsetY:0 };
  const xs = track.map(p=>p.x), ys = track.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const rangeX=maxX-minX||1, rangeY=maxY-minY||1;
  const scale=Math.min((VW-PAD*2)/rangeX,(VH-PAD*2)/rangeY);
  const offsetX=(VW-rangeX*scale)/2, offsetY=(VH-rangeY*scale)/2;
  return {
    pts: track.map(p=>({ sx:offsetX+(p.x-minX)*scale, sy:offsetY+(p.y-minY)*scale })),
    scale, minX, minY, offsetX, offsetY
  };
}

function ptsToString(pts) {
  return pts.map(p=>`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
}

function detectTurns(pts, minSpacing=55) {
  const turns=[];
  for(let i=2;i<pts.length-2;i++){
    const dx1=pts[i].sx-pts[i-2].sx, dy1=pts[i].sy-pts[i-2].sy;
    const dx2=pts[i+2].sx-pts[i].sx, dy2=pts[i+2].sy-pts[i].sy;
    let diff=Math.abs(Math.atan2(dy2,dx2)-Math.atan2(dy1,dx1));
    if(diff>Math.PI) diff=2*Math.PI-diff;
    if(diff>0.45){
      const last=turns[turns.length-1];
      if(!last||Math.hypot(pts[i].sx-last.sx,pts[i].sy-last.sy)>minSpacing)
        turns.push({...pts[i],idx:i});
    }
  }
  return turns;
}

function getSectors(pts) {
  const n=pts.length;
  return [
    pts.slice(0,Math.floor(n*0.33)+1),
    pts.slice(Math.floor(n*0.33),Math.floor(n*0.66)+1),
    pts.slice(Math.floor(n*0.66)),
  ];
}

// Parse SVG viewBox to get natural dimensions
function parseSVGViewBox(svgText) {
  const vbMatch = svgText.match(/viewBox=["']([^"']+)["']/);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/\s+|,/);
    if (parts.length === 4) {
      return { x:parseFloat(parts[0]), y:parseFloat(parts[1]), w:parseFloat(parts[2]), h:parseFloat(parts[3]) };
    }
  }
  return { x:0, y:0, w:500, h:500 };
}

// Normalize car positions to SVG coordinate space
// OpenF1 gives real GPS/telemetry x,y — we map them to SVG viewBox
function normalizeCarsToSVG(cars, track, svgViewBox) {
  if (!cars?.length || !track?.length) return [];
  const xs=track.map(p=>p.x), ys=track.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const rangeX=maxX-minX||1, rangeY=maxY-minY||1;
  const { w, h } = svgViewBox;
  const scale = Math.min((w - PAD*0.4) / rangeX, (h - PAD*0.4) / rangeY);
  const offsetX = (w - rangeX*scale) / 2;
  const offsetY = (h - rangeY*scale) / 2;
  return cars.map(car => ({
    ...car,
    cx: offsetX + (car.x - minX) * scale,
    cy: offsetY + (car.y - minY) * scale,
  }));
}

export default function Track({ cars, track, svgUrl, circuitName, circuitInfo, lapInfo }) {
  const [svgPath, setSvgPath]         = useState(null);
  const [svgViewBox, setSvgViewBox]   = useState({ x:0, y:0, w:500, h:500 });
  const [svgLoading, setSvgLoading]   = useState(false);

  // Fetch SVG from circuits repo
  useEffect(() => {
    if (!svgUrl) { setSvgPath(null); return; }
    setSvgLoading(true);
    fetch(svgUrl)
      .then(r => r.text())
      .then(text => {
        const match = text.match(/d="([^"]+)"/);
        setSvgPath(match ? match[1] : null);
        setSvgViewBox(parseSVGViewBox(text));
        setSvgLoading(false);
      })
      .catch(() => { setSvgPath(null); setSvgLoading(false); });
  }, [svgUrl]);

  // Fallback: normalize for polyline track
  const { pts, scale, minX, minY, offsetX, offsetY } = useMemo(() => normalize(track), [track]);
  const turns   = useMemo(() => detectTurns(pts), [pts]);
  const sectors = useMemo(() => getSectors(pts), [pts]);

  // Cars positioned in SVG space
  const svgCars = useMemo(() => {
    if (!cars?.length || !track?.length) return [];
    if (svgPath) {
      return normalizeCarsToSVG(cars, track, svgViewBox);
    }
    // Fallback: use polyline normalization
    return cars.map(car => ({
      ...car,
      cx: offsetX + (car.x - minX) * scale,
      cy: offsetY + (car.y - minY) * scale,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, track, svgPath, svgViewBox, scale, minX, minY, offsetX, offsetY]);

  const sf    = pts[0];
  const allPts = ptsToString(pts);
  const pitPt = pts[Math.floor(pts.length*0.05)] || sf;

  const viewBox = svgPath
    ? `${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`
    : `0 0 ${VW} ${VH}`;

  return (
    <div style={{
      position:"relative", width:"100%", maxWidth:VW,
      aspectRatio: svgPath ? `${svgViewBox.w}/${svgViewBox.h}` : `${VW}/${VH}`,
      background:"#0d1117", borderRadius:16,
      overflow:"hidden", border:"1px solid #1e2530",
      fontFamily:"'Courier New',monospace",
    }}>

      {/* Circuit name */}
      <div style={{ position:"absolute", top:14, left:18, zIndex:20 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", letterSpacing:"0.12em", textTransform:"uppercase" }}>
          {circuitName||""}
        </div>
        {circuitInfo && (
          <div style={{ fontSize:10, color:"#64748b", marginTop:2, letterSpacing:"0.06em" }}>{circuitInfo}</div>
        )}
      </div>

      {/* Lap badge */}
      {lapInfo && (
        <div style={{ position:"absolute", top:14, right:18, zIndex:20, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,0.12)", border:"1px solid #22c55e", borderRadius:20, padding:"3px 10px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e" }}/>
            <span style={{ fontSize:11, color:"#22c55e", fontWeight:700, letterSpacing:"0.1em" }}>LIVE</span>
          </div>
          <span style={{ fontSize:12, color:"#94a3b8", letterSpacing:"0.08em" }}>{lapInfo}</span>
        </div>
      )}

      {/* Main SVG — single SVG for track + cars */}
      <svg
        viewBox={viewBox}
        width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ position:"absolute", inset:0, display:"block" }}>

        <defs>
          {/* Glow filter for featured cars */}
          <filter id="carglow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="trackglow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {SECTOR_COLORS.map((_,i) => (
            <filter key={i} id={`sg${i}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
        </defs>

        {/* ── SVG Circuit from repo ── */}
        {svgPath && (
          <>
            {/* Subtle grid */}
            {Array.from({length:20}).map((_,i) => (
              <line key={`v${i}`} x1={svgViewBox.w/20*i} y1={svgViewBox.y} x2={svgViewBox.w/20*i} y2={svgViewBox.h} stroke="#080808" strokeWidth="0.5"/>
            ))}
            {Array.from({length:20}).map((_,i) => (
              <line key={`h${i}`} x1={svgViewBox.x} y1={svgViewBox.h/20*i} x2={svgViewBox.w} y2={svgViewBox.h/20*i} stroke="#080808" strokeWidth="0.5"/>
            ))}
            {/* Track layers */}
            <path d={svgPath} fill="none" stroke="#0f1923" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={svgPath} fill="none" stroke="#1c2128" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={svgPath} fill="none" stroke="#2d3748" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
            {/* White kerb lines */}
            <path d={svgPath} fill="none" stroke="#3a4a5a" strokeWidth="26.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2"/>
            {/* Green racing line */}
            <path d={svgPath} fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.7" strokeLinecap="round" strokeLinejoin="round" filter="url(#trackglow)"/>

            {/* Sector legend */}
            {["S1","S2","S3"].map((s,i)=>(
              <g key={s} transform={`translate(${svgViewBox.w - 55}, ${svgViewBox.h - 50 + i*14})`}>
                <rect width="12" height="3" rx="1.5" fill={SECTOR_COLORS[i]} opacity="0.8"/>
                <text x="16" y="4" fill={SECTOR_COLORS[i]} fontSize="8" fontFamily="monospace" opacity="0.8">{s}</text>
              </g>
            ))}

            {/* ── Cars as colored dots with labels ── */}
            {svgCars.map(car => {
              const isFeatured = car.featured;
              const r = isFeatured ? 9 : 7;
              return (
                <g key={car.driver}>
                  {/* Glow ring for featured cars */}
                  {isFeatured && (
                    <circle cx={car.cx} cy={car.cy} r={r+5}
                      fill={car.color} opacity="0.2"
                      filter="url(#carglow)"/>
                  )}
                  {/* White outline */}
                  <circle cx={car.cx} cy={car.cy} r={r+1.5}
                    fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                  {/* Team color dot */}
                  <circle cx={car.cx} cy={car.cy} r={r}
                    fill={car.color}/>
                  {/* Driver abbreviation */}
                  <text
                    x={car.cx}
                    y={car.cy - r - 4}
                    fill={car.color}
                    fontSize="7"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="'Courier New', monospace"
                    style={{ textShadow:"0 0 4px #000" }}>
                    {car.short}
                  </text>
                  {/* Driver number inside dot */}
                  <text
                    x={car.cx}
                    y={car.cy + 3}
                    fill="#fff"
                    fontSize="6"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="'Courier New', monospace">
                    {car.number}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {/* ── Fallback: polyline track ── */}
        {!svgPath && pts.length > 1 && (
          <>
            <polyline points={allPts} fill="none" stroke="#0f1923" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={allPts} fill="none" stroke="#1c2128" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={allPts} fill="none" stroke="#2d3748" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>

            {sectors.map((seg,i) => seg.length>1 && (
              <g key={i}>
                <polyline points={ptsToString(seg)} fill="none" stroke={SECTOR_COLORS[i]} strokeWidth="4" opacity="0.15" strokeLinecap="round" strokeLinejoin="round" filter={`url(#sg${i})`}/>
                <polyline points={ptsToString(seg)} fill="none" stroke={SECTOR_COLORS[i]} strokeWidth="2" opacity="0.9" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
            ))}

            {turns.map((t,i) => {
              const sIdx=t.idx<Math.floor(pts.length*0.33)?0:t.idx<Math.floor(pts.length*0.66)?1:2;
              const col=SECTOR_COLORS[sIdx];
              const dx=t.sx-VW/2, dy=t.sy-VH/2;
              const dist=Math.hypot(dx,dy)||1;
              return (
                <g key={i}>
                  <circle cx={t.sx} cy={t.sy} r="4" fill="none" stroke={col} strokeWidth="1.2" opacity="0.6"/>
                  <text x={t.sx+(dx/dist)*24} y={t.sy+(dy/dist)*24+3} fill={col} fontSize="7.5" textAnchor="middle" opacity="0.65" fontFamily="monospace">T{i+1}</text>
                </g>
              );
            })}

            {sf && (() => {
              const next=pts[3]||pts[1];
              const angle=Math.atan2(next.sy-sf.sy,next.sx-sf.sx);
              const px=Math.cos(angle+Math.PI/2)*18, py=Math.sin(angle+Math.PI/2)*18;
              return (
                <g>
                  <line x1={sf.sx-px} y1={sf.sy-py} x2={sf.sx+px} y2={sf.sy+py} stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
                  <line x1={sf.sx-px} y1={sf.sy-py} x2={sf.sx+px} y2={sf.sy+py} stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="4,4"/>
                  <text x={sf.sx+px+7} y={sf.sy+py+4} fill="#64748b" fontSize="9" fontFamily="monospace">S/F</text>
                </g>
              );
            })()}

            {pitPt && (
              <g>
                <line x1={pitPt.sx-9} y1={pitPt.sy+11} x2={pitPt.sx+9} y2={pitPt.sy+11} stroke="#475569" strokeWidth="1.2"/>
                <text x={pitPt.sx} y={pitPt.sy+21} fill="#475569" fontSize="7.5" textAnchor="middle" fontFamily="monospace">PIT</text>
              </g>
            )}

            {["S1","S2","S3"].map((s,i)=>(
              <g key={s} transform={`translate(${VW-75},${VH-46+i*14})`}>
                <rect width="14" height="3" rx="1.5" fill={SECTOR_COLORS[i]} opacity="0.85"/>
                <text x="20" y="4" fill={SECTOR_COLORS[i]} fontSize="7.5" fontFamily="monospace" opacity="0.85">{s}</text>
              </g>
            ))}

            {/* Cars on fallback track */}
            {svgCars.map(car => (
              <g key={car.driver}>
                {car.featured && (
                  <circle cx={car.cx} cy={car.cy} r="14" fill={car.color} opacity="0.2" filter="url(#carglow)"/>
                )}
                <circle cx={car.cx} cy={car.cy} r="8.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                <circle cx={car.cx} cy={car.cy} r="7.5" fill={car.color}/>
                <text x={car.cx} y={car.cy-12} fill={car.color} fontSize="7.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">{car.short}</text>
                <text x={car.cx} y={car.cy+3} fill="#fff" fontSize="6.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">{car.number}</text>
              </g>
            ))}
          </>
        )}

        {/* HUD */}
        <text x="10" y={svgPath ? svgViewBox.h - 8 : VH - 8}
          fill="#1e2d3d" fontSize="8" fontFamily="monospace">
          {svgUrl ? "SVG" : `${track?.length||0}pts`} · {cars?.length||0} cars
        </text>
      </svg>

      {svgLoading && (
        <div style={{ position:"absolute", bottom:10, left:14, fontSize:9, color:"#334155", fontFamily:"monospace" }}>
          Loading circuit...
        </div>
      )}
    </div>
  );
}
