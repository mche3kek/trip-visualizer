import { GoogleGenAI, Type } from "@google/genai";
import { AiRecommendation, OptimizationResult, Activity, PlaceAnalysis, ActivityPricing } from "../types";

const apiKey = import.meta.env.VITE_API_KEY;
const ai = new GoogleGenAI({ apiKey });

export const getTravelRecommendation = async (
  activityName: string,
  city: string
): Promise<AiRecommendation | null> => {
  if (!apiKey) return null;

  try {
    const prompt = `I am planning a trip to ${city}, Japan. I want to visit "${activityName}". 
    Provide:
    1. A recommended duration (e.g., '2 hours').
    2. A short description (max 15 words).
    3. Estimated latitude and longitude.
    4. A short reasoning for the duration (e.g. "Big park, takes time to walk" or "Small shop, quick visit").`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            duration: { type: Type.STRING },
            description: { type: Type.STRING },
            coordinates: {
              type: Type.OBJECT,
              properties: {
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER }
              },
              required: ['lat', 'lng']
            },
            reasoning: { type: Type.STRING }
          },
          required: ['duration', 'description', 'coordinates', 'reasoning']
        }
      }
    });

    return JSON.parse(response.text || '{}') as AiRecommendation;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};

export const generateSubActivities = async (
  activityName: string,
  city: string
): Promise<string[]> => {
  if (!apiKey) return [];

  try {
    const prompt = `What are the top 3-5 specific sub-spots, things to do, or highlights INSIDE or AT "${activityName}" in ${city}? 
    Return a simple list of short strings (max 6 words each).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    return data.items || [];
  } catch (error) {
    console.error("Sub-activity Error:", error);
    return [];
  }
};

export const findActivityImage = async (query: string): Promise<string | null> => {
  if (!apiKey) return null;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Find a direct image URL (jpg or png) for: "${query}". Return a single JSON object with the url.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            imageUrl: { type: Type.STRING, description: "A direct URL to an image of the place" }
          }
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    return data.imageUrl || null;
  } catch (error) {
    console.error("Image Search Error:", error);
    return null;
  }
};

export const optimizeRoute = async (
  startLocation: string,
  activities: Activity[]
): Promise<OptimizationResult | null> => {
  if (!apiKey || activities.length < 2) return null;

  try {
    const places = activities.map(a => ({ id: a.id, name: a.name, lat: a.location.lat, lng: a.location.lng }));

    const prompt = `
      I have a day trip starting at "${startLocation || 'the first location'}".
      Here are the places I want to visit: ${JSON.stringify(places)}.
      
      Please reorder these activities to minimize travel time (Traveling Salesperson Problem).
      Return the ordered list of activity IDs and a short reasoning string.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 2048 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            orderedIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            reasoning: { type: Type.STRING }
          },
          required: ['orderedIds', 'reasoning']
        }
      }
    });

    return JSON.parse(response.text || '{}') as OptimizationResult;
  } catch (error) {
    console.error("Optimization Error:", error);
    return null;
  }
};

export const generateItinerary = async (
  city: string,
  preferences: string,
  currentActivities: Activity[]
): Promise<Activity[] | null> => {
  if (!apiKey) return null;

  try {
    const existingNames = currentActivities.map(a => a.name).join(", ");
    const prompt = `
      Create a detailed daily itinerary for a trip to ${city}, Japan.
      User Preferences: "${preferences}".
      Existing activities (do not duplicate unless logical): ${existingNames}.
      
      Generate a list of activities (3-6 items) that form a logical route.
      For each activity, provide:
      - Name
      - Specific Start/End Time (HH:mm format)
      - Short description (what to do there)
      - Coordinates (lat/lng)
      - Type (sightseeing, food, shopping, leisure)
      - Reasoning for the duration chosen (e.g. "Large complex, requires 2h")
      
      The itinerary should be realistic with travel time in mind.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              location: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ['lat', 'lng']
              },
              type: { type: Type.STRING, enum: ['sightseeing', 'food', 'shopping', 'leisure', 'travel'] },
              durationReasoning: { type: Type.STRING }
            },
            required: ['name', 'description', 'startTime', 'endTime', 'location', 'type', 'durationReasoning']
          }
        }
      }
    });

    const rawActivities = JSON.parse(response.text || '[]');

    // Convert to internal Activity type
    return rawActivities.map((act: any, index: number) => ({
      id: `ai-gen-${Date.now()}-${index}`,
      name: act.name,
      description: act.description,
      startTime: act.startTime,
      endTime: act.endTime,
      location: act.location,
      type: act.type,
      durationReasoning: act.durationReasoning
    }));

  } catch (error) {
    console.error("AI Planning Error:", error);
    return null;
  }
};

export const getItinerarySuggestions = async (
  city: string,
  currentActivities: Activity[],
  allTripActivities: string[] = [] // New: Support global deduplication
): Promise<Activity[] | null> => {
  if (!apiKey) return null;

  try {
    const currentActivityContext = currentActivities.map((a, i) =>
      `${i}. [ID: ${a.id}] ${a.name} (${a.location.lat.toFixed(3)}, ${a.location.lng.toFixed(3)})`
    ).join('\n');

    const excluded = [...new Set([...allTripActivities, ...currentActivities.map(a => a.name)])].join(', ');

    const prompt = `
      I am in ${city}, Japan.
      
      Current itinerary sequence:
      ${currentActivityContext}
      
      ALREADY VISITING (DO NOT SUGGEST THESE): ${excluded}.

      Suggest 8 NEW, distinct activities that fit well GEOGRAPHICALLY into this specific route.
      For each suggestion, specify 'suggestedAfterId' - the ID of the activity it should logically follow to minimize travel. Use 'start' if it fits best at the beginning.
      
      Also provide a duration reasoning.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              location: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ['lat', 'lng']
              },
              type: { type: Type.STRING, enum: ['sightseeing', 'food', 'shopping', 'leisure', 'travel'] },
              durationReasoning: { type: Type.STRING },
              suggestedAfterId: { type: Type.STRING, description: "ID of the activity this suggestion should follow, or 'start'" }
            },
            required: ['name', 'description', 'startTime', 'endTime', 'location', 'type', 'durationReasoning', 'suggestedAfterId']
          }
        }
      }
    });

    const rawActivities = JSON.parse(response.text || '[]');
    return rawActivities.map((act: any, index: number) => ({
      id: `suggest-${Date.now()}-${index}`,
      name: act.name,
      description: act.description,
      startTime: act.startTime || '12:00',
      endTime: act.endTime || '14:00',
      location: act.location,
      type: act.type,
      durationReasoning: act.durationReasoning,
      suggestedAfterId: act.suggestedAfterId
    }));
  } catch (error) {
    console.error("Suggestion Error:", error);
    return null;
  }
};

export const analyzePlaceName = async (name: string, city: string): Promise<PlaceAnalysis | null> => {
  if (!apiKey) return null;

  try {
    const prompt = `Analyze the place name "${name}" in ${city}.
    Does this refer to a single specific location, or does it combine multiple distinct locations that should be separate entries (e.g. "Nintendo Tokyo & Pokemon Center")?
    
    If it's multiple, provide the list of split names.
    If it's a single place but the name is generic/messy, provide the corrected official Google Maps name.
    
    Return JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['keep', 'rename', 'split'] },
            data: {
              // For 'split', this is array of strings. For 'rename', this is a string. For 'keep', ignore.
              // Since schema must be strict, we can handle data as a wrapper object or just handle it in code as flexible string
              // Let's use string for simplicity and parse if it looks like array or ask AI for simpler structure.
              // Actually, let's use a trick: return both fields and use one.
            },
            splitNames: { type: Type.ARRAY, items: { type: Type.STRING } },
            newName: { type: Type.STRING },
            reason: { type: Type.STRING }
          }
        }
      }
    });

    const res = JSON.parse(response.text || '{}');
    // Normalize output to PlaceAnalysis interface
    if (res.action === 'split') {
      return { action: 'split', data: res.splitNames || [], reason: res.reason };
    } else if (res.action === 'rename') {
      return { action: 'rename', data: res.newName || name, reason: res.reason };
    } else { // Default to 'keep' if action is not 'split' or 'rename'
      return { action: 'keep', data: name, reason: res.reason || 'No specific action needed' };
    }
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const getRecommendedDuration = async (
  activityName: string,
  city: string
): Promise<{ durationMinutes: number; reasoning: string } | null> => {
  if (!apiKey) return null;

  try {
    const prompt = `
      Estimate the typical duration a tourist spends at "${activityName}" in ${city}.
      Examples:
      - Quick photo spot (e.g. Hachiko Statue, Glico Man): 15-20 minutes.
      - Temple/Shrine (e.g. Senso-ji): 45-60 minutes.
      - Museum/Park (e.g. Ghibli Museum, Ueno Park): 90-120 minutes.
      - Theme Park: 240+ minutes.

      Return a JSON object with:
      1. 'durationMinutes' (integer): The realistic time in minutes.
      2. 'reasoning' (string): A short explanation (max 10 words).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            durationMinutes: { type: Type.INTEGER },
            reasoning: { type: Type.STRING }
          },
          required: ['durationMinutes', 'reasoning']
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Duration Error:", error);
    return null;
  }
};

export const getActivityPricing = async (
  activityName: string,
  city: string
): Promise<ActivityPricing | null> => {
  if (!apiKey) return null;

  try {
    const prompt = `
      Find the current admission/entry pricing for "${activityName}" in ${city}, Japan.
      
      Return a JSON object with:
      1. 'isFree' (boolean): true if entry is free, false otherwise
      2. 'basePrice' (number): Standard adult admission in Yen (JPY). Use 0 if free.
      3. 'priceEntries' (array): Different price tiers, each with 'label' (e.g. "Adult", "Child 6-12", "Senior 65+", "Student") and 'amount' (number in Yen)
      4. 'priceLink' (string): Official website URL for pricing info
      5. 'priceNotes' (string): Any important notes like discounts, combo tickets, or free days (max 30 words)
      
      Be accurate - use real 2024/2025 pricing. If unsure, provide typical estimates for similar attractions in Japan.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isFree: { type: Type.BOOLEAN },
            basePrice: { type: Type.NUMBER },
            priceEntries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  amount: { type: Type.NUMBER }
                },
                required: ['label', 'amount']
              }
            },
            priceLink: { type: Type.STRING },
            priceNotes: { type: Type.STRING }
          },
          required: ['isFree', 'basePrice']
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    return {
      ...data,
      lastUpdated: new Date().toISOString()
    } as ActivityPricing;
  } catch (error) {
    console.error("Pricing Fetch Error:", error);
    return null;
  }
};

export const getLocalEvents = async (
  city: string,
  date: string
): Promise<import("../types").LocalEvent[]> => {
  if (!apiKey) return [];

  try {
    const prompt = `
      Find 4-6 specific local events, festivals (matsuri), concerts, exhibitions, or special happenings in ${city}, Japan on ${date}.
      
      Focus on things a tourist would enjoy. 
      Include accurate location verify with Google Search.
      
      Return a JSON array of events.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              startTime: { type: Type.STRING, description: "HH:mm or 'All Day'" },
              location: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['festival', 'music', 'sports', 'arts', 'other'] },
              priceLabel: { type: Type.STRING, description: "e.g. 'Free', '¥2000'" }
            },
            required: ['name', 'description', 'startTime', 'location', 'category']
          }
        }
      }
    });

    const data = JSON.parse(response.text || '[]');
    return data.map((event: any, index: number) => ({
      id: `event-${Date.now()}-${index}`,
      ...event,
      date,
      // We don't get coords from this simple call, so leave undefined or fetch later if added
    }));
  } catch (error) {
    console.error("Event Fetch Error:", error);
    return [];
  }
};