import { useMemo } from "react";
import Car from "./Car";

const PAD = 60;
const MAX_W = 1100;
const MAX_H = 700;

function normalizeTrack(track) {
  if (!track?.length) return { points: [], vbW: 800, vbH: 500 };

  const xs = track.map(p => p.x);
  const ys = track.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Uniform scale — keeps true circuit shape
  const scale = Math.min(
    (MAX_W - PAD * 2) / rangeX,
    (MAX_H - PAD * 2) / rangeY
  );

  // viewBox derives from actual data extents, not a fixed box
  const vbW = rangeX * scale + PAD * 2;
  const vbH = rangeY * scale + PAD * 2;

  const offsetX = PAD;
  const offsetY = PAD;

  return {
    points: track.map(p => ({
      screenX: offsetX + (p.x - minX) * scale,
      screenY: offsetY + (p.y - minY) * scale,
    })),
    vbW,
    vbH,
  };
}

function normalizeCars(cars, track) {
  if (!cars?.length || !track?.length) return [];

  const xs = track.map(p => p.x);
  const ys = track.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scale = Math.min(
    (MAX_W - PAD * 2) / rangeX,
    (MAX_H - PAD * 2) / rangeY
  );

  const offsetX = PAD;
  const offsetY = PAD;

  return cars.map(car => ({
    ...car,
    screenX: offsetX + (car.x - minX) * scale,
    screenY: offsetY + (car.y - minY) * scale,
  }));
}

export default function Track({ cars, track }) {
  const { points: circuit, vbW, vbH } = useMemo(
    () => normalizeTrack(track),
    [track]
  );

  const positionedCars = useMemo(
    () => normalizeCars(cars, track),
    [cars, track]
  );

  const points = circuit
    .map(p => `${p.screenX},${p.screenY}`)
    .join(" ");

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: MAX_W,
        // Container aspect ratio matches the actual circuit shape
        aspectRatio: `${vbW} / ${vbH}`,
        background: "radial-gradient(circle at center, #111, #000)",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #222",
      }}
    >
      {/* GRID */}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <line
            key={i}
            x1={(vbW / 40) * i} y1="0"
            x2={(vbW / 40) * i} y2={vbH}
            stroke="#080808"
          />
        ))}
        {Array.from({ length: 25 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1="0" y1={(vbH / 25) * i}
            x2={vbW} y2={(vbH / 25) * i}
            stroke="#080808"
          />
        ))}
      </svg>

      {/* TRACK */}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {points && (
          <>
            {/* Glow */}
            <polyline
              points={points}
              fill="none"
              stroke="#00ff44"
              strokeWidth="34"
              opacity="0.08"
              strokeLinecap="round"
            />

            {/* Asphalt */}
            <polyline
              points={points}
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Border */}
            <polyline
              points={points}
              fill="none"
              stroke="#888"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Racing line */}
            <polyline
              points={points}
              fill="none"
              stroke="#00ff66"
              strokeWidth="2"
              opacity="0.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Start / Finish line */}
            {circuit.length > 0 && (
              <>
                <line
                  x1={circuit[0].screenX - 16}
                  y1={circuit[0].screenY}
                  x2={circuit[0].screenX + 16}
                  y2={circuit[0].screenY}
                  stroke="#fff"
                  strokeWidth="5"
                />
                <text
                  x={circuit[0].screenX + 20}
                  y={circuit[0].screenY - 10}
                  fill="#fff"
                  fontSize="10"
                >
                  START
                </text>
              </>
            )}
          </>
        )}
      </svg>

      {/* CAR TRAILS */}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {positionedCars.map(car => (
          <circle
            key={car.driver + "-trail"}
            cx={car.screenX}
            cy={car.screenY}
            r="12"
            fill={car.color}
            opacity="0.15"
          />
        ))}
      </svg>

      {/* CARS — positioned absolutely, scaled to match SVG coordinate space */}
      {positionedCars.map(car => {
        // Convert SVG coords to % so Car.js absolute positioning stays in sync
        const leftPct = (car.screenX / vbW) * 100;
        const topPct  = (car.screenY / vbH) * 100;
        return (
          <Car
            key={car.driver}
            driver={{
              ...car,
              screenX: `${leftPct}%`,
              screenY: `${topPct}%`,
            }}
          />
        );
      })}

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          fontSize: 12,
          color: "#999",
          fontFamily: "monospace",
        }}
      >
        Track Points: {track?.length || 0}
        <br />
        Cars: {cars?.length || 0}
      </div>
    </div>
  );
}
