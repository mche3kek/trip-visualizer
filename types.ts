export interface Coordinates {
  lat: number;
  lng: number;
}

// Pricing types for expense tracking
export interface PriceEntry {
  label: string;           // e.g. "Adult", "Child", "Senior", "Student"
  amount: number;          // In Yen
  currency?: string;       // Default: JPY
}

export interface ActivityPricing {
  isFree?: boolean;
  basePrice?: number;      // Primary admission price in Yen
  priceEntries?: PriceEntry[];  // Different price tiers
  priceLink?: string;      // Official pricing page URL
  priceNotes?: string;     // AI-generated tips (e.g. "Free on first Sunday")
  lastUpdated?: string;    // ISO date when price was fetched
}

export interface Activity {
  id: string;
  name: string;
  description: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  location: Coordinates;
  type: 'sightseeing' | 'food' | 'travel' | 'shopping' | 'leisure';
  costEstimate?: number; // Legacy - In Yen
  pricing?: ActivityPricing; // New detailed pricing
  imageUrl?: string;
  link?: string;
  subActivities?: string[];
  durationReasoning?: string; // AI explanation for time spent
  suggestedAfterId?: string; // ID of activity this should follow
  googlePlaceId?: string; // Official Google Maps Place ID
  lockedStartTime?: boolean; // If true, this activity's start time is an anchor
  lockedDurationMinutes?: number; // If set, lock the duration to this many minutes
}

export interface TravelSegment {
  fromId: string;
  toId: string;
  mode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'TRAIN' | 'BUS';
  duration: string; // formatted string e.g. "15 mins"
  durationValue: number; // seconds
  distance?: string;
  transitFare?: number;
  alternativeMode?: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'TRAIN' | 'BUS';
  alternativeDuration?: string;
  alternativeLabel?: string;
}

export interface DayPlan {
  id: string;
  date: string; // YYYY-MM-DD
  city: string; // Main city for the day
  startTime?: string; // HH:mm - Time user leaves hotel
  accommodation?: {
    name: string;
    location?: Coordinates;
  };
  activities: Activity[];
  travelSegments?: TravelSegment[];
  notes?: string;
}

export interface Trip {
  title: string;
  days: DayPlan[];
}

export enum ViewMode {
  List = 'LIST',
  Map = 'MAP',
  Stats = 'STATS'
}

export interface AiRecommendation {
  duration: string;
  description: string;
  coordinates: Coordinates;
  reasoning?: string;
}

export interface OptimizationResult {
  orderedIds: string[];
  reasoning: string;
}

export interface PlaceAnalysis {
  action: 'keep' | 'rename' | 'split';
  data: string | string[]; // New name OR list of names to split into
  reason: string;
}

export interface LocalEvent {
  id: string;
  name: string;
  description: string;
  startTime: string; // "14:00" or "All Day"
  endTime?: string;
  location: string; // Text address or venue name
  coordinates?: Coordinates;
  category: 'festival' | 'music' | 'sports' | 'arts' | 'other';
  priceLabel?: string; // "Free", "¥2000", etc.
  date: string; // YYYY-MM-DD
}