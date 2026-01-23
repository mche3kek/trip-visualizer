import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, X, Loader2, Plus, Music, Ticket, Info, ExternalLink } from 'lucide-react';
import { LocalEvent } from '../types';
import { getLocalEvents } from '../services/geminiService';
import { searchGooglePlace } from '../services/mapService';

interface EventSuggestionsProps {
    isOpen: boolean;
    onClose: () => void;
    city: string;
    date: string;
    onAddEvent: (event: LocalEvent) => void;
}

export const EventSuggestions: React.FC<EventSuggestionsProps> = ({
    isOpen,
    onClose,
    city,
    date,
    onAddEvent
}) => {
    const [events, setEvents] = useState<LocalEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [addingId, setAddingId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && events.length === 0) {
            loadEvents();
        }
    }, [isOpen, city, date]);

    const loadEvents = async () => {
        setLoading(true);
        const results = await getLocalEvents(city, date);
        setEvents(results);
        setLoading(false);
    };

    const handleAdd = async (event: LocalEvent) => {
        setAddingId(event.id);
        // Optional: fetch coordinates if missing before adding?
        // The main App handleAddActivity logic handles coordinate fetching if we pass just name/location text.
        // But passing better data is nice.
        // For now, pass event as is, parent can handle enrichment.
        await onAddEvent(event);
        setAddingId(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-violet-50 to-purple-50">
                    <div>
                        <h2 className="text-xl font-bold text-violet-900 flex items-center gap-2">
                            <Calendar className="w-5 h-5" /> Local Events in {city}
                        </h2>
                        <p className="text-sm text-violet-600 mt-1">Happenings on {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                            <p className="text-gray-500 font-medium">Scanning local guides & event calendars...</p>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-500">No specific events found for this date. It might be a quiet day!</p>
                            <button
                                onClick={loadEvents}
                                className="mt-4 px-4 py-2 text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 font-medium"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {events.map(event => (
                                <div key={event.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${event.category === 'festival' ? 'bg-red-50 text-red-600 border-red-100' :
                                                        event.category === 'music' ? 'bg-pink-50 text-pink-600 border-pink-100' :
                                                            'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                    }`}>
                                                    {event.category}
                                                </span>
                                                <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                    {event.startTime}
                                                </span>
                                                {event.priceLabel && (
                                                    <span className="text-xs text-green-600 font-medium px-1.5 py-0.5 bg-green-50 rounded">
                                                        {event.priceLabel}
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="font-bold text-gray-900 text-lg mb-1 group-hover:text-violet-700 transition-colors">
                                                {event.name}
                                            </h3>

                                            <p className="text-gray-600 text-sm mb-3">
                                                {event.description}
                                            </p>

                                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                                <MapPin className="w-3.5 h-3.5" />
                                                {event.location}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleAdd(event)}
                                            disabled={addingId === event.id}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-violet-600 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap disabled:opacity-70"
                                        >
                                            {addingId === event.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Plus className="w-4 h-4" />
                                            )}
                                            Add to Trip
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
