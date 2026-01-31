import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Trip } from '../types';

interface UseRealtimeSyncOptions {
    onTripUpdate: (trip: Trip) => void;
    enabled?: boolean;
}

interface UseRealtimeSyncReturn {
    isConnected: boolean;
    socketId: string | null;
    sendUpdate: (trip: Trip) => void;
    requestSync: () => void;
}

/**
 * Custom hook for real-time trip synchronization via WebSockets
 * Handles automatic connection, reconnection, and update broadcasting
 */
export function useRealtimeSync(options: UseRealtimeSyncOptions): UseRealtimeSyncReturn {
    const { onTripUpdate, enabled = true } = options;

    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [socketId, setSocketId] = useState<string | null>(null);
    const ignoreNextUpdateRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        // Connect to WebSocket server
        const socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('🔌 WebSocket connected:', socket.id);
            setIsConnected(true);
            setSocketId(socket.id || null);
        });

        socket.on('disconnect', () => {
            console.log('🔌 WebSocket disconnected');
            setIsConnected(false);
            setSocketId(null);
        });

        // Listen for trip updates from other clients
        socket.on('trip-updated', ({ data, sourceSocketId }: { data: Trip; sourceSocketId?: string }) => {
            // Ignore updates that came from this client
            if (sourceSocketId === socket.id) {
                return;
            }

            if (ignoreNextUpdateRef.current) {
                ignoreNextUpdateRef.current = false;
                return;
            }

            console.log('📥 Received trip update from server');
            onTripUpdate(data);
        });

        socket.on('connect_error', (error) => {
            console.error('🔌 WebSocket connection error:', error);
        });

        // Cleanup on unmount
        return () => {
            socket.disconnect();
        };
    }, [enabled]); // Removed onTripUpdate from deps to avoid re-renders if the callback isn't memoized

    // Send trip update to server (placeholder logic)
    const sendUpdate = useCallback((trip: Trip) => {
        // This is handled by the REST API with x-socket-id header
    }, []);

    // Request full sync from server
    const requestSync = useCallback(() => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('request-sync');
    }, []);

    return {
        isConnected,
        socketId,
        sendUpdate,
        requestSync
    };
}

// Helper hook to get socket ID for REST API calls
export function useSocketId(): string | null {
    const [socketId, setSocketId] = useState<string | null>(null);

    useEffect(() => {
        const socket = io(window.location.origin, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            setSocketId(socket.id || null);
        });

        socket.on('disconnect', () => {
            setSocketId(null);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    return socketId;
}
