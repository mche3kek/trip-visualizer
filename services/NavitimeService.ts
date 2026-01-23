import { TravelSegment, Coordinates } from "../types";

const RAPID_API_KEY = import.meta.env.VITE_NAVITIME_API_KEY;
const RAPID_API_HOST = "navitime-route-totalnavi.p.rapidapi.com";

interface NavitimeResponse {
    items: Array<{
        sections: Array<{
            type: string; // "move" or "point"
            mode?: string; // "train", "walk", "bus"
            name?: string;
            distance?: number; // meters
            time?: number; // minutes
            from_name?: string;
            to_name?: string;
            line_name?: string;
        }>;
        summary: {
            move: {
                time: number; // minutes, total
                distance: number; // meters
                fare?: { unit_0?: number; unit_48?: number };
            };
            time: number; // total time in minutes
        };
    }>;
}

export const getPublicTransportRoute = async (
    origin: Coordinates,
    destination: Coordinates,
    startTimeIso: string // YYYY-MM-DDThh:mm:ss
): Promise<TravelSegment | null> => {

    // Format coordinates as lat,lng string
    const startStr = `${origin.lat},${origin.lng}`;
    const goalStr = `${destination.lat},${destination.lng}`;

    // NAVITIME RapidAPI Endpoint
    // Docs: https://rapidapi.com/navitime-navitime-default/api/navitime-route-totalnavi
    // Note: unuse=car caused 400 errors, and route_transit implies transit anyway.
    const url = `https://${RAPID_API_HOST}/route_transit?start=${startStr}&goal=${goalStr}&start_time=${startTimeIso}`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "x-rapidapi-key": RAPID_API_KEY,
                "x-rapidapi-host": RAPID_API_HOST,
            },
        });

        if (!response.ok) {
            console.error("NAVITIME API Error:", response.status, await response.text());
            return null;
        }

        const data: NavitimeResponse = await response.json();

        if (!data.items || data.items.length === 0) {
            console.warn("NAVITIME: No route found.");
            return null;
        }

        // Take the first (best) route
        const firstRoute = data.items[0];
        const summary = firstRoute.summary;

        // Extract Fare: Prefer unit_0 (ticket/cash) or unit_48 (IC)
        let fare = 0;
        if (summary.move.fare) {
            fare = summary.move.fare.unit_0 || summary.move.fare.unit_48 || 0;
        }

        // Convert to our TravelSegment format
        // Time is in summary.move.time (minutes) or sometimes summary.time check both
        const minutes = summary.move.time || summary.time;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const durationText = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;

        // Determine primary mode (TRAIN or BUS or WALKING)
        // We check the sections to see if any transit is used.
        // Determine primary mode (TRAIN or BUS or WALKING)
        // We check the sections to see if any transit is used.
        // Also check summary.move.move_type which lists all types e.g. ["rapid_train", "walk"]
        let primaryMode = 'WALKING';

        // 1. Check sections first (if detailed)
        const sections = firstRoute.sections || [];
        const hasTrainSection = sections.some(s => s.mode === 'train' || s.mode === 'subway' || s.mode === 'bullet_train');
        const hasBusSection = sections.some(s => s.mode === 'bus' || s.mode === 'local_bus');

        // 2. Check summary move_type (more reliable for summary)
        const moveTypes = (summary.move as any).move_type || [];
        const hasTrainType = moveTypes.some((t: string) => t.includes('train') || t.includes('subway') || t.includes('monorail'));
        const hasBusType = moveTypes.some((t: string) => t.includes('bus'));

        if (hasTrainSection || hasTrainType) primaryMode = 'TRAIN';
        else if (hasBusSection || hasBusType) primaryMode = 'BUS';

        // 3. Safety Fallback: If we have a significant fare but still think we are walking, 
        // it implies we missed the mode. Default to TRAIN (most common for fare).
        if (primaryMode === 'WALKING' && fare > 0) {
            primaryMode = 'TRAIN';
        }

        // For better debugging/UI, let's list the lines used.
        const transportLines = sections
            .filter(s => s.line_name)
            .map(s => s.line_name)
            .join(", ");

        return {
            mode: primaryMode as 'WALKING' | 'TRAIN' | 'BUS', // Map to specific types
            duration: durationText,
            durationValue: minutes * 60, // seconds
            distance: `${(summary.move.distance / 1000).toFixed(1)} km`,
            transitFare: fare > 0 ? fare : undefined,
            // We can add a custom field for description if we extend the type, 
            // or just assume standard generic usage. 
            // For now, let's keep it standard.
        } as TravelSegment; // casting as we don't have fromId/toId here yet

    } catch (error) {
        console.error("NAVITIME Network Error:", error);
        return null;
    }
};
