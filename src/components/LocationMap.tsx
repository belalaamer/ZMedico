import { useEffect, useRef } from "react";

// Lightweight Leaflet wrapper that loads CSS + JS from CDN on demand.
// Avoids adding a heavy npm dep just to draw a single map.

declare global { interface Window { L?: any } }

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let loadingPromise: Promise<void> | null = null;
function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.L) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load map")));
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load map"));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

type Props = {
  center: { lat: number; lon: number };
  user?: { lat: number; lon: number } | null;
  radius?: number;
  className?: string;
  /** When true, clicking the map calls onPick with the new center. */
  pickable?: boolean;
  onPick?: (lat: number, lon: number) => void;
};

export default function LocationMap({ center, user, radius = 100, className, pickable, onPick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<{ centerMarker?: any; userMarker?: any; circle?: any }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadLeaflet();
      if (cancelled || !ref.current || !window.L) return;
      const L = window.L;
      if (!mapRef.current) {
        const map = L.map(ref.current).setView([center.lat, center.lon], 16);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        if (pickable) {
          map.on("click", (e: any) => onPick?.(e.latlng.lat, e.latlng.lng));
        }
      }
      const map = mapRef.current;
      const ls = layersRef.current;
      if (ls.centerMarker) map.removeLayer(ls.centerMarker);
      if (ls.circle) map.removeLayer(ls.circle);
      if (ls.userMarker) map.removeLayer(ls.userMarker);
      ls.centerMarker = L.marker([center.lat, center.lon]).addTo(map);
      ls.circle = L.circle([center.lat, center.lon], {
        radius,
        color: "#10b981",
        fillColor: "#10b981",
        fillOpacity: 0.15,
      }).addTo(map);
      if (user) {
        const within = (() => {
          const R = 6371e3;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const φ1 = toRad(center.lat), φ2 = toRad(user.lat);
          const Δφ = toRad(user.lat - center.lat), Δλ = toRad(user.lon - center.lon);
          const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= radius;
        })();
        ls.userMarker = L.circleMarker([user.lat, user.lon], {
          radius: 8,
          color: within ? "#10b981" : "#ef4444",
          fillColor: within ? "#10b981" : "#ef4444",
          fillOpacity: 0.9,
        }).addTo(map);
        const bounds = L.latLngBounds([[center.lat, center.lon], [user.lat, user.lon]]).pad(0.4);
        map.fitBounds(bounds, { maxZoom: 17 });
      } else {
        map.setView([center.lat, center.lon], 16);
      }
    })();
    return () => { cancelled = true; };
  }, [center.lat, center.lon, user?.lat, user?.lon, radius, pickable]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  return <div ref={ref} className={className ?? "h-64 w-full rounded-md overflow-hidden border"} />;
}
