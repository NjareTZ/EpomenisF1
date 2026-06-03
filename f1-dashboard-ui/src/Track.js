import { useMemo } from "react";
import Car from "./Car";

const PAD = 60;
const SECTOR_COLORS = ["#a855f7", "#22c55e", "#eab308"];
const VW = 900;
const VH = 620;

function normalize(track) {
  if (!track?.length) return { pts: [], vbW: VW, vbH: VH, scale: 1, minX: 0, minY: 0, offsetX: 0, offsetY: 0 };

  const xs = track.map(p => p.x);
  const ys = track.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scale = Math.min((VW - PAD * 2) / rangeX, (VH - PAD * 2) / rangeY);
  const scaledW = rangeX * scale;
  const scaledH = rangeY * scale;
  const offsetX = (VW - scaledW) / 2;
  const offsetY = (VH - scaledH) / 2;

  const pts = track.map(p => ({
    sx: offsetX + (p.x - minX) * scale,
    sy: offsetY + (p.y - minY) * scale,
  }));

  return { pts, vbW: VW, vbH: VH, scale, minX, minY, offsetX, offsetY };
}

function getSectorSegments(pts) {
  if (!pts.length) return [[], [], []];
  const n = pts.length;
  return [
    pts.slice(0, Math.floor(n * 0.33) + 1),
    pts.slice(Math.floor(n * 0.33), Math.floor(n * 0.66) + 1),
    pts.slice(Math.floor(n * 0.66)),
  ];
}

function ptsToString(pts) {
  return pts.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
}

function detectTurns(pts, minSpacing = 55) {
  const turns = [];
  for (let i = 2; i < pts.length - 2; i++) {
    const dx1 = pts[i].sx - pts[i - 2].sx;
    const dy1 = pts[i].sy - pts[i - 2].sy;
    const dx2 = pts[i + 2].sx - pts[i].sx;
    const dy2 = pts[i + 2].sy - pts[i].sy;
    let diff = Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1));
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > 0.45) {
      const last = turns[turns.length - 1];
      if (!last || Math.hypot(pts[i].sx - last.sx, pts[i].sy - last.sy) > minSpacing) {
        turns.push({ ...pts[i], idx: i });
      }
    }
  }
  return turns;
}

export default function Track({ cars, track, circuitName, circuitInfo, lapInfo }) {
  const { pts, vbW, vbH, scale, minX, minY, offsetX, offsetY } = useMemo(
    () => normalize(track), [track]
  );

  const sectors = useMemo(() => getSectorSegments(pts), [pts]);
  const turns   = useMemo(() => detectTurns(pts), [pts]);

  const positionedCars = useMemo(() => {
    if (!cars?.length || !pts.length) return [];
    return cars.map(car => {
      const sx = offsetX + (car.x - minX) * scale;
      const sy = offsetY + (car.y - minY) * scale;
      return {
        ...car,
        screenX: `${(sx / vbW * 100).toFixed(3)}%`,
        screenY: `${(sy / vbH * 100).toFixed(3)}%`,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, pts.length, vbW, vbH, scale, minX, minY, offsetX, offsetY]);

  const sf     = pts[0];
  const allPts = ptsToString(pts);
  const pitPt  = pts[Math.floor(pts.length * 0.05)] || sf;

  return (
    <div style={{
      position: "relative",
      width: "100%",
      maxWidth: VW,
      aspectRatio: `${VW} / ${VH}`,
      background: "#0d1117",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid #1e2530",
      fontFamily: "'Courier New', monospace",
    }}>

      {/* Circuit name — top left */}
      <div style={{ position: "absolute", top: 14, left: 18, zIndex: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {circuitName || ""}
        </div>
        {circuitInfo && (
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, letterSpacing: "0.06em" }}>
            {circuitInfo}
          </div>
        )}
      </div>

      {/* Lap badge — top right */}
      {lapInfo && (
        <div style={{ position: "absolute", top: 14, right: 18, zIndex: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(34,197,94,0.12)", border: "1px solid #22c55e",
            borderRadius: 20, padding: "3px 10px",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, letterSpacing: "0.1em" }}>LIVE</span>
          </div>
          <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: "0.08em" }}>{lapInfo}</span>
        </div>
      )}

      {/* Track SVG */}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, display: "block" }}
      >
        <defs>
          {SECTOR_COLORS.map((_, i) => (
            <filter key={i} id={`sg${i}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
        </defs>

        {pts.length > 1 && (
          <>
            {/* ── Track base layers ── */}
            <polyline points={allPts} fill="none" stroke="#1a2235" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={allPts} fill="none" stroke="#1c2128" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={allPts} fill="none" stroke="#2d3748" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />

            {/* ── Sector racing lines ── */}
            {sectors.map((seg, i) => seg.length > 1 && (
              <g key={i}>
                <polyline points={ptsToString(seg)} fill="none" stroke={SECTOR_COLORS[i]}
                  strokeWidth="4" opacity="0.15" strokeLinecap="round" strokeLinejoin="round"
                  filter={`url(#sg${i})`} />
                <polyline points={ptsToString(seg)} fill="none" stroke={SECTOR_COLORS[i]}
                  strokeWidth="1.8" opacity="0.9" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}

            {/* ── Turn markers ── */}
            {turns.map((t, i) => {
              const sIdx = t.idx < Math.floor(pts.length * 0.33) ? 0
                : t.idx < Math.floor(pts.length * 0.66) ? 1 : 2;
              const col = SECTOR_COLORS[sIdx];
              const dx = t.sx - vbW / 2, dy = t.sy - vbH / 2;
              const dist = Math.hypot(dx, dy) || 1;
              const lx = t.sx + (dx / dist) * 24;
              const ly = t.sy + (dy / dist) * 24;
              return (
                <g key={i}>
                  <circle cx={t.sx} cy={t.sy} r="4" fill="none" stroke={col} strokeWidth="1.2" opacity="0.6" />
                  <text x={lx} y={ly + 3} fill={col} fontSize="7.5" textAnchor="middle" opacity="0.65"
                    fontFamily="'Courier New', monospace">T{i + 1}</text>
                </g>
              );
            })}

            {/* ── Start / Finish ── */}
            {sf && (() => {
              const next = pts[3] || pts[1];
              const angle = Math.atan2(next.sy - sf.sy, next.sx - sf.sx);
              const px = Math.cos(angle + Math.PI / 2) * 18;
              const py = Math.sin(angle + Math.PI / 2) * 18;
              return (
                <g>
                  <line x1={sf.sx - px} y1={sf.sy - py} x2={sf.sx + px} y2={sf.sy + py}
                    stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
                  <line x1={sf.sx - px} y1={sf.sy - py} x2={sf.sx + px} y2={sf.sy + py}
                    stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="4,4" />
                  <text x={sf.sx + px + 7} y={sf.sy + py + 4}
                    fill="#64748b" fontSize="9" fontFamily="'Courier New', monospace">S/F</text>
                </g>
              );
            })()}

            {/* ── Pit marker ── */}
            {pitPt && (
              <g>
                <line x1={pitPt.sx - 9} y1={pitPt.sy + 11} x2={pitPt.sx + 9} y2={pitPt.sy + 11}
                  stroke="#475569" strokeWidth="1.2" />
                <text x={pitPt.sx} y={pitPt.sy + 21} fill="#475569" fontSize="7.5"
                  textAnchor="middle" fontFamily="'Courier New', monospace">PIT</text>
              </g>
            )}

            {/* ── Sector legend — bottom right ── */}
            {["S1", "S2", "S3"].map((s, i) => (
              <g key={s} transform={`translate(${vbW - 75}, ${vbH - 46 + i * 14})`}>
                <rect width="14" height="3" rx="1.5" fill={SECTOR_COLORS[i]} opacity="0.85" />
                <text x="20" y="4" fill={SECTOR_COLORS[i]} fontSize="7.5"
                  fontFamily="'Courier New', monospace" opacity="0.85">{s}</text>
              </g>
            ))}

            {/* ── Car name labels ── */}
            {positionedCars.map(car => {
              const sx = parseFloat(car.screenX) / 100 * vbW;
              const sy = parseFloat(car.screenY) / 100 * vbH;
              return (
                <text key={car.driver + "-l"}
                  x={sx} y={sy - 13}
                  fill={car.color} fontSize="7.5" fontWeight="bold"
                  textAnchor="middle" fontFamily="'Courier New', monospace"
                  opacity="0.95">
                  {car.short}
                </text>
              );
            })}
          </>
        )}
      </svg>

      {/* ── Car dots (via Car.js) ── */}
      {positionedCars.map(car => <Car key={car.driver} driver={car} />)}

      {/* HUD — bottom left */}
      <div style={{
        position: "absolute", bottom: 10, left: 14,
        fontSize: 9, color: "#1e2d3d", fontFamily: "monospace",
      }}>
        {track?.length || 0} pts · {cars?.length || 0} cars
      </div>
    </div>
  );
}