CIRCUIT_MAP = {
    "Bahrain Grand Prix": "bahrain",
    "Saudi Arabian Grand Prix": "saudi-arabia",
    "Australian Grand Prix": "australia",
    "Japanese Grand Prix": "japan",
    "Chinese Grand Prix": "china",
    "Miami Grand Prix": "miami",
    "Emilia Romagna Grand Prix": "imola",
    "Monaco Grand Prix": "monaco",
    "Canadian Grand Prix": "canada",
    "Spanish Grand Prix": "spain",
    "Barcelona Grand Prix": "spain",
    "Austrian Grand Prix": "austria",
    "British Grand Prix": "great-britain",
    "Hungarian Grand Prix": "hungary",
    "Belgian Grand Prix": "belgium",
    "Dutch Grand Prix": "netherlands",
    "Italian Grand Prix": "italy",
    "Azerbaijan Grand Prix": "azerbaijan",
    "Singapore Grand Prix": "singapore",
    "United States Grand Prix": "united-states",
    "Mexico City Grand Prix": "mexico",
    "Sao Paulo Grand Prix": "brazil",
    "Las Vegas Grand Prix": "las-vegas",
    "Qatar Grand Prix": "qatar",
    "Abu Dhabi Grand Prix": "abu-dhabi",
}
CIRCUIT_LAYOUT = {
    "bahrain": "bahrain-6",
    "saudi-arabia": "saudi-arabia-1",
    "australia": "australia-5",
    "japan": "japan-2",
    "china": "china-1",
    "miami": "miami-1",
    "imola": "imola-5",
    "monaco": "monaco-6",
    "canada": "canada-3",
    "spain": "spain-6",
    "austria": "austria-3",
    "great-britain": "great-britain-7",
    "hungary": "hungary-2",
    "belgium": "belgium-8",
    "netherlands": "netherlands-4",
    "italy": "italy-14",
    "azerbaijan": "azerbaijan-1",
    "singapore": "singapore-3",
    "united-states": "united-states-4",
    "mexico": "mexico-3",
    "brazil": "brazil-4",
    "las-vegas": "las-vegas-1",
    "qatar": "qatar-1",
    "abu-dhabi": "abu-dhabi-5",
}
SVG_BASE = "https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/circuits"
def get_circuit_id(meeting_name):
    if meeting_name in CIRCUIT_MAP:
        return CIRCUIT_MAP[meeting_name]
    name_lower = meeting_name.lower()
    for key, val in CIRCUIT_MAP.items():
        if any(word in name_lower for word in key.lower().split() if len(word) > 4):
            return val
    return None
def get_svg_url(meeting_name):
    circuit_id = get_circuit_id(meeting_name)
    if not circuit_id:
        return None
    layout = CIRCUIT_LAYOUT.get(circuit_id, f"{circuit_id}-1")
    return f"{SVG_BASE}/{layout}.svg"
def get_circuit_info(meeting_name):
    circuit_id = get_circuit_id(meeting_name)
    return {
        "circuit_id": circuit_id,
        "svg_url": get_svg_url(meeting_name),
        "layout": CIRCUIT_LAYOUT.get(circuit_id) if circuit_id else None,
    }
