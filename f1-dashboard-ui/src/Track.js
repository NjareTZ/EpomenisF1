import { useMemo, useState, useEffect, useRef } from "react";

const SECTOR_COLORS = ["#a855f7", "#22c55e", "#eab308"];
const VW = 900, VH = 580;
const PAD = 50;

function normalize(track) {
  if (!track?.length) return { pts:[], scale:1, minX:0, minY:0, offsetX:PAD, offsetY:PAD };
  const xs=track.map(p=>p.x), ys=track.map(p=>p.y);
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

function parseSVGViewBox(svgText) {
  const m = svgText.match(/viewBox=["']([^"']+)["']/);
  if (m) {
    const p = m[1].trim().split(/\s+|,/);
    if (p.length === 4) return { x:+p[0], y:+p[1], w:+p[2], h:+p[3] };
  }
  return { x:0, y:0, w:500, h:500 };
}

function normalizeCarsToViewBox(cars, track, vb) {
  if (!cars?.length || !track?.length) return [];
  const xs=track.map(p=>p.x), ys=track.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const rangeX=maxX-minX||1, rangeY=maxY-minY||1;
  const p = PAD * 0.3;
  const scale=Math.min((vb.w-p*2)/rangeX,(vb.h-p*2)/rangeY);
  const offX=(vb.w-rangeX*scale)/2, offY=(vb.h-rangeY*scale)/2;
  return cars.map(car => ({
    ...car,
    cx: offX+(car.x-minX)*scale,
    cy: offY+(car.y-minY)*scale,
  }));
}

export default function Track({ cars, track, svgUrl, circuitName, circuitInfo, lapInfo }) {
  const [svgPath, setSvgPath]       = useState(null);
  const [svgVB, setSvgVB]           = useState({ x:0, y:0, w:500, h:500 });
  const [svgLoading, setSvgLoading] = useState(false);

  useEffect(() => {
    if (!svgUrl) { setSvgPath(null); return; }
    setSvgLoading(true);
    fetch(svgUrl)
      .then(r => r.text())
      .then(text => {
        const m = text.match(/d="([^"]+)"/);
        setSvgPath(m ? m[1] : null);
        setSvgVB(parseSVGViewBox(text));
        setSvgLoading(false);
      })
      .catch(() => { setSvgPath(null); setSvgLoading(false); });
  }, [svgUrl]);

  const { pts, scale, minX, minY, offsetX, offsetY } = useMemo(() => normalize(track), [track]);
  const turns   = useMemo(() => detectTurns(pts), [pts]);
  const sectors = useMemo(() => getSectors(pts), [pts]);
  const allPts  = ptsToString(pts);
  const sf      = pts[0];
  const pitPt   = pts[Math.floor(pts.length*0.05)] || sf;

  // Position cars in SVG coordinate space
  const svgCars = useMemo(() => {
    if (!cars?.length) return [];
    if (svgPath) return normalizeCarsToViewBox(cars, track, svgVB);
    // Fallback
    return cars.map(car => ({
      ...car,
      cx: offsetX + (car.x - minX) * scale,
      cy: offsetY + (car.y - minY) * scale,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, track, svgPath, svgVB, scale, minX, minY, offsetX, offsetY]);

  const vbStr = svgPath
    ? `${svgVB.x} ${svgVB.y} ${svgVB.w} ${svgVB.h}`
    : `0 0 ${VW} ${VH}`;

  const containerRatio = svgPath
    ? `${svgVB.w}/${svgVB.h}`
    : `${VW}/${VH}`;

  return (
    <div style={{
      position:"relative", width:"100%", maxWidth:VW,
      aspectRatio: containerRatio,
      background:"#0d1117", borderRadius:16,
      overflow:"hidden", border:"1px solid #1e2530",
    }}>
      {/* Circuit name */}
      <div style={{ position:"absolute", top:12, left:16, zIndex:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#e2e8f0", letterSpacing:"0.12em", textTransform:"uppercase" }}>
          {circuitName||""}
        </div>
        {circuitInfo && <div style={{ fontSize:9, color:"#64748b", marginTop:2 }}>{circuitInfo}</div>}
      </div>

      {/* Lap badge */}
      {lapInfo && (
        <div style={{ position:"absolute", top:12, right:16, zIndex:20, display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(34,197,94,0.12)", border:"1px solid #22c55e", borderRadius:20, padding:"2px 8px" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e" }}/>
            <span style={{ fontSize:10, color:"#22c55e", fontWeight:700 }}>LIVE</span>
          </div>
          <span style={{ fontSize:11, color:"#94a3b8" }}>{lapInfo}</span>
        </div>
      )}

      <svg viewBox={vbStr} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ position:"absolute", inset:0, display:"block" }}>

        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {SECTOR_COLORS.map((_,i) => (
            <filter key={i} id={`sg${i}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
        </defs>

        {/* ── SVG Circuit ── */}
        {svgPath && (
          <>
            <path d={svgPath} fill="none" stroke="#0a0f16" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={svgPath} fill="none" stroke="#1c2128" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={svgPath} fill="none" stroke="#253040" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
            {/* Racing line */}
            <path d={svgPath} fill="none" stroke="#1a3a2a" strokeWidth="2" opacity="0.6" strokeLinecap="round" strokeLinejoin="round"/>

            {/* Sector legend */}
            {["S1","S2","S3"].map((s,i)=>(
              <g key={s} transform={`translate(${svgVB.w-52},${svgVB.h-44+i*13})`}>
                <rect width="10" height="3" rx="1.5" fill={SECTOR_COLORS[i]} opacity="0.8"/>
                <text x="14" y="4" fill={SECTOR_COLORS[i]} fontSize="7" fontFamily="monospace" opacity="0.8">{s}</text>
              </g>
            ))}
          </>
        )}

        {/* ── Fallback polyline ── */}
        {!svgPath && pts.length > 1 && (
          <>
            <polyline points={allPts} fill="none" stroke="#0a0f16" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={allPts} fill="none" stroke="#1c2128" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={allPts} fill="none" stroke="#253040" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
            {sectors.map((seg,i) => seg.length>1 && (
              <g key={i}>
                <polyline points={ptsToString(seg)} fill="none" stroke={SECTOR_COLORS[i]} strokeWidth="3" opacity="0.12" strokeLinecap="round" strokeLinejoin="round" filter={`url(#sg${i})`}/>
                <polyline points={ptsToString(seg)} fill="none" stroke={SECTOR_COLORS[i]} strokeWidth="1.5" opacity="0.8" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
            ))}
            {turns.map((t,i) => {
              const sIdx=t.idx<Math.floor(pts.length*0.33)?0:t.idx<Math.floor(pts.length*0.66)?1:2;
              const col=SECTOR_COLORS[sIdx];
              const dx=t.sx-VW/2, dy=t.sy-VH/2;
              const dist=Math.hypot(dx,dy)||1;
              return (
                <g key={i}>
                  <circle cx={t.sx} cy={t.sy} r="3.5" fill="none" stroke={col} strokeWidth="1" opacity="0.5"/>
                  <text x={t.sx+(dx/dist)*22} y={t.sy+(dy/dist)*22+3} fill={col} fontSize="7" textAnchor="middle" opacity="0.6" fontFamily="monospace">T{i+1}</text>
                </g>
              );
            })}
            {sf && (() => {
              const next=pts[3]||pts[1];
              const angle=Math.atan2(next.sy-sf.sy,next.sx-sf.sx);
              const px=Math.cos(angle+Math.PI/2)*16, py=Math.sin(angle+Math.PI/2)*16;
              return (
                <g>
                  <line x1={sf.sx-px} y1={sf.sy-py} x2={sf.sx+px} y2={sf.sy+py} stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                  <line x1={sf.sx-px} y1={sf.sy-py} x2={sf.sx+px} y2={sf.sy+py} stroke="#000" strokeWidth="3" strokeLinecap="round" strokeDasharray="4,4"/>
                  <text x={sf.sx+px+6} y={sf.sy+py+4} fill="#64748b" fontSize="8" fontFamily="monospace">S/F</text>
                </g>
              );
            })()}
            {pitPt && (
              <g>
                <line x1={pitPt.sx-8} y1={pitPt.sy+10} x2={pitPt.sx+8} y2={pitPt.sy+10} stroke="#475569" strokeWidth="1"/>
                <text x={pitPt.sx} y={pitPt.sy+19} fill="#475569" fontSize="7" textAnchor="middle" fontFamily="monospace">PIT</text>
              </g>
            )}
            {["S1","S2","S3"].map((s,i)=>(
              <g key={s} transform={`translate(${VW-70},${VH-42+i*13})`}>
                <rect width="12" height="3" rx="1.5" fill={SECTOR_COLORS[i]} opacity="0.8"/>
                <text x="16" y="4" fill={SECTOR_COLORS[i]} fontSize="7" fontFamily="monospace" opacity="0.8">{s}</text>
              </g>
            ))}
          </>
        )}

        {/* ── Car dots — rendered in SVG for smooth movement ── */}
        {svgCars.map(car => (
          <g key={car.driver}>
            {/* Soft glow */}
            <circle cx={car.cx} cy={car.cy} r="10"
              fill={car.color} opacity="0.15" filter="url(#glow)"/>
            {/* White outline ring */}
            <circle cx={car.cx} cy={car.cy} r="7"
              fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
            {/* Team color fill */}
            <circle cx={car.cx} cy={car.cy} r="6"
              fill={car.color}/>
            {/* Driver abbreviation above dot */}
            <text x={car.cx} y={car.cy - 9}
              fill={car.color}
              fontSize="6.5"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="'Courier New', monospace"
              style={{ paintOrder:"stroke", stroke:"#0d1117", strokeWidth:"2px" }}>
              {car.short}
            </text>
          </g>
        ))}
      </svg>

      {svgLoading && (
        <div style={{ position:"absolute", bottom:8, left:12, fontSize:8, color:"#334155", fontFamily:"monospace" }}>
          Loading SVG...
        </div>
      )}

      <div style={{ position:"absolute", bottom:8, right:12, fontSize:8, color:"#1e2d3d", fontFamily:"monospace" }}>
        {svgUrl?"SVG":pts.length+"pts"} · {cars?.length||0} cars
      </div>
    </div>
  );
}
