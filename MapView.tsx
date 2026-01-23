import React, { useEffect, useRef, useState } from 'react';
import { DayPlan } from './types';

declare var google: any;

interface MapViewProps {
  days: DayPlan[];
  selectedDayId: string | null;
}

export const MapView: React.FC<MapViewProps> = ({ days, selectedDayId }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any | null>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any | null>(null);

  const isOverview = selectedDayId === 'overview';
  const activeDay = days.find(d => d.id === selectedDayId);

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
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }

    const points: any[] = [];
    const bounds = new google.maps.LatLngBounds();

    const addMarker = (pos: { lat: number, lng: number }, title: string, label?: string, isCity = false) => {
      if (!pos || typeof pos.lat !== 'number') return;

      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: title,
        label: label ? { text: label, color: "white", fontSize: "12px", fontWeight: "bold" } : undefined,
        icon: isCity ? {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#4f46e5",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        } : undefined
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:4px; color:#333"><strong>${title}</strong></div>`
      });

      marker.addListener("click", () => {
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);
      bounds.extend(pos);
      points.push(pos);
    };

    if (isOverview) {
      days.forEach((day, index) => {
        if (day.activities.length > 0) {
          const first = day.activities[0];
          addMarker(first.location, `${day.city} (Day ${index + 1})`, `${index + 1}`, true);
        }
      });
    } else if (activeDay) {
      // Plot Accommodation if exists
      if (activeDay.accommodation?.location) {
        const hotelMarker = new google.maps.Marker({
          position: activeDay.accommodation.location,
          map,
          title: activeDay.accommodation.name + " (Stay)",
          icon: {
            path: "M2 20h20v-4H2v4zm2-15h4v2H4V5zm0 4h4v2H4V9zm0 4h4v2H4v-2zm6-8h4v2h-4V5zm0 4h4v2h-4V9zm0 4h4v2h-4v-2zm6-8h4v2h-4V5zm0 4h4v2h-4V9zm0 4h4v2h-4v-2zM2 22h20",
            fillColor: "#0ea5e9",
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: "#0369a1",
            scale: 1,
            anchor: new google.maps.Point(12, 12)
          }
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="padding:4px; color:#333"><strong>${activeDay.accommodation.name}</strong><br/><span style="font-size:10px; color:#666">Start Point</span></div>`
        });
        hotelMarker.addListener("click", () => infoWindow.open(map, hotelMarker));

        markersRef.current.push(hotelMarker);
        bounds.extend(activeDay.accommodation.location);
        points.push(activeDay.accommodation.location);
      }

      activeDay.activities.forEach((act, index) => {
        addMarker(act.location, act.name, `${index + 1}`);
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
        map.setZoom(13);
      }
    } else if (map) {
      map.setCenter({ lat: 36.2048, lng: 138.2529 });
      map.setZoom(6);
    }

  }, [map, days, selectedDayId, isOverview, activeDay]);

  return (
    <div ref={mapRef} className="h-full w-full rounded-xl overflow-hidden shadow-inner border border-stone-200 bg-gray-100" />
  );
};
