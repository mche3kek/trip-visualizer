import React, { useEffect, useState } from 'react';
import { CloudRain, Sun, Thermometer, AlertCircle, Loader2 } from 'lucide-react';
import { fetchWeatherForecast, WeatherData, getWeatherIcon, getWeatherDescription } from '../services/weatherService';
import { geocodeLocation } from '../services/mapService';

interface WeatherWidgetProps {
    date: string;
    cityName: string;
    lat?: number;
    lng?: number;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ date, cityName, lat, lng }) => {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadWeather = async () => {
            // Don't fetch for past dates or far future (OpenMeteo is good for ~14 days, we can push to 16)
            const tripDate = new Date(date);
            const today = new Date();
            const diffTime = tripDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < -1 || diffDays > 16) {
                setWeather(null);
                return;
            }

            setLoading(true);
            setError(false);

            try {
                let latitude = lat;
                let longitude = lng;

                // If no coords, try to geocode the city
                if (!latitude || !longitude) {
                    try {
                        const coords = await geocodeLocation(cityName);
                        if (coords) {
                            latitude = coords.lat;
                            longitude = coords.lng;
                        }
                    } catch (e) {
                        console.warn('Geocoding failed for weather widget');
                    }
                }

                if (latitude && longitude) {
                    const forecast = await fetchWeatherForecast(latitude, longitude, date, 1);
                    if (isMounted && forecast[date]) {
                        setWeather(forecast[date]);
                    } else {
                        // Fallback: If exact date not found in simple call, it might be timezone offset issue or range
                        // For now, handle as no data
                    }
                }
            } catch (err) {
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadWeather();

        return () => { isMounted = false; };
    }, [date, cityName, lat, lng]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 text-sky-600 rounded-lg text-xs font-medium animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Checking forecast...</span>
            </div>
        );
    }

    if (error) {
        return null; // Hide on error
    }

    if (!weather) {
        // Show nothing for dates with no forecast availability
        return null;
    }

    // Determine style based on weather code/precip
    const isRainy = weather.precipitationProb > 40 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weather.weatherCode);
    const bgClass = isRainy ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100';

    return (
        <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${bgClass} transition-all`}>
            <div className="flex items-center gap-1.5" title={getWeatherDescription(weather.weatherCode)}>
                <span className="text-lg leading-none">{getWeatherIcon(weather.weatherCode)}</span>
                <span className="text-xs font-bold">{Math.round(weather.maxTemp)}°</span>
                <span className="text-[10px] opacity-70">/ {Math.round(weather.minTemp)}°</span>
            </div>

            {weather.precipitationProb > 0 && (
                <div className="flex items-center gap-1 text-xs border-l border-current/20 pl-2">
                    <CloudRain className="w-3 h-3" />
                    <span className="font-medium">{weather.precipitationProb}%</span>
                </div>
            )}
        </div>
    );
};
