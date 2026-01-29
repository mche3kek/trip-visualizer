import React, { useEffect, useRef, useState } from 'react';
import { DayPlan } from './types';

declare var google: any;

interface MapViewProps {
  days: DayPlan[];
  selectedDayId: string | null;
}

// Safe colors for map contrast
const PASTE_COLORS = [
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#d946ef", // Fuchsia
  "#f43f5e", // Rose
  "#6366f1", // Indigo
];

export const MapView: React.FC<MapViewProps> = ({ days, selectedDayId }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any | null>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  // Legend Visibility
  const [visibleDayIds, setVisibleDayIds] = useState<Set<string>>(new Set(days.map(d => d.id)));

  const isOverview = selectedDayId === 'overview';
  const activeDay = days.find(d => d.id === selectedDayId);

  // Sync visible days when days change (e.g. added day)
  useEffect(() => {
    if (isOverview) {
      // Auto-add new days to visibility
      setVisibleDayIds(prev => {
        const next = new Set(prev);
        days.forEach(d => {
          if (!prev.has(d.id) && !prev.has(d.id)) next.add(d.id);
        });
        return next;
      });
    }
  }, [days.length, isOverview]);


  useEffect(() => {
    if (!mapRef.current) return;

    // 1. Check if Google Maps is already fully loaded
    if (typeof (window as any).google === 'object' && (window as any).google.maps) {
      if (!map) initMap();
      return;
    }

    // 2. Check if script tag already exists to avoid duplicates
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      return;
    }

    // 3. Load script with provided Key
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // Define global callback
    (window as any).initMapCallback = () => {
      initMap();
    };

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initMapCallback`;
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      console.error("Google Maps script failed to load.");
      if (mapRef.current) {
        mapRef.current.innerHTML = `<div class="flex items-center justify-center h-full text-red-500 p-4 text-center text-sm">
          Failed to load Google Maps.<br/>Check API Key configuration.
        </div>`;
      }
    };

    document.head.appendChild(script);

    function initMap() {
      if (!mapRef.current || !google) return;
      try {
        const initialMap = new google.maps.Map(mapRef.current, {
          zoom: 6,
          center: { lat: 36.2048, lng: 138.2529 },
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }]
            }
          ]
        });
        setMap(initialMap);
      } catch (e) {
        console.error("Error initializing map:", e);
      }
    }

    return () => {
      delete (window as any).initMapCallback;
    };
  }, []);

  // Update Map Markers and Route
  useEffect(() => {
    if (!map || !google) return;

    // Clear existing
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    const hasPoints = false;

    // Helper to add marker
    const addMarker = (pos: { lat: number, lng: number }, title: string, label?: string, isCity = false, color = "#4f46e5") => {
      if (!pos || typeof pos.lat !== 'number') return;

      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: title,
        label: label ? { text: label, color: "white", fontSize: "12px", fontWeight: "bold" } : undefined,
        icon: {
          path: isCity ? google.maps.SymbolPath.CIRCLE : "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: color,
          fillOpacity: 1,
          strokeWeight: 1,
          strokeColor: "white",
          scale: isCity ? 8 : 1.5,
          anchor: isCity ? undefined : new google.maps.Point(12, 24)
        }
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:4px; color:#333"><strong>${title}</strong></div>`
      });

      marker.addListener("click", () => {
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);
      bounds.extend(pos);
    };

    if (isOverview) {
      // Loop ALL days
      days.forEach((day, index) => {
        if (!visibleDayIds.has(day.id)) return; // Skip hidden days

        const color = PASTE_COLORS[index % PASTE_COLORS.length];
        const dayPoints: any[] = [];

        // 1. Hotel Start (if any)
        /* Omitting hotels in overview for clutter reduction usually, but strictly speaking "route" involves them.
           Let's focus on activities to keep it clean, as originally implemented.
           Original logic: "if (day.activities.length > 0) ... addMarker(first...)"
           Let's enhance: Draw the LINE for the day connecting all points.
        */

        // Collect points
        if (day.accommodation?.location) dayPoints.push(day.accommodation.location);
        day.activities.forEach(act => dayPoints.push(act.location));

        // Draw Markers for Key Spots
        if (day.accommodation?.location) {
          addMarker(day.accommodation.location, `${day.accommodation.name} (Day ${index + 1} Stay)`, "H", false, color);
        }

        day.activities.forEach((act, actIdx) => {
          addMarker(act.location, `${act.name} (Day ${index + 1})`, `${actIdx + 1}`, false, color);
        });

        // Draw Polyline for this day
        if (dayPoints.length > 1) {
          const line = new google.maps.Polyline({
            path: dayPoints,
            geodesic: true,
            strokeColor: color, // Day Color
            strokeOpacity: 0.8,
            strokeWeight: 4,
          });
          line.setMap(map);
          polylinesRef.current.push(line);
        }

        // Extend bounds for all points
        dayPoints.forEach(p => bounds.extend(p));
      });

    } else if (activeDay) {
      // Single Day View (Keep Indigo standard or use day color? Let's use day color for consistency)
      const index = days.findIndex(d => d.id === selectedDayId);
      const color = PASTE_COLORS[index % PASTE_COLORS.length];
      const points: any[] = [];

      if (activeDay.accommodation?.location) {
        addMarker(activeDay.accommodation.location, activeDay.accommodation.name + " (Stay)", undefined, false, color);
        points.push(activeDay.accommodation.location);
      }

      activeDay.activities.forEach((act, idx) => {
        addMarker(act.location, act.name, `${idx + 1}`, false, color);
        points.push(act.location);
      });

      if (points.length > 1) {
        const line = new google.maps.Polyline({
          path: points,
          geodesic: true,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 4,
          icons: [{
            icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: 'white', fillOpacity: 1, fillColor: color },
            offset: '100%',
            repeat: '100px'
          }],
        });
        line.setMap(map);
        polylinesRef.current.push(line);
      }
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
      const listener = google.maps.event.addListener(map, "idle", () => {
        if (map.getZoom() > 14) map.setZoom(14); // Cap max zoom
        google.maps.event.removeListener(listener);
      });
    } else if (map) {
      map.setCenter({ lat: 36.2048, lng: 138.2529 });
      map.setZoom(6);
    }

  }, [map, days, selectedDayId, isOverview, activeDay, visibleDayIds]);

  const toggleDay = (dayId: string) => {
    setVisibleDayIds(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full rounded-xl overflow-hidden shadow-inner border border-stone-200 bg-gray-100" />

      {/* Day Legend Overlay (Only on Overview) */}
      {isOverview && (
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-3 rounded-lg shadow-xl border border-gray-200 max-h-[80%] overflow-y-auto w-48 z-10">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Toggle Days</h4>
          <div className="space-y-2">
            {days.map((day, idx) => (
              <label key={day.id} className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                <input
                  type="checkbox"
                  checked={visibleDayIds.has(day.id)}
                  onChange={() => toggleDay(day.id)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: PASTE_COLORS[idx % PASTE_COLORS.length] }}
                />
                <span className="truncate">Day {idx + 1}: {day.city}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
