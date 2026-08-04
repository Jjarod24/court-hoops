import { useEffect, useRef } from "react";
import type * as LeafletNS from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";

export type MapCourt = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance: number;
};

export function CourtMap({
  courts,
  center,
  selectedId,
  onSelect,
}: {
  courts: MapCourt[];
  center: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const meRef = useRef<Marker | null>(null);
  const centeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [center?.lat ?? 40.73, center?.lng ?? -73.99],
        zoom: 13,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
      renderMarkers(L);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function renderMarkers(lib?: typeof LeafletNS) {
    const L = lib ?? (await import("leaflet")).default;
    const map = mapRef.current;
    if (!map) return;

    for (const court of courts) {
      const active = court.id === selectedId;
      const html = `<div style="
        width:34px;height:34px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font:700 15px/1 Barlow,sans-serif;color:#1b1b23;
        background:linear-gradient(135deg,#fb923c,#ef4444);
        border:2px solid ${active ? "#ffffff" : "rgba(255,255,255,.35)"};
        box-shadow:0 6px 18px rgba(249,115,22,.55);">🏀</div>`;
      const icon = L.divIcon({
        html,
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const existing = markersRef.current[court.id];
      if (existing) {
        existing.setIcon(icon);
      } else {
        const marker = L.marker([court.lat, court.lng], { icon })
          .addTo(map)
          .on("click", () => onSelect(court.id));
        markersRef.current[court.id] = marker;
      }
    }

    if (center) {
      if (meRef.current) {
        meRef.current.setLatLng([center.lat, center.lng]);
      } else {
        const meIcon = L.divIcon({
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#38bdf8;border:3px solid #0b1120;box-shadow:0 0 0 6px rgba(56,189,248,.25)"></div>`,
          className: "",
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        meRef.current = L.marker([center.lat, center.lng], { icon: meIcon }).addTo(map);
      }
      if (!centeredRef.current) {
        centeredRef.current = true;
        map.setView([center.lat, center.lng], 14);
      }
    }
  }

  useEffect(() => {
    void renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courts, center?.lat, center?.lng, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const court = courts.find((c) => c.id === selectedId);
    if (court && mapRef.current) {
      mapRef.current.panTo([court.lat, court.lng]);
    }
  }, [selectedId, courts]);

  return <div ref={containerRef} className="h-full w-full" />;
}
