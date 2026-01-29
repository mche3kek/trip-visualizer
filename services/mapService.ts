import { Activity, Coordinates, TravelSegment } from "../types";
import { Loader } from '@googlemaps/js-api-loader';
import { getPublicTransportRoute } from './NavitimeService';

declare var google: any;

// Singleton loader instance to prevent "Loader must not be called again with different options" error
let loaderInstance: Loader | null = null;

export const getLoader = () => {
  if (!loaderInstance) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    loaderInstance = new Loader({
      apiKey: apiKey,
      version: "weekly",
      libraries: ["places", "geometry", "routes", "geocoding", "marker", "drawing", "maps"],
      region: 'JP',
      language: 'en'
    });
  }
  return loaderInstance;
};

// Haversine Distance Helper
const getDistance = (p1: Coordinates, p2: Coordinates) => {
  const R = 6371e3; // metres
  const φ1 = p1.lat * Math.PI / 180;
  const φ2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ1) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Geometric TSP (Nearest Neighbor)
const solveGeometricTSP = (origin: Coordinates, activities: Activity[]): number[] => {
  const visited = new Set<number>();
  const order: number[] = [];
  let currentPos = origin;

  while (visited.size < activities.length) {
    let nearestIdx = -1;
    let minDist = Infinity;

    activities.forEach((act, idx) => {
      if (!visited.has(idx)) {
        const dist = getDistance(currentPos, act.location);
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      }
    });

    if (nearestIdx !== -1) {
      visited.add(nearestIdx);
      order.push(nearestIdx);
      currentPos = activities[nearestIdx].location;
    } else {
      break;
    }
  }
  return order;
};

export const geocodeLocation = async (address: string): Promise<Coordinates | null> => {
  try {
    const loader = getLoader();
    await loader.importLibrary("geocoding");

    const geocoder = new google.maps.Geocoder();
    const response = await geocoder.geocode({ address });

    if (response.results && response.results.length > 0) {
      const loc = response.results[0].geometry.location;
      return { lat: loc.lat(), lng: loc.lng() };
    }
  } catch (error) {
    console.error("Geocoding failed:", error);
  }
  return null;
};

export const calculateFastestRoute = async (
  origin: Coordinates,
  activities: Activity[],
  returnToOrigin: boolean = true
): Promise<{ order: number[], totalDuration: string, durationValue: number, segments: TravelSegment[] } | null> => {
  if (activities.length === 0) return null;

  try {
    const loader = getLoader();
    await loader.importLibrary("routes");

    const directionsService = new google.maps.DirectionsService();

    // 1. Solve Order Geometrically (TSP) to minimize queries and distance
    const tspOrder = solveGeometricTSP(origin, activities);

    // Reorder activities based on TSP
    const orderedActivities = tspOrder.map(i => activities[i]);

    // 2. Prepare for API Calls
    // FIXED TIME: Tomorrow 10:00 AM JST as requested for representative public transport times
    const now = new Date();
    const departureTime = new Date(now);
    departureTime.setDate(departureTime.getDate() + 1);
    departureTime.setHours(10, 0, 0, 0); // Strict 10:00 AM

    let totalSeconds = 0;
    const segments: TravelSegment[] = [];

    // Points sequence: Origin -> Act[0] -> Act[1] ...
    // Note: orderedActivities[i] corresponds to the i-th step in the new order

    let currentLoc = origin;
    let currentId = "start"; // Placeholder for origin ID

    // We iterate through the ordered activities + return to origin
    // Note: Since we use a fixed representative time (10am), we don't strictly increment departureTime
    // for subsequent legs in the API call *if* we want each leg to represent "typical 10am traffic",
    // BUT usually routing needs sequential time.
    // However, user asked "take same day at for example 10 am so it's representative".
    // Let's stick to sequential time starting at 10am for realism of a day trip, 
    // OR reset to 10am if they want "independent" checks. Sequential is safer for "Day Plan".

    const steps = [...orderedActivities];

    // Loop through steps to calculate legs
    for (let i = 0; i < steps.length; i++) {
      const targetAct = steps[i];
      const targetLoc = targetAct.location;

      // Ensure departureTime is valid (simple check)
      if (isNaN(departureTime.getTime())) {
        const fallbackDate = new Date();
        fallbackDate.setDate(fallbackDate.getDate() + 1);
        fallbackDate.setHours(10, 0, 0, 0);
        departureTime.setTime(fallbackDate.getTime());
      }
      const isoTime = departureTime.toISOString().split('.')[0];

      // TRY NAVITIME (Transit) and GOOGLE (Walking) in PARALLEL
      const [navitimeResult, walkingResult] = await Promise.all([
        getPublicTransportRoute(
          currentLoc,
          targetLoc,
          isoTime
        ).catch(e => {
          console.warn("NAVITIME failed:", e);
          return null;
        }),
        directionsService.route({
          origin: currentLoc,
          destination: targetLoc,
          travelMode: 'WALKING'
        }).catch(e => {
          return null;
        })
      ]);

      let selectedSegment: TravelSegment | null = null;
      let legAdded = false;

      // 1. Process Google Walking Result
      let walkSeg: TravelSegment | null = null;
      if (walkingResult && walkingResult.routes && walkingResult.routes.length > 0) {
        const leg = walkingResult.routes[0].legs[0];
        walkSeg = {
          fromId: currentId,
          toId: targetAct.id,
          mode: 'WALKING',
          duration: leg.duration?.text || "",
          durationValue: leg.duration?.value || 0,
          distance: leg.distance?.text
        };
      }

      // 2. Process NAVITIME Result
      let transitSeg: TravelSegment | null = navitimeResult ? { ...navitimeResult, fromId: currentId, toId: targetAct.id } : null;

      // 3. DECISION TIME
      const CLOSE_MATCH_MINS = 15;

      if (transitSeg && walkSeg) {
        const tVal = transitSeg.durationValue;
        const wVal = walkSeg.durationValue;

        // Case A: Walk is insanely long (> 45 mins). Just show Transit.
        if (wVal > 45 * 60) {
          selectedSegment = transitSeg;
        }
        // Case B: Transit is significantly faster (> 15 mins faster)
        else if (tVal < wVal - (CLOSE_MATCH_MINS * 60)) {
          selectedSegment = transitSeg;
        }
        // Case C: Walking is significantly faster (> 15 mins faster)
        else if (wVal < tVal - (CLOSE_MATCH_MINS * 60)) {
          selectedSegment = walkSeg;
        }
        // Case D: They are competitive
        else {
          if (tVal <= wVal) {
            selectedSegment = {
              ...transitSeg,
              alternativeMode: 'WALKING',
              alternativeDuration: walkSeg.duration,
              alternativeLabel: `Walk: ${walkSeg.duration}`
            };
          } else {
            selectedSegment = {
              ...walkSeg,
              alternativeMode: transitSeg.mode as any,
              alternativeDuration: transitSeg.duration,
              alternativeLabel: `${transitSeg.mode === 'TRAIN' ? 'Train' : 'Bus'}: ${transitSeg.duration}`
            };
          }
        }
        legAdded = true;
      } else if (transitSeg) {
        selectedSegment = transitSeg;
        legAdded = true;
      } else if (walkSeg) {
        selectedSegment = walkSeg;
        legAdded = true;
      }

      // 4. Fallback: Google Transit
      if (!legAdded) {
        try {
          const result = await directionsService.route({
            origin: currentLoc,
            destination: targetLoc,
            travelMode: 'TRANSIT',
            transitOptions: { departureTime: departureTime }
          });
          if (result.routes && result.routes.length > 0) {
            const leg = result.routes[0].legs[0];
            selectedSegment = {
              fromId: currentId,
              toId: targetAct.id,
              mode: 'TRANSIT',
              duration: leg.duration?.text || "",
              durationValue: leg.duration?.value || 0,
              distance: leg.distance?.text
            };
            legAdded = true;
          }
        } catch (e) { }
      }

      // 5. Commit
      if (selectedSegment) {
        totalSeconds += selectedSegment.durationValue;
        departureTime.setSeconds(departureTime.getSeconds() + selectedSegment.durationValue);
        segments.push(selectedSegment);
      } else {
        segments.push({
          fromId: currentId,
          toId: targetAct.id,
          mode: 'WALKING',
          duration: "?",
          durationValue: 0
        });
      }

      currentLoc = targetLoc;
      currentId = targetAct.id;
    }

    if (returnToOrigin && steps.length > 0) {
      // Calculate return leg
      try {
        const result = await directionsService.route({
          origin: currentLoc,
          destination: origin,
          travelMode: 'TRANSIT',
          transitOptions: { departureTime: departureTime }
        });
        if (result.routes && result.routes.length > 0) {
          totalSeconds += result.routes[0].legs[0].duration?.value || 0;
        }
      } catch (e) { }
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const durationString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
      order: tspOrder,
      totalDuration: durationString,
      durationValue: totalSeconds,
      segments: segments
    };
  } catch (error) {
    console.error("Directions request failed:", error);
    return null;
  }
};

export const searchGooglePlace = async (query: string, fallbackQuery?: string): Promise<{
  name: string;
  placeId: string;
  location: Coordinates;
  photoUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
  address?: string;
} | null> => {
  try {
    // Call our local proxy server (Relative path handled by Vite Proxy in Dev, or same-origin in Prod)
    const fetchPlace = async (q: string) => {
      const response = await fetch(`/api/places/search?query=${encodeURIComponent(q)}`);
      if (!response.ok) return null;
      return await response.json();
    };

    let place = await fetchPlace(query);

    // Fallback logic handled by Server or Client? Server has some, but let's keep some client smarts if server returns null.
    // The server implementation I wrote handles " Japan" retry.
    // Let's rely on server for the main query.

    // If Primary Query failed, try Fallback if provided
    if (!place && fallbackQuery) {
      place = await fetchPlace(fallbackQuery);
      // If still null, try fallback + Japan
      if (!place) {
        place = await fetchPlace(`${fallbackQuery} Japan`);
      }
    }

    if (place) {
      // Construct Photo URL Client-Side using the Reference
      // https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=...&key=...
      let photoUrl = undefined;
      if (place.photoReference) {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${place.photoReference}&key=${apiKey}`;
      }

      return {
        name: place.name,
        placeId: place.placeId,
        location: place.location,
        photoUrl: photoUrl,
        rating: place.rating,
        userRatingsTotal: place.userRatingsTotal,
        address: place.formatted_address
      };
    }

    return null;

  } catch (e) {
    console.error("Place search error:", e);
    return null;
  }
};

const formatPlaceResult = (place: any) => {
  const photoUrl = place.photos && place.photos.length > 0
    ? place.photos[0].getUrl({ maxWidth: 600 })
    : null;

  return {
    name: place.name,
    placeId: place.place_id,
    location: {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    },
    photoUrl: photoUrl || undefined, // explicit undefined if null
    rating: place.rating,
    userRatingsTotal: place.user_ratings_total,
    address: place.formatted_address
  };
};