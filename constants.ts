import { Trip, DayPlan } from './types';

export const INITIAL_TRIP: Trip = {
  title: "Japan Adventure 2025",
  days: [
    {
      id: 'day-1',
      date: '2025-02-03',
      city: 'Tokyo',
      startTime: '10:00',
      activities: [
        {
          id: 'act-1-1',
          name: 'Shibuya Crossing',
          description: 'The famous scramble crossing.',
          startTime: '10:00',
          endTime: '11:00',
          location: { lat: 35.6595, lng: 139.7004 },
          type: 'sightseeing',
          imageUrl: ''
        },
        {
          id: 'act-1-2',
          name: 'Nintendo Tokyo / Pokemon Center',
          description: 'Shopping at Shibuya Parco.',
          startTime: '11:30',
          endTime: '13:30',
          location: { lat: 35.6620, lng: 139.6986 },
          type: 'shopping',
          imageUrl: ''
        },
        {
          id: 'act-1-3',
          name: 'Tokyo Skytree',
          description: 'Views of the city at sunset.',
          startTime: '16:00',
          endTime: '18:00',
          location: { lat: 35.7100, lng: 139.8107 },
          type: 'sightseeing',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-2',
      date: '2025-02-04',
      city: 'Tokyo',
      startTime: '09:00',
      activities: [
        {
          id: 'act-2-1',
          name: 'Imperial Palace',
          description: 'Historical site walk.',
          startTime: '09:00',
          endTime: '11:00',
          location: { lat: 35.6852, lng: 139.7528 },
          type: 'sightseeing',
          imageUrl: ''
        },
        {
          id: 'act-2-2',
          name: 'Harajuku / Takeshita Street',
          description: 'Fashion, crepes, and crowds.',
          startTime: '13:00',
          endTime: '15:00',
          location: { lat: 35.6715, lng: 139.7034 },
          type: 'shopping',
          imageUrl: ''
        },
        {
          id: 'act-2-3',
          name: 'Meiji Shrine',
          description: 'Peaceful forest shrine.',
          startTime: '15:30',
          endTime: '17:00',
          location: { lat: 35.6764, lng: 139.6993 },
          type: 'sightseeing',
          imageUrl: ''
        },
        {
          id: 'act-2-4',
          name: 'Shinjuku Golden Gai',
          description: 'Izakaya hopping.',
          startTime: '19:00',
          endTime: '22:00',
          location: { lat: 35.6938, lng: 139.7047 },
          type: 'food',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-3',
      date: '2025-02-05',
      city: 'Tokyo',
      startTime: '08:00',
      activities: [
        {
          id: 'act-3-1',
          name: 'Fuji-Q Highland',
          description: 'Day trip for rollercoasters near Mt Fuji.',
          startTime: '08:00',
          endTime: '18:00',
          location: { lat: 35.4869, lng: 138.7806 },
          type: 'leisure',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-4',
      date: '2025-02-06',
      city: 'Tokyo',
      startTime: '10:00',
      activities: [
        {
          id: 'act-4-1',
          name: 'Akihabara',
          description: 'Otaku culture, retro games, electronics.',
          startTime: '10:00',
          endTime: '14:00',
          location: { lat: 35.6984, lng: 139.7731 },
          type: 'shopping',
          imageUrl: ''
        },
        {
          id: 'act-4-2',
          name: 'Senso-ji (Asakusa)',
          description: 'Old Tokyo vibes.',
          startTime: '15:00',
          endTime: '17:00',
          location: { lat: 35.7148, lng: 139.7967 },
          type: 'sightseeing',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-5',
      date: '2025-02-08',
      city: 'Nagano',
      startTime: '09:00',
      activities: [
        {
          id: 'act-5-1',
          name: 'Jigokudani Monkey Park',
          description: 'Snow monkeys in hot springs.',
          startTime: '10:00',
          endTime: '14:00',
          location: { lat: 36.7330, lng: 138.4621 },
          type: 'sightseeing',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-6',
      date: '2025-02-09',
      city: 'Nagano',
      startTime: '09:00',
      activities: [
        {
          id: 'act-6-1',
          name: 'Ski Resort (Hakuba/Shiga Kogen)',
          description: 'Skiing in the Japanese Alps.',
          startTime: '09:00',
          endTime: '16:00',
          location: { lat: 36.6982, lng: 137.8619 },
          type: 'leisure',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-7',
      date: '2025-02-10',
      city: 'Kanazawa',
      startTime: '10:00',
      activities: [
        {
          id: 'act-7-1',
          name: 'Kenroku-en Garden',
          description: 'One of the three great gardens of Japan.',
          startTime: '10:00',
          endTime: '12:00',
          location: { lat: 36.5621, lng: 136.6627 },
          type: 'sightseeing',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-8',
      date: '2025-02-12',
      city: 'Osaka',
      startTime: '08:30',
      activities: [
        {
          id: 'act-8-1',
          name: 'Universal Studios Japan',
          description: 'Nintendo World and Harry Potter.',
          startTime: '08:30',
          endTime: '20:00',
          location: { lat: 34.6654, lng: 135.4323 },
          type: 'leisure',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-9',
      date: '2025-02-13',
      city: 'Nara & Osaka',
      startTime: '09:00',
      activities: [
        {
          id: 'act-9-1',
          name: 'Nara Park',
          description: 'Deer and Todai-ji temple.',
          startTime: '09:00',
          endTime: '13:00',
          location: { lat: 34.6851, lng: 135.8430 },
          type: 'sightseeing',
          imageUrl: ''
        },
        {
          id: 'act-9-2',
          name: 'Dotonbori',
          description: 'Food street at night.',
          startTime: '18:00',
          endTime: '21:00',
          location: { lat: 34.6687, lng: 135.5013 },
          type: 'food',
          imageUrl: ''
        }
      ]
    },
    {
      id: 'day-10',
      date: '2025-02-14',
      city: 'Kyoto',
      startTime: '08:00',
      activities: [
        {
          id: 'act-10-1',
          name: 'Fushimi Inari Taisha',
          description: 'Thousands of torii gates.',
          startTime: '08:00',
          endTime: '10:30',
          location: { lat: 34.9671, lng: 135.7727 },
          type: 'sightseeing',
          imageUrl: ''
        },
        {
          id: 'act-10-2',
          name: 'Kiyomizu-dera',
          description: 'Wooden stage temple.',
          startTime: '11:30',
          endTime: '13:30',
          location: { lat: 34.9949, lng: 135.7850 },
          type: 'sightseeing',
          imageUrl: ''
        },
        {
          id: 'act-10-3',
          name: 'Gion District',
          description: 'Geisha district walking.',
          startTime: '16:00',
          endTime: '18:00',
          location: { lat: 35.0037, lng: 135.7778 },
          type: 'sightseeing',
          imageUrl: ''
        }
      ]
    }
  ]
};