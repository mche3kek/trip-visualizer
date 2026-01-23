import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Trip, DayPlan, Activity, ViewMode, TravelSegment } from './types';
import { INITIAL_TRIP } from './constants';
import { ActivityCard } from './components/ActivityCard';
import { MapView } from './components/MapView';
import { StatsView } from './components/StatsView';
import { PrintLayout } from './components/PrintLayout';
import { Map, BarChart3, Plus, Plane, ChevronRight, Globe, List, ArrowDownAZ, BedDouble, Zap, Map as MapIcon, Trash2, Edit3, Sparkles, StickyNote, X, Filter, Clock, Footprints, Train, Car, Bus, Image as ImageIcon, ExternalLink, Wallet, Calendar, Printer } from 'lucide-react';
import { findActivityImage, generateItinerary, getItinerarySuggestions, getRecommendedDuration, getActivityPricing } from './services/geminiService';
import { geocodeLocation, calculateFastestRoute, searchGooglePlace } from './services/mapService';
import { WeatherWidget } from './components/WeatherWidget';
import { EventSuggestions } from './components/EventSuggestions';
import { LocalEvent } from './types';

declare var google: any;

// Helper to convert HH:mm to minutes
const timeToMins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Helper to convert minutes to HH:mm
const minsToTime = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const min = Math.floor(m % 60);
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
};

// Helper to calculate daily expenses
const calculateDayExpenses = (day: DayPlan) => {
  // Sum activity prices
  const attractionsCost = day.activities.reduce((sum, act) => {
    return sum + (act.pricing?.basePrice || 0);
  }, 0);

  // Sum transit fares
  const transitCost = (day.travelSegments || []).reduce((sum, seg) => {
    return sum + (seg.transitFare || 0);
  }, 0);

  // Separate by type
  const byType: Record<string, number> = {};
  day.activities.forEach(act => {
    const cost = act.pricing?.basePrice || 0;
    byType[act.type] = (byType[act.type] || 0) + cost;
  });

  return {
    total: attractionsCost + transitCost,
    attractions: attractionsCost,
    transit: transitCost,
    byType
  };
};

export default function App() {
  const [trip, setTrip] = useState<Trip>(INITIAL_TRIP);
  const [selectedDayId, setSelectedDayId] = useState<string>(trip.days[0].id);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.List);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAddingAct, setIsAddingAct] = useState(false);
  const [isAiPlanning, setIsAiPlanning] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(null);

  // Filtering State
  const [filterType, setFilterType] = useState<Activity['type'] | 'all'>('all');

  // Drag State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Recommendation State
  const [suggestions, setSuggestions] = useState<Activity[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [failedSuggestionImages, setFailedSuggestionImages] = useState<Set<string>>(new Set());

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newActData, setNewActData] = useState<{ name: string, type: Activity['type'], startTime: string, endTime: string }>({
    name: '', type: 'sightseeing', startTime: '10:00', endTime: '12:00'
  });

  // Print Handling
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Japan_Trip_Guide_${trip.days[0]?.date || 'Plan'}`
  });

  const activeDay = trip.days.find(d => d.id === selectedDayId);
  const isOverview = selectedDayId === 'overview';

  // --- Auto-Fetch Missing Images ---
  React.useEffect(() => {
    // Debounce or single-run check
    const fetchMissingImages = async () => {
      // Find all activities across all days that have NO image URL
      const activitiesToUpdate: { dayId: string, actId: string, name: string, city: string }[] = [];

      trip.days.forEach(day => {
        day.activities.forEach(act => {
          if (!act.imageUrl || act.imageUrl === '') {
            activitiesToUpdate.push({ dayId: day.id, actId: act.id, name: act.name, city: day.city });
          }
        });
      });

      if (activitiesToUpdate.length === 0) return;

      // don't spam, just process
      console.log(`Found ${activitiesToUpdate.length} activities missing images. Fetching...`);

      for (const item of activitiesToUpdate) {
        try {
          // Check if we already have a reliable cached version in localstorage? 
          // actually searchGooglePlace caches in memory mapService side if we wanted, 
          // but here we just want to update the State.
          const place = await searchGooglePlace(`${item.name} ${item.city}`);
          if (place && place.photoUrl) {
            setTrip(prev => ({
              ...prev,
              days: prev.days.map(d =>
                d.id === item.dayId
                  ? {
                    ...d,
                    activities: d.activities.map(a =>
                      a.id === item.actId ? { ...a, imageUrl: place.photoUrl, location: place.location, googlePlaceId: place.placeId } : a
                    )
                  }
                  : d
              )
            }));
          }
        } catch (e) {
          console.error(`Failed to auto-fetch image for ${item.name}`, e);
        }
      }
    };

    // run once after mount (using a timeout to let initial state settle if needed, or just run)
    const t = setTimeout(fetchMissingImages, 1000);
    return () => clearTimeout(t);
  }, []); // Empty dependency array = run once on mount. 
  // NOTE: If we want it to run when trip changes (e.g. adding new items), we'd need to be smarter to avoid loops.
  // For now, this fixes the "Initial Load" issue.

  // --- Logic Helpers ---

  // Helper to round minutes to nearest 5
  const roundTo5 = (mins: number) => Math.ceil(mins / 5) * 5;

  /**
 * Recalculate activity times based on travel segments.
 * Uses actual travel durations if available, falls back to 30 min buffer.
 * Respects lockedStartTime and lockedDurationMinutes.
 */
  const recalculateSchedule = (
    activities: Activity[],
    dayStartTime: string = '09:00',
    travelSegments?: TravelSegment[]
  ) => {
    if (activities.length === 0) return activities;

    const result: Activity[] = [];
    let currentMins = timeToMins(dayStartTime);

    for (let index = 0; index < activities.length; index++) {
      const act = activities[index];

      // Calculate duration: use locked duration if set, else from current times
      let durationMins = act.lockedDurationMinutes
        || (timeToMins(act.endTime) - timeToMins(act.startTime));
      if (durationMins <= 0) durationMins = 60; // Default fallback

      let newStartMins: number;

      if (act.lockedStartTime) {
        // Respect locked start time
        newStartMins = timeToMins(act.startTime);
      } else if (index === 0) {
        // First activity starts at day start time
        newStartMins = roundTo5(currentMins);
      } else {
        // Use the COMPUTED end time of the previous activity (from result array)
        const prevAct = activities[index - 1];
        const prevResult = result[index - 1];
        const prevEndMins = timeToMins(prevResult.endTime);

        // Find travel segment from previous activity to this one
        const segment = travelSegments?.find(
          s => s.fromId === prevAct.id && s.toId === act.id
        );

        // Travel time in minutes (durationValue is in seconds)
        const travelMins = segment ? Math.ceil(segment.durationValue / 60) : 30;

        // New start = prev end + travel, rounded to 5 min
        newStartMins = roundTo5(prevEndMins + travelMins);
      }

      const newStart = minsToTime(newStartMins);
      const newEnd = minsToTime(newStartMins + durationMins);

      // Update currentMins for next iteration (in case no travelSegments)
      currentMins = newStartMins + durationMins;

      result.push({ ...act, startTime: newStart, endTime: newEnd });
    }

    return result;
  };

  // --- Handlers ---

  const handleUpdateActivity = (dayId: string, updatedActivity: Activity) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.id === dayId) {
          // Update the activity first
          const updatedActivities = day.activities.map(a =>
            a.id === updatedActivity.id ? updatedActivity : a
          );
          // Recalculate the schedule to propagate changes (especially locked duration)
          return {
            ...day,
            activities: recalculateSchedule(updatedActivities, day.startTime, day.travelSegments)
          };
        }
        return day;
      })
    }));
  };

  const handleDeleteActivity = (dayId: string, activityId: string) => {
    console.log("Attempting to delete:", dayId, activityId);
    if (!confirm('Remove this activity?')) return;

    setTrip(prev => {
      return {
        ...prev,
        days: prev.days.map(day => {
          if (day.id === dayId) {
            const originalLen = day.activities.length;
            // Robust comparison: Ensure both are strings and trim whitespace
            const newActivities = day.activities.filter(a => {
              const isMatch = String(a.id).trim() === String(activityId).trim();
              if (isMatch) console.log(`Matched activity to delete: ${a.name} (${a.id})`);
              return !isMatch;
            });
            console.log(`Day ${day.id}: filtered ${originalLen} -> ${newActivities.length}`);

            if (originalLen === newActivities.length) {
              console.warn("Deletion failed: No activity found with ID", activityId);
              console.log("Available IDs:", day.activities.map(a => a.id));
            }

            return { ...day, activities: recalculateSchedule(newActivities, day.startTime) };
          }
          return day;
        })
      }
    });
  };

  const handleSplitActivity = async (original: Activity, newNames: string[]) => {
    if (!activeDay) return;

    // We will replace the original with N new activities
    // 1. Fetch details for each new name
    const newActivities: Activity[] = [];
    const durPerAct = Math.max(60, (timeToMins(original.endTime) - timeToMins(original.startTime)) / newNames.length); // Split duration or default 1h

    for (let i = 0; i < newNames.length; i++) {
      const name = newNames[i];
      const place = await searchGooglePlace(`${name} ${activeDay.city}`);

      // Approx time distribution - will be fixed by recalculateSchedule later
      const startMins = timeToMins(original.startTime) + (i * durPerAct);

      newActivities.push({
        id: `split-${original.id}-${i}`,
        name: place ? place.name : name,
        description: `Split from ${original.name}`,
        startTime: minsToTime(startMins),
        endTime: minsToTime(startMins + durPerAct),
        location: place ? place.location : original.location,
        type: original.type,
        imageUrl: place?.photoUrl || original.imageUrl,
        googlePlaceId: place?.placeId
      });
    }

    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.id === activeDay.id) {
          const idx = day.activities.findIndex(a => a.id === original.id);
          if (idx === -1) return day;

          const updatedList = [...day.activities];
          updatedList.splice(idx, 1, ...newActivities);

          return { ...day, activities: recalculateSchedule(updatedList, day.startTime) };
        }
        return day;
      })
    }));
  };

  const handleMoveActivity = (dayId: string, index: number, direction: 'up' | 'down') => {
    setTrip(prev => {
      const newDays = [...prev.days];
      const dayIndex = newDays.findIndex(d => d.id === dayId);
      if (dayIndex === -1) return prev;

      const day = { ...newDays[dayIndex] };
      const activities = [...day.activities];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex >= 0 && targetIndex < activities.length) {
        // Swap
        [activities[index], activities[targetIndex]] = [activities[targetIndex], activities[index]];

        // Recalculate times using existing travel segments
        day.activities = recalculateSchedule(activities, day.startTime, day.travelSegments);

        newDays[dayIndex] = day;
        return { ...prev, days: newDays };
      }
      return prev;
    });
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data transfer to be set
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex || !activeDay) return;

    setTrip(prev => {
      const newDays = [...prev.days];
      const dayIndex = newDays.findIndex(d => d.id === activeDay.id);
      if (dayIndex === -1) return prev;

      const day = { ...newDays[dayIndex] };
      const activities = [...day.activities];

      // Move item
      const [movedItem] = activities.splice(draggedIndex, 1);
      activities.splice(targetIndex, 0, movedItem);

      // Intelligent Time Recalculation using existing travel segments
      day.activities = recalculateSchedule(activities, day.startTime, day.travelSegments);

      newDays[dayIndex] = day;
      return { ...prev, days: newDays };
    });
    setDraggedIndex(null);
  };

  const handleSortByTime = (dayId: string) => {
    setTrip(prev => {
      const newDays = [...prev.days];
      const dayIndex = newDays.findIndex(d => d.id === dayId);
      if (dayIndex === -1) return prev;

      const day = { ...newDays[dayIndex] };
      day.activities = [...day.activities].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );
      // Recalculate strictly based on day start? 
      // User asked for sorting, usually implies they want to fix the order but keep their times, OR fix times.
      // Let's assume re-sorting implies re-flow.
      day.activities = recalculateSchedule(day.activities, day.startTime);

      newDays[dayIndex] = day;
      return { ...prev, days: newDays };
    });
  };

  const handleOptimizeRoute = async (dayId: string) => {
    if (!activeDay || activeDay.activities.length < 2) {
      alert("Add at least 2 activities to optimize the route.");
      return;
    }

    if (!(window as any).google || !(window as any).google.maps) {
      alert("Google Maps is still loading. Please try again in a moment.");
      return;
    }

    setIsOptimizing(true);

    try {
      let startLocation = activeDay.accommodation?.location;

      if (!startLocation && activeDay.accommodation?.name) {
        const coords = await geocodeLocation(activeDay.accommodation.name);
        if (coords) {
          startLocation = coords;
          handleUpdateHotel(dayId, activeDay.accommodation.name, coords);
        }
      }

      if (!startLocation && activeDay.activities.length > 0) {
        startLocation = activeDay.activities[0].location;
      }

      if (!startLocation) {
        setIsOptimizing(false);
        alert("Could not determine a start location. Please set a hotel or ensure activities have locations.");
        return;
      }

      const result = await calculateFastestRoute(startLocation, activeDay.activities);

      if (result) {
        setTrip(prev => {
          const newDays = [...prev.days];
          const dayIdx = newDays.findIndex(d => d.id === dayId);
          const day = { ...newDays[dayIdx] };

          const newActivities = result.order.map(index => day.activities[index]);

          // Recalculate times based on optimized order, using actual travel times
          day.activities = recalculateSchedule(newActivities, day.startTime, result.segments);
          day.travelSegments = result.segments; // Save travel segments (Walking/Transit info)

          newDays[dayIdx] = day;
          return { ...prev, days: newDays };
        });
        alert(`Route Optimized!\nTotal Estimated Driving Time: ${result.totalDuration}\n(Round trip from start point)`);
      } else {
        alert("Could not calculate route. Please check if locations are valid/reachable by car.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during optimization.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAiPlan = async () => {
    if (!activeDay || !aiPrompt.trim()) return;
    setIsAiPlanning(true);

    const newActivities = await generateItinerary(activeDay.city, aiPrompt, activeDay.activities);

    setIsAiPlanning(false);
    setAiPrompt("");

    if (newActivities && newActivities.length > 0) {
      setTrip(prev => ({
        ...prev,
        days: prev.days.map(day =>
          day.id === activeDay.id
            ? { ...day, activities: recalculateSchedule([...day.activities, ...newActivities], day.startTime) } // Append new
            : day
        )
      }));

      newActivities.forEach(async (act) => {
        const place = await searchGooglePlace(`${act.name} ${activeDay.city}`, act.name);
        if (place && place.photoUrl) {
          handleUpdateActivity(activeDay.id, { ...act, imageUrl: place.photoUrl, location: place.location });
        }
      });
    } else {
      alert("AI couldn't generate a plan. Try be more specific.");
    }
  };

  const handleGetSuggestions = async () => {
    if (!activeDay) return;
    setIsLoadingSuggestions(true);
    setSuggestions([]);

    // Collect all existing names for deduplication
    const allNames = trip.days.flatMap(d => d.activities.map(a => a.name));

    const recs = await getItinerarySuggestions(activeDay.city, activeDay.activities, allNames);

    if (recs && recs.length > 0) {
      // Fetch real Google Place photos for each suggestion IN PARALLEL and WAIT for all
      const suggestionsWithImages = await Promise.all(
        recs.map(async (act) => {
          try {
            const place = await searchGooglePlace(`${act.name} ${activeDay.city}`, act.name);
            if (place && place.photoUrl) {
              return { ...act, imageUrl: place.photoUrl, location: place.location, googlePlaceId: place.placeId };
            }
          } catch (e) {
            console.error('Failed to fetch image for suggestion:', act.name, e);
          }
          return act; // Return as-is if image fetch fails
        })
      );

      setSuggestions(suggestionsWithImages);
    }

    setIsLoadingSuggestions(false);
  };

  const acceptSuggestion = async (suggestion: Activity) => {
    if (!activeDay) return;

    // Determine insertion index based on suggestedAfterId
    let insertIndex = activeDay.activities.length; // Default append
    if (suggestion.suggestedAfterId === 'start') {
      insertIndex = 0;
    } else if (suggestion.suggestedAfterId) {
      const idx = activeDay.activities.findIndex(a => a.id === suggestion.suggestedAfterId);
      if (idx !== -1) insertIndex = idx + 1;
    }

    // Create the activity to insert
    const activityToInsert = { ...suggestion };
    const dayId = activeDay.id;
    const cityName = activeDay.city;

    setTrip(prev => {
      const newDays = [...prev.days];
      const dayIdx = newDays.findIndex(d => d.id === dayId);
      const day = { ...newDays[dayIdx] };

      // Insert
      const newActivities = [...day.activities];
      newActivities.splice(insertIndex, 0, activityToInsert);

      // Recalculate times - this will apply the duration from the suggestion
      day.activities = recalculateSchedule(newActivities, day.startTime);

      newDays[dayIdx] = day;
      return { ...prev, days: newDays };
    });

    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

    // After inserting, ensure the image is fetched if missing
    // This runs async after the state update
    if (!suggestion.imageUrl) {
      try {
        const place = await searchGooglePlace(`${suggestion.name} ${cityName}`, suggestion.name);
        if (place && place.photoUrl) {
          setTrip(prev => ({
            ...prev,
            days: prev.days.map(d =>
              d.id === dayId
                ? {
                  ...d,
                  activities: d.activities.map(a =>
                    a.id === suggestion.id ? { ...a, imageUrl: place.photoUrl, location: place.location, googlePlaceId: place.placeId } : a
                  )
                }
                : d
            )
          }));
        }
      } catch (e) {
        console.error('Failed to fetch image for accepted suggestion:', e);
      }
    }

    // Auto-fetch pricing in background
    getActivityPricing(suggestion.name, cityName).then(pricing => {
      if (pricing) {
        setTrip(prev => ({
          ...prev,
          days: prev.days.map(d =>
            d.id === dayId
              ? {
                ...d,
                activities: d.activities.map(a =>
                  a.id === suggestion.id ? { ...a, pricing } : a
                )
              }
              : d
          )
        }));
      }
    }).catch(e => console.error('Background price fetch failed:', e));
  };

  const openAddActivityModal = () => {
    setNewActData({ name: '', type: 'sightseeing', startTime: '10:00', endTime: '12:00' });
    setIsAddModalOpen(true);
  };

  const confirmAddActivity = async () => {
    if (!activeDay || !newActData.name) return;

    setIsAddingAct(true);
    // don't close modal yet, wait for data

    const name = newActData.name;
    const dayId = activeDay.id;

    // 1. Get Place Data (Location + Photo)
    let location = { lat: 35.6762, lng: 139.6503 };
    let finalName = name;
    let photoUrl: string | undefined = undefined;
    let placeId: string | undefined = undefined;

    try {
      const place = await searchGooglePlace(`${name} ${activeDay.city}`, name);
      if (place) {
        location = place.location;
        finalName = place.name;
        photoUrl = place.photoUrl || undefined;
        placeId = place.placeId;
      } else {
        // Fallback geocoding if place search fails completely
        const geocoded = await geocodeLocation(`${name}, ${activeDay?.city || 'Japan'}`);
        if (geocoded) location = geocoded;
      }
    } catch (e) {
      console.warn("Error fetching place data:", e);
    }

    // 2. Create Activity Object
    const newActivity: Activity = {
      id: `new-${Date.now()}`,
      name: finalName,
      description: 'Planned stop',
      startTime: '09:00', // Placeholder, will be autoscheduled
      endTime: '10:00',   // Placeholder duration (1h)
      location: location,
      type: newActData.type,
      imageUrl: photoUrl,
      googlePlaceId: placeId,
      lockedStartTime: false // Default to unlocked
    };

    // 2.5 Get Smart Duration (if we have a place)
    try {
      const durationRec = await getRecommendedDuration(finalName, activeDay.city);
      if (durationRec && typeof durationRec.durationMinutes === 'number') {
        console.log("AI Duration Rec:", durationRec);
        newActivity.durationReasoning = durationRec.reasoning;

        const addMins = durationRec.durationMinutes;

        // Update End Time
        const startM = timeToMins(newActData.startTime);
        newActivity.endTime = minsToTime(startM + addMins);
      }
    } catch (e) {
      console.warn("Smart Duration failed", e);
    }

    // 3. Single Atomic State Update
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day =>
        day.id === dayId
          ? { ...day, activities: recalculateSchedule([...day.activities, newActivity], day.startTime) }
          : day
      )
    }));

    // Auto-fetch pricing in background
    const cityForPricing = activeDay.city;
    const activityId = newActivity.id;
    getActivityPricing(finalName, cityForPricing).then(pricing => {
      if (pricing) {
        setTrip(prev => ({
          ...prev,
          days: prev.days.map(d =>
            d.id === dayId
              ? {
                ...d,
                activities: d.activities.map(a =>
                  a.id === activityId ? { ...a, pricing } : a
                )
              }
              : d
          )
        }));
      }
    }).catch(e => console.error('Background price fetch failed:', e));

    setIsAddingAct(false);
    setIsAddModalOpen(false);
  };

  const handleAddLocalEvent = async (event: LocalEvent) => {
    if (!activeDay) return;

    // 1. Enrich data (Coordinates & Image)
    const searchText = `${event.name} ${event.location} ${activeDay.city}`;
    let location = { lat: 35.6762, lng: 139.6503 };
    let photoUrl: string | undefined = undefined;
    let placeId: string | undefined = undefined;

    try {
      const place = await searchGooglePlace(searchText);
      if (place) {
        location = place.location;
        photoUrl = place.photoUrl;
        placeId = place.placeId;
      } else {
        const coords = await geocodeLocation(searchText);
        if (coords) location = coords;
      }
    } catch (e) {
      console.warn("Event enrichment failed", e);
    }

    // 2. Create Activity
    const newActivity: Activity = {
      id: event.id, // Use event ID or new one
      name: event.name,
      description: event.description,
      startTime: event.startTime.includes(':') ? event.startTime : '10:00',
      endTime: '12:00', // Default 2h
      location: location,
      type: event.category === 'music' || event.category === 'arts' ? 'leisure' : 'sightseeing',
      imageUrl: photoUrl,
      googlePlaceId: placeId,
      link: event.priceLabel, // Abuse link field or description? Maybe just keep priceLabel in description or pricing
      pricing: event.priceLabel ? {
        isFree: event.priceLabel.toLowerCase().includes('free'),
        basePrice: 0,
        priceNotes: event.priceLabel
      } : undefined
    };

    // 3. Add to Trip
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day =>
        day.id === activeDay.id
          ? { ...day, activities: recalculateSchedule([...day.activities, newActivity], day.startTime) }
          : day
      )
    }));

    setIsEventModalOpen(false);
  };

  const handleAddDay = () => {
    const newDayId = `day-${Date.now()}`;
    const lastDay = trip.days[trip.days.length - 1];
    const newDate = new Date(lastDay ? lastDay.date : '2025-01-01');
    newDate.setDate(newDate.getDate() + 1);

    const newDay: DayPlan = {
      id: newDayId,
      date: newDate.toISOString().split('T')[0],
      city: lastDay ? lastDay.city : 'Tokyo',
      startTime: '09:00',
      activities: []
    };

    setTrip(prev => ({
      ...prev,
      days: [...prev.days, newDay]
    }));
    setSelectedDayId(newDayId);
  };

  const handleDeleteDay = (dayId: string) => {
    if (trip.days.length <= 1) {
      alert("You must have at least one day.");
      return;
    }
    if (!confirm("Are you sure you want to delete this entire day?")) return;

    const newDays = trip.days.filter(d => d.id !== dayId);
    setTrip(prev => ({ ...prev, days: newDays }));
    if (selectedDayId === dayId) {
      setSelectedDayId(newDays[0].id);
    }
  };

  const handleUpdateCity = (dayId: string, newCity: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day =>
        day.id === dayId
          ? { ...day, city: newCity }
          : day
      )
    }));
  };

  const handleUpdateHotel = (dayId: string, hotelName: string, location?: { lat: number, lng: number }) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day =>
        day.id === dayId
          ? { ...day, accommodation: { name: hotelName, location: location || day.accommodation?.location } }
          : day
      )
    }));
  };

  const handleUpdateDayStartTime = (dayId: string, newTime: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            startTime: newTime,
            activities: recalculateSchedule(day.activities, newTime)
          };
        }
        return day;
      })
    }));
  }

  const handleUpdateNotes = (dayId: string, notes: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day =>
        day.id === dayId
          ? { ...day, notes }
          : day
      )
    }));
  };

  const handleOpenGoogleMaps = () => {
    if (!activeDay) return;
    let url = "https://www.google.com/maps/dir/";
    if (activeDay.accommodation?.name) {
      url += `${encodeURIComponent(activeDay.accommodation.name)}/`;
    }
    activeDay.activities.forEach(act => {
      url += `${act.location.lat},${act.location.lng}/`;
    });
    window.open(url, '_blank');
  };

  const getDayLabel = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  };

  const FILTERS: (Activity['type'] | 'all')[] = ['all', 'sightseeing', 'food', 'shopping', 'leisure', 'travel'];

  const displayedActivities = activeDay
    ? activeDay.activities.filter(a => filterType === 'all' || a.type === filterType)
    : [];

  return (
    <div className="flex flex-col h-screen bg-stone-50 overflow-hidden font-sans">

      {/* ADD ACTIVITY MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Add New Activity</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Activity Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newActData.name}
                  onChange={(e) => setNewActData({ ...newActData, name: e.target.value })}
                  placeholder="e.g. Tokyo Tower"
                  className="w-full text-lg font-bold border-b-2 border-gray-200 focus:border-indigo-600 focus:outline-none py-1 placeholder-gray-300"
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddActivity()}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</label>
                  <select
                    value={newActData.type}
                    onChange={(e) => setNewActData({ ...newActData, type: e.target.value as Activity['type'] })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none"
                  >
                    <option value="sightseeing">Sightseeing</option>
                    <option value="food">Food</option>
                    <option value="shopping">Shopping</option>
                    <option value="leisure">Leisure</option>
                    <option value="travel">Travel</option>
                  </select>
                </div>

                {/* Time Input Removed - Auto-Scheduled by Smart Engine */}
                {/* 
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time</label>
                  ...
                </div> 
                */}
                <div className="flex items-center gap-2 mt-6 p-3 bg-indigo-50 rounded-lg text-xs text-indigo-700">
                  <Clock className="w-4 h-4" />
                  <span>Time will be auto-scheduled based on your route. You can lock it later.</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddActivity}
                disabled={!newActData.name}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Activity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-red-500 to-pink-600 rounded-full text-white shadow-md">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">{trip.title}</h1>
            <p className="text-xs text-gray-500">{trip.days.length} Days • {trip.days[0]?.city} start</p>
          </div>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode(ViewMode.List)}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.List ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <List className="w-4 h-4 mr-2" /> Planner
          </button>
          <button
            onClick={() => setViewMode(ViewMode.Map)}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.Map ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Map className="w-4 h-4 mr-2" /> Map
          </button>
          <button
            onClick={() => setViewMode(ViewMode.Stats)}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.Stats ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <BarChart3 className="w-4 h-4 mr-2" /> Stats
          </button>
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          <button
            onClick={() => handlePrint()}
            className="flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
            title="Export as PDF"
          >
            <Printer className="w-4 h-4 mr-2" /> PDF
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">

        {/* Sidebar / Day Selector */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto hidden md:block shrink-0 flex flex-col z-20">
          <div className="p-4 flex-1">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Itinerary</h2>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedDayId('overview')}
                className={`w-full text-left px-3 py-3 rounded-lg text-sm flex items-center justify-between group transition-colors mb-2 ${selectedDayId === 'overview' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50 text-gray-600'}`}
              >
                <div className="flex items-center">
                  <Globe className="w-4 h-4 mr-2 opacity-70" />
                  <span className="block">Full Trip Route</span>
                </div>
                {selectedDayId === 'overview' && <ChevronRight className="w-4 h-4" />}
              </button>

              <div className="h-px bg-gray-100 my-2"></div>

              {trip.days.map((day, idx) => (
                <button
                  key={day.id}
                  onClick={() => setSelectedDayId(day.id)}
                  className={`w-full text-left px-3 py-3 rounded-lg text-sm flex items-center justify-between group transition-colors ${selectedDayId === day.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  <div className="truncate pr-2">
                    <span className="block font-medium">{getDayLabel(day.date)}</span>
                    <span className="text-xs opacity-70 truncate">{day.city}</span>
                  </div>
                  {selectedDayId === day.id && <ChevronRight className="w-4 h-4 shrink-0" />}
                </button>
              ))}
            </div>

            <button
              onClick={handleAddDay}
              className="mt-4 w-full flex items-center justify-center py-2 px-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Day
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row h-full relative">

          {/* Mobile Day Selector (Dropdown) */}
          <div className="md:hidden p-4 border-b bg-white">
            <select
              value={selectedDayId}
              onChange={(e) => setSelectedDayId(e.target.value)}
              className="w-full p-2 border rounded-lg bg-gray-50 mb-2"
            >
              <option value="overview">🌍 Full Trip Route</option>
              {trip.days.map(day => (
                <option key={day.id} value={day.id}>{getDayLabel(day.date)} - {day.city}</option>
              ))}
            </select>
            <button
              onClick={handleAddDay}
              className="w-full py-2 bg-gray-100 rounded text-sm text-gray-700"
            >
              + Add Day
            </button>
          </div>

          {/* VIEW: LIST MODE */}
          {viewMode === ViewMode.List && (
            isOverview ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 text-center">
                <div className="max-w-md">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Globe className="w-10 h-10 text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Trip Overview</h2>
                  <p className="text-gray-500 mt-2 leading-relaxed">
                    You have <strong>{trip.days.length} days</strong> planned across Japan.
                    Select a day to edit details or use the map view to see your full journey.
                  </p>
                  <button
                    onClick={() => setViewMode(ViewMode.Map)}
                    className="mt-8 px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition-all transform hover:-translate-y-1"
                  >
                    View Full Map
                  </button>
                </div>
              </div>
            ) : (activeDay && (
              <>
                {/* Activities Column */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white/50">
                  <div className="max-w-2xl mx-auto">

                    {/* Day Controls */}
                    <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={activeDay.city}
                            onChange={(e) => handleUpdateCity(activeDay.id, e.target.value)}
                            className="text-3xl font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-500 focus:outline-none w-full max-w-[300px]"
                            placeholder="City Name"
                          />
                          <Edit3 className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-gray-500">{getDayLabel(activeDay.date)} • {activeDay.activities.length} Stops</p>
                          <WeatherWidget
                            date={activeDay.date}
                            cityName={activeDay.city}
                            lat={activeDay.accommodation?.location?.lat || activeDay.activities[0]?.location?.lat}
                            lng={activeDay.accommodation?.location?.lng || activeDay.activities[0]?.location?.lng}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteDay(activeDay.id)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete this day"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    {/* AI Planner Input */}
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6 relative overflow-hidden">
                      <div className="relative z-10">
                        <h3 className="text-sm font-bold text-indigo-800 mb-2 flex items-center">
                          <Sparkles className="w-4 h-4 mr-2" /> AI Auto-Planner
                        </h3>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder={`What do you want to do in ${activeDay.city}? (e.g. "Anime shops & spicy ramen")`}
                            className="flex-1 px-3 py-2 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm bg-white"
                            onKeyDown={(e) => e.key === 'Enter' && handleAiPlan()}
                          />
                          <button
                            onClick={handleAiPlan}
                            disabled={isAiPlanning || !aiPrompt}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm whitespace-nowrap"
                          >
                            {isAiPlanning ? 'Thinking...' : 'Generate Plan'}
                          </button>
                          <button
                            onClick={() => setIsEventModalOpen(true)}
                            className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-all shadow-sm whitespace-nowrap flex items-center gap-2"
                          >
                            <Calendar className="w-4 h-4" /> Find Events
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Hotel & Notes Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {/* Hotel */}
                      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            <BedDouble className="w-3.5 h-3.5 mr-1.5" /> Accommodation
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-indigo-500" />
                            <input
                              type="time"
                              value={activeDay.startTime || '09:00'}
                              onChange={(e) => handleUpdateDayStartTime(activeDay.id, e.target.value)}
                              className="text-xs font-bold text-indigo-600 bg-indigo-50 border-0 rounded px-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              title="Time you leave the hotel"
                            />
                          </div>
                        </div>
                        <input
                          type="text"
                          placeholder="Where are you staying?"
                          value={activeDay.accommodation?.name || ''}
                          onChange={(e) => handleUpdateHotel(activeDay.id, e.target.value)}
                          className="w-full text-gray-700 placeholder-gray-300 focus:outline-none font-medium bg-transparent text-sm"
                        />
                      </div>

                      {/* Notes */}
                      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">
                        <div className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          <StickyNote className="w-3.5 h-3.5 mr-1.5" /> Day Notes
                        </div>
                        <textarea
                          placeholder="Reminders, tickets..."
                          value={activeDay.notes || ''}
                          onChange={(e) => handleUpdateNotes(activeDay.id, e.target.value)}
                          className="w-full text-gray-600 placeholder-gray-300 focus:outline-none text-sm bg-transparent resize-none h-full"
                          rows={1}
                        />
                      </div>
                    </div>

                    {/* Daily Expense Summary */}
                    {(() => {
                      const expenses = calculateDayExpenses(activeDay);
                      return (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 mb-6">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Wallet className="w-5 h-5 text-green-600" />
                              <span className="font-semibold text-green-800">Today's Budget</span>
                            </div>
                            <span className="text-xl font-bold text-green-900">
                              ¥{expenses.total.toLocaleString()}
                            </span>
                          </div>
                          {expenses.total > 0 && (
                            <div className="flex gap-4 mt-2 text-xs text-green-600">
                              {expenses.attractions > 0 && (
                                <span>🏟 Attractions: ¥{expenses.attractions.toLocaleString()}</span>
                              )}
                              {expenses.transit > 0 && (
                                <span>🚃 Transit: ¥{expenses.transit.toLocaleString()}</span>
                              )}
                              {expenses.byType['food'] > 0 && (
                                <span>🍜 Food: ¥{expenses.byType['food'].toLocaleString()}</span>
                              )}
                            </div>
                          )}
                          {expenses.total === 0 && (
                            <p className="text-xs text-green-500 mt-1">Click the ¥? badges on activities to add prices</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Filter Toolbar */}
                    <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                      <Filter className="w-4 h-4 text-gray-400 shrink-0" />
                      {FILTERS.map(f => (
                        <button
                          key={f}
                          onClick={() => setFilterType(f)}
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${filterType === f
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                          {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap gap-2 mb-6 sticky top-0 bg-white/95 backdrop-blur z-10 py-2 border-b">
                      <button
                        onClick={handleOpenGoogleMaps}
                        className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full flex items-center shadow-sm hover:bg-gray-50 text-xs font-medium"
                      >
                        <MapIcon className="w-3.5 h-3.5 mr-1.5 text-green-600" /> Google Maps
                      </button>

                      <button
                        onClick={() => handleOptimizeRoute(activeDay.id)}
                        disabled={isOptimizing}
                        className="bg-white border border-purple-200 text-purple-700 px-3 py-1.5 rounded-full flex items-center shadow-sm hover:bg-purple-50 text-xs font-medium transition-colors"
                        title="Reorder activities for fastest route using Google Maps"
                      >
                        {isOptimizing ? <span className="animate-spin mr-1.5">⚡</span> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                        Optimize
                      </button>

                      <button
                        onClick={() => handleSortByTime(activeDay.id)}
                        className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full flex items-center shadow-sm hover:bg-gray-50 text-xs font-medium"
                      >
                        <ArrowDownAZ className="w-3.5 h-3.5 mr-1.5" /> Sort Time
                      </button>

                      <button
                        onClick={openAddActivityModal}
                        disabled={isAddingAct}
                        className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-full flex items-center shadow-lg transition-transform hover:scale-105 active:scale-95 text-xs font-bold"
                      >
                        <Plus className="w-4 h-4 mr-1.5" /> {isAddingAct ? 'Adding...' : 'Add Stop'}
                      </button>
                    </div>

                    <div className="space-y-4 pb-8 min-h-[200px]">
                      {displayedActivities.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                          <p className="text-gray-400 mb-2">No activities found.</p>
                          <p className="text-xs text-gray-400">Change filter or add a stop.</p>
                        </div>
                      )}

                      {/* START SUGGESTIONS */}
                      {suggestions.filter(s => s.suggestedAfterId === 'start').map(suggestion => (
                        <div key={suggestion.id} className="relative bg-gradient-to-r from-indigo-50 to-white border border-indigo-200 border-dashed rounded-xl p-3 shadow-sm mb-4">
                          <div className="absolute top-2 right-2 flex gap-1">
                            <button onClick={() => setSuggestions(prev => prev.filter(x => x.id !== suggestion.id))} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X className="w-3 h-3" /></button>
                          </div>
                          <div className="flex gap-3">
                            <div className="w-14 h-14 bg-indigo-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-indigo-300">
                              {suggestion.imageUrl && !failedSuggestionImages.has(suggestion.id) ? (
                                <img
                                  src={suggestion.imageUrl}
                                  alt={suggestion.name}
                                  className="w-full h-full object-cover"
                                  onError={() => setFailedSuggestionImages(prev => new Set(prev).add(suggestion.id))}
                                />
                              ) : (
                                <ImageIcon className="w-6 h-6" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center mb-1">
                                <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-2">AI TIP</span>
                                <h4 className="font-bold text-gray-800 text-sm">{suggestion.name}</h4>
                              </div>
                              <p className="text-xs text-gray-600 mb-2">{suggestion.description}</p>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-indigo-500 font-medium">{suggestion.durationReasoning}</span>
                                <button onClick={() => acceptSuggestion(suggestion)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 py-1 rounded flex items-center font-bold shadow-sm"><Plus className="w-3 h-3 mr-1" /> Add here</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {displayedActivities.map((activity, index) => {
                        // Find true index in original array for drag handling
                        const originalIndex = activeDay.activities.findIndex(a => a.id === activity.id);
                        const relevantSuggestions = suggestions.filter(s => s.suggestedAfterId === activity.id);

                        return (
                          <React.Fragment key={activity.id}>
                            {/* Travel Segment Indicator */
                              (() => {
                                const segment = activeDay.travelSegments?.find(s => s.toId === activity.id);
                                if (!segment) return null;

                                const getMapsLink = (seg: TravelSegment) => {
                                  // Helper to resolve location for link
                                  // Note: In a real app we might want lat/lng, but names work well for "Directions"
                                  // and allow the user to see the place on the map better.
                                  // Using IDs or simple names:

                                  let originStr = "";
                                  let destStr = "";

                                  if (seg.fromId === 'start') {
                                    originStr = `${activeDay.accommodation?.location.lat},${activeDay.accommodation?.location.lng}`;
                                  } else {
                                    const fromAct = activeDay.activities.find(a => a.id === seg.fromId);
                                    if (fromAct) originStr = `${fromAct.location.lat},${fromAct.location.lng}`;
                                  }

                                  const toAct = activeDay.activities.find(a => a.id === seg.toId);
                                  if (toAct) destStr = `${toAct.location.lat},${toAct.location.lng}`;

                                  // Fallback if missing
                                  if (!originStr || !destStr) return "#";

                                  const modeParam = seg.mode === 'WALKING' ? 'walking' : 'transit';
                                  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=${modeParam}`;
                                };

                                return (
                                  <div className="flex items-center justify-center py-3">
                                    <a
                                      href={getMapsLink(segment)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="group block transition-transform hover:scale-105"
                                      title="Open in Google Maps"
                                    >
                                      <div className="flex flex-col items-center gap-1 cursor-pointer">
                                        <div className={`flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-500 shadow-sm border border-gray-200 group-hover:border-${segment.mode === 'WALKING' ? 'emerald' : 'indigo'}-300 group-hover:shadow-md transition-all`}>
                                          {segment.mode === 'WALKING' ? (
                                            <div className="flex items-center gap-1 text-emerald-600">
                                              <Footprints className="w-3 h-3" />
                                              <span>Walk</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                              {segment.mode === 'BUS' ? <Bus className="w-3 h-3" /> : <Train className="w-3 h-3" />}
                                              <span className="font-bold text-[10px] uppercase">
                                                {segment.mode === 'BUS' ? 'Bus' : (segment.mode === 'TRAIN' ? 'Train' : 'Transit')}
                                              </span>
                                            </div>
                                          )}
                                          <span>
                                            {segment.duration}
                                            {segment.distance && ` • ${segment.distance}`}
                                            {segment.transitFare && <span className="font-bold text-gray-700 ml-1"> • ¥{segment.transitFare}</span>}
                                          </span>
                                          {/* External Link Icon Hint */}
                                          <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>

                                        {/* Alternative Route Badge (Comparison) - Non clickable part or included? Let's keep distinct or just show it */}
                                        {segment.alternativeLabel && (
                                          <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1 bg-white border border-gray-100 px-2 py-0.5 rounded-full shadow-sm">
                                            <span className="text-gray-300">vs</span>
                                            <span>{segment.alternativeLabel}</span>
                                          </div>
                                        )}
                                      </div>
                                    </a>
                                  </div>
                                );
                              })()}

                            <ActivityCard
                              isFirst={index === 0}
                              isLast={index === activeDay.activities.length - 1}
                              activity={activity}
                              city={activeDay.city}
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, index)}
                              onDragOver={(e) => handleDragOver(e)}
                              onDrop={(e) => handleDrop(e, index)}
                              onUpdate={(updated) => handleUpdateActivity(activeDay.id, updated)}
                              onDelete={() => handleDeleteActivity(activeDay.id, activity.id)}
                              onMoveUp={() => handleMoveActivity(activeDay.id, index, 'up')}
                              onMoveDown={() => handleMoveActivity(activeDay.id, index, 'down')}
                              onSplit={handleSplitActivity}
                              onFocus={() => setFocusedActivityId(prev => prev === activity.id ? null : activity.id)}
                            />

                            {/* INTERLEAVED SUGGESTIONS */}
                            {relevantSuggestions.map(suggestion => (
                              <div key={suggestion.id} className="relative ml-8 mb-4 bg-gradient-to-r from-indigo-50 to-white border border-indigo-200 border-dashed rounded-xl p-3 shadow-sm">
                                {/* Connector Line */}
                                <div className="absolute -left-4 top-1/2 w-4 h-0.5 bg-indigo-200 border-dashed"></div>
                                <div className="absolute top-2 right-2 flex gap-1">
                                  <button onClick={() => setSuggestions(prev => prev.filter(x => x.id !== suggestion.id))} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X className="w-3 h-3" /></button>
                                </div>
                                <div className="flex gap-3">
                                  <div className="w-14 h-14 bg-indigo-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-indigo-300">
                                    {suggestion.imageUrl && !failedSuggestionImages.has(suggestion.id) ? (
                                      <img
                                        src={suggestion.imageUrl}
                                        alt={suggestion.name}
                                        className="w-full h-full object-cover"
                                        onError={() => setFailedSuggestionImages(prev => new Set(prev).add(suggestion.id))}
                                      />
                                    ) : (
                                      <ImageIcon className="w-6 h-6" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center mb-1">
                                      <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-2">AI TIP</span>
                                      <h4 className="font-bold text-gray-800 text-sm">{suggestion.name}</h4>
                                    </div>
                                    <p className="text-xs text-gray-600 mb-2">{suggestion.description}</p>
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs text-indigo-500 font-medium">{suggestion.durationReasoning}</span>
                                      <button onClick={() => acceptSuggestion(suggestion)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 py-1 rounded flex items-center font-bold shadow-sm"><Plus className="w-3 h-3 mr-1" /> Add Next</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </React.Fragment>
                        );
                      })
                      }
                    </div>

                    {/* AI RECOMMENDATIONS BUTTON (Bottom access) */}
                    <div className="border-t border-gray-200 pt-6 pb-20">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center">
                          <Sparkles className="w-5 h-5 mr-2 text-indigo-500" />
                          Find More Spots
                        </h3>
                        <button
                          onClick={handleGetSuggestions}
                          disabled={isLoadingSuggestions}
                          className="bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
                        >
                          {isLoadingSuggestions ? 'Analyzing Geography...' : '✨ Find Smart Suggestions'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">AI will analyze your route and suggest stops that fit perfectly between your planned activities.</p>
                    </div>

                  </div>
                </div>

                {/* Map Preview Sidebar */}
                <div className="w-[400px] hidden xl:block border-l border-gray-200 bg-gray-50 relative">
                  <div className="absolute inset-0">
                    <MapView days={trip.days} selectedDayId={selectedDayId} focusedActivityId={focusedActivityId} />
                  </div>
                  {/* Overlay Legend */}
                  <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-gray-200 text-xs text-gray-600">
                    <p>Showing route for <strong>{activeDay.city}</strong>.</p>
                    <p className="text-[10px] mt-1 text-gray-400">Click a card photo to focus map.</p>
                  </div>
                </div>
              </>
            ))
          )}

          {/* VIEW: MAP MODE */}
          {viewMode === ViewMode.Map && (
            <div className="w-full h-full relative bg-gray-100">
              <MapView days={trip.days} selectedDayId={selectedDayId} />
              {isOverview && <div className="absolute top-4 left-4 z-10 bg-white p-2 rounded shadow text-sm font-bold">Japan Trip Overview</div>}
            </div>
          )}

          {/* VIEW: STATS MODE */}
          {viewMode === ViewMode.Stats && (
            <div className="w-full h-full p-4 bg-gray-50">
              <div className="max-w-4xl mx-auto h-full">
                <StatsView days={trip.days} />
              </div>
            </div>
          )}

        </div>
      </main>
      <EventSuggestions
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        city={activeDay?.city || 'Tokyo'}
        date={activeDay?.date || new Date().toISOString()}
        onAddEvent={handleAddLocalEvent}
      />

      {/* Hidden Print Layout */}
      <div style={{ display: 'none' }}>
        <PrintLayout ref={printRef} trip={trip} />
      </div>
    </div>
  );
}