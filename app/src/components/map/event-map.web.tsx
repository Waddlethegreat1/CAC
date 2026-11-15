import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { nextInGroup } from "./model";
import type { EventMapProps } from "./types";

export default function EventMap({ center, radiusKm, recenter, markers, selectedId, onSelect, palette }: EventMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false });
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19, keepBuffer: 0, updateWhenIdle: true,
    }).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; layer.current = null; };
  }, []);
  useEffect(() => {
    map.current?.fitBounds(L.latLng(center.lat, center.lng).toBounds(radiusKm * 2000), { animate: false });
  }, [center.lat, center.lng, radiusKm, recenter]);
  useEffect(() => {
    layer.current?.clearLayers();
    for (const marker of markers) {
      const selected = marker.ids.includes(selectedId ?? "");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = marker.ids.length > 1 ? String(marker.ids.length) : "●";
      button.setAttribute("aria-label", `${marker.ids.length} event${marker.ids.length === 1 ? "" : "s"}${marker.saved ? ", includes saved" : ""}`);
      button.style.cssText = `width:36px;height:36px;border-radius:50%;border:3px solid ${selected ? palette.ink : palette.white};background:${marker.saved ? palette.gold : palette.ember};color:white;cursor:pointer;font-weight:700;box-shadow:0 2px 8px #0003`;
      button.onclick = () => onSelect(nextInGroup(marker.ids, selectedId));
      L.marker([marker.lat, marker.lng], { icon: L.divIcon({ html: button, className: "scout-event-pin", iconSize: [36, 36], iconAnchor: [18, 18] }), keyboard: false, zIndexOffset: selected ? 1000 : marker.saved ? 500 : 0 }).addTo(layer.current!);
    }
  }, [markers, selectedId, onSelect, palette]);
  return <div style={{ flex: 1, position: "relative", minHeight: 180, isolation: "isolate" }}>
    <div ref={element} aria-label="Interactive event map" style={{ height: "100%", width: "100%", minHeight: 180 }} />
    {tileError && <div role="status" style={{ position: "absolute", top: 10, left: 50, right: 10, zIndex: 1000, padding: 8, color: palette.ink, background: palette.surface }}>Map tiles unavailable. Use the event selector below.</div>}
  </div>;
}
