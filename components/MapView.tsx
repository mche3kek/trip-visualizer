import React, { useEffect, useRef, useState } from 'react';
import { DayPlan } from '../types';
import { getLoader } from '../services/mapService';

declare var google: any;

interface MapViewProps {
  days: DayPlan[];
  selectedDayId: string | null;
  focusedActivityId?: string | null;
}

export const MapView: React.FC<MapViewProps> = ({ days, selectedDayId, focusedActivityId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<any | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const markersRef = useRef<{ id: string, marker: any }[]>([]);
  const polylineRef = useRef<any | null>(null);

  const isOverview = selectedDayId === 'overview';
  const activeDay = days.find(d => d.id === selectedDayId);

  // Create map div on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Create a div element that React won't manage
    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    containerRef.current.appendChild(mapDiv);
    mapRef.current = mapDiv;

    return () => {
      // Cleanup: remove the map div when component unmounts
      if (mapRef.current && mapRef.current.parentNode) {
        mapRef.current.parentNode.removeChild(mapRef.current);
      }
      mapRef.current = null;
    };
  }, []);

  // Initialize Map using Loader (Async)
  useEffect(() => {
    if (map || !mapRef.current) return;

    // Use the key from env, or fall back to the one found in source
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID
      || "DEMO_MAP_ID";

    const loader = getLoader();

    loader.importLibrary("maps").then(async () => {
      const { Map } = await google.maps.importLibrary("maps") as any;

      const initialMap = new Map(mapRef.current, {
        zoom: 6,
        center: { lat: 36.2048, lng: 138.2529 },
        mapId: mapId,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });

      setMap(initialMap);
      setIsMapLoaded(true);
    }).catch(e => {
      console.error("Google Maps Load Error:", e);
      setMapError(e.message || "Failed to load Google Maps");
    });
  }, [map]);

  // Update Markers and Route
  useEffect(() => {
    if (!map || !isMapLoaded) return;

    const updateMap = async () => {
      try {
        // Import Marker Library
        const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker") as any;

        // Clear existing
        markersRef.current.forEach(m => m.marker.map = null);
        markersRef.current = [];
        if (polylineRef.current) {
          polylineRef.current.setMap(null);
        }

        const points: any[] = [];
        const bounds = new google.maps.LatLngBounds();

        const addMarker = (pos: { lat: number, lng: number }, title: string, id: string, labelText?: string, isCity = false) => {
          if (!pos || typeof pos.lat !== 'number') return;

          // Create Pin Element
          const pin = new PinElement({
            glyphText: labelText,
            glyphColor: "white",
            background: isCity ? "#4f46e5" : "#6366f1",
            borderColor: "#ffffff",
            scale: isCity ? 1.2 : 1,
          });

          const marker = new AdvancedMarkerElement({
            map,
            position: pos,
            title: title,
            content: pin.element,
            gmpClickable: true,
          });

          // InfoWindow
          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="padding:8px; color:#333; font-family:sans-serif;">
                <strong style="font-size:14px">${title}</strong>
                ${isCity ? '' : '<br/><span style="font-size:11px; color:#666">Click to zoom</span>'}
              </div>`,
            pixelOffset: new google.maps.Size(0, -30) // Adjust for pin height
          });

          marker.addListener("click", () => {
            infoWindow.open({ anchor: marker, map });
          });

          markersRef.current.push({ id, marker });
          bounds.extend(pos);
          points.push(pos);
        };

        if (isOverview) {
          days.forEach((day, index) => {
            if (day.activities.length > 0) {
              const first = day.activities[0];
              addMarker(first.location, `${day.city} (Day ${index + 1})`, day.id, `${index + 1}`, true);
            }
          });
        } else if (activeDay) {
          // Plot Accommodation
          if (activeDay.accommodation?.location) {
            const hotelPin = new PinElement({
              glyphText: "H",
              background: "#0ea5e9",
              borderColor: "#0369a1",
            });

            const hotelMarker = new AdvancedMarkerElement({
              map,
              position: activeDay.accommodation.location,
              title: activeDay.accommodation.name + " (Stay)",
              content: hotelPin.element,
            });

            const infoWindow = new google.maps.InfoWindow({
              content: `<div style="padding:4px; color:#333"><strong>${activeDay.accommodation.name}</strong><br/><span style="font-size:10px; color:#666">Start Point</span></div>`
            });
            hotelMarker.addListener("click", () => infoWindow.open({ anchor: hotelMarker, map }));

            markersRef.current.push({ id: 'hotel', marker: hotelMarker });
            bounds.extend(activeDay.accommodation.location);
            points.push(activeDay.accommodation.location);
          }

          activeDay.activities.forEach((act, index) => {
            addMarker(act.location, act.name, act.id, `${index + 1}`);
          });
        }

        if (points.length > 1) {
          polylineRef.current = new google.maps.Polyline({
            path: points,
            geodesic: true,
            strokeColor: isOverview ? "#ef4444" : "#6366f1",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            icons: isOverview ? undefined : [{
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: '#6366f1' },
              offset: '100%',
              repeat: '100px'
            }],
          });
          polylineRef.current.setMap(map);
        }

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds);
          if (points.length === 1) {
            // Wait for idle to avoid fitBounds override
            const listener = google.maps.event.addListener(map, "idle", () => {
              map.setZoom(13);
              google.maps.event.removeListener(listener);
            });
          }
        } else if (map) {
          map.setCenter({ lat: 36.2048, lng: 138.2529 });
          map.setZoom(6);
        }
      } catch (err) {
        console.error("Error updating map markers:", err);
      }
    };

    updateMap();
  }, [map, isMapLoaded, days, selectedDayId, isOverview, activeDay]);

  // Handle Focus Effect
  useEffect(() => {
    if (!map || !focusedActivityId || !isMapLoaded) return;

    const found = markersRef.current.find(m => m.id === focusedActivityId);
    if (found) {
      map.panTo(found.marker.position); // AdvancedMarkerElement uses .position (LatLng or LatLngLiteral)
      map.setZoom(15);
      // Programmatically trigger click to open info window
      google.maps.event.trigger(found.marker, 'click');
    }
  }, [focusedActivityId, map, isMapLoaded]);

  return (
    <div ref={containerRef} className="h-full w-full rounded-xl overflow-hidden shadow-inner border border-stone-200 bg-gray-100 relative">
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 text-red-500 p-4 text-center text-sm z-10">
          <strong>Map Error</strong>
          <p>Unable to load Google Maps.</p>
          <p className="text-xs mt-2 text-gray-500">{mapError}</p>
        </div>
      )}
      {!isMapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400">
          <span className="animate-pulse">Loading Map...</span>
        </div>
      )}
    </div>
  );
};