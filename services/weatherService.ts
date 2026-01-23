import { Activity } from '../types';

export interface WeatherData {
    date: string;
    maxTemp: number;
    minTemp: number;
    weatherCode: number;
    precipitationProb: number;
}

// WMO Weather interpretation codes (WW)
// https://open-meteo.com/en/docs
export const getWeatherIcon = (code: number, isDay: boolean = true) => {
    switch (code) {
        case 0: return '☀️'; // Clear sky
        case 1: return '🌤️'; // Mainly clear
        case 2: return '⛅'; // Partly cloudy
        case 3: return '☁️'; // Overcast
        case 45: case 48: return '🌫️'; // Fog
        case 51: case 53: case 55: return '🌦️'; // Drizzle
        case 56: case 57: return '🌧️'; // Freezing Drizzle
        case 61: case 63: case 65: return '🌧️'; // Rain
        case 66: case 67: return '🌨️'; // Freezing Rain
        case 71: case 73: case 75: return '🌨️'; // Snow fall
        case 77: return '🌨️'; // Snow grains
        case 80: case 81: case 82: return '🌧️'; // Rain showers
        case 85: case 86: return '🌨️'; // Snow showers
        case 95: return '⛈️'; // Thunderstorm
        case 96: case 99: return '⛈️'; // Thunderstorm with hail
        default: return '❓';
    }
};

export const getWeatherDescription = (code: number) => {
    switch (code) {
        case 0: return 'Clear sky';
        case 1: return 'Mainly clear';
        case 2: return 'Partly cloudy';
        case 3: return 'Overcast';
        case 45: case 48: return 'Fog';
        case 51: case 53: case 55: return 'Drizzle';
        case 61: case 63: case 65: return 'Rain';
        case 71: case 73: case 75: return 'Snow';
        case 80: case 81: case 82: return 'Rain showers';
        case 95: return 'Thunderstorm';
        default: return 'Unknown';
    }
};

export const fetchWeatherForecast = async (lat: number, lng: number, startDate: string, days: number = 14): Promise<Record<string, WeatherData>> => {
    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&start_date=${startDate}&forecast_days=${days}`
        );

        if (!response.ok) {
            throw new Error('Weather fetch failed');
        }

        const data = await response.json();
        const result: Record<string, WeatherData> = {};

        if (data.daily) {
            data.daily.time.forEach((time: string, index: number) => {
                result[time] = {
                    date: time,
                    maxTemp: data.daily.temperature_2m_max[index],
                    minTemp: data.daily.temperature_2m_min[index],
                    weatherCode: data.daily.weather_code[index],
                    precipitationProb: data.daily.precipitation_probability_max[index]
                };
            });
        }

        return result;
    } catch (error) {
        console.warn('Failed to fetch weather:', error);
        return {};
    }
};
