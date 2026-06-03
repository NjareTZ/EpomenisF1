export default function Car({ driver }) {
  return (
    <div
      title={`${driver.name} (${driver.team})`}
      style={{
        position: "absolute",
        left: driver.screenX,
        top: driver.screenY,
        width: 18,
        height: 18,
        borderRadius: "50%",
        backgroundColor: driver.color || "#fff",
        color: "#fff",
        fontSize: 8,
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "translate(-50%, -50%)",
        border: "1.5px solid rgba(255,255,255,.3)",
        zIndex: 100,
        transition: "left .15s linear, top .15s linear",
      }}
    >
      {driver.number}
    </div>
  );
}