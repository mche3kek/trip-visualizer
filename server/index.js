
import express from 'express';
import cors from 'cors';
import { LRUCache } from 'lru-cache';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert import.meta.url to __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from PARENT directory
// Try .env first (standard), then .env.local (overrides for local dev if needed, or vice-versa depending on preference. usually local overrides prod)
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

const app = express();
const PORT = process.env.PORT || 3000;

// --- BASIC AUTH MIDDLEWARE ---
import crypto from 'crypto';

const authUser = process.env.BASIC_AUTH_USER;
const authHash = process.env.BASIC_AUTH_HASH; // Format: salt:hash

if (authUser && authHash) {
    console.log("🔒 Basic Auth Enabled (Hashed)");
    app.use((req, res, next) => {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

        if (!login || !password || login !== authUser) {
            res.set('WWW-Authenticate', 'Basic realm="Japan Trip Visualizer"');
            return res.status(401).send('Authentication required.');
        }

        const [salt, key] = authHash.split(':');

        // Verify Password
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) return next(err);

            // Timing Safe Equality Check
            if (crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey)) {
                return next();
            }

            // Failed
            res.set('WWW-Authenticate', 'Basic realm="Japan Trip Visualizer"');
            res.status(401).send('Authentication required.');
        });
    });
} else {
    console.log("⚠️ No Basic Auth configured. Site is public.");
}

app.use(cors());
app.use(express.json());

// --- CACHE CONFIGURATION ---
// 1000 items, 30 days TTL (Terms permissive for caching latitude/longitude; 
// Place IDs and basic info is generally okayish for performace caching but strict read of TOS 
// usually forbids "storing" content. We act as a heavy http-cache proxy here.)
const placeCache = new LRUCache({
    max: 1000,
    ttl: 1000 * 60 * 60 * 24 * 30,
});

const GOOGLE_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

if (!GOOGLE_API_KEY) {
    console.error("CRITICAL: VITE_GOOGLE_MAPS_API_KEY not found in env!");
}

// --- API ENDPOINTS ---

app.get('/api/places/search', async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const cacheKey = `search:${query.toLowerCase().trim()}`;

    if (placeCache.has(cacheKey)) {
        console.log(`[CACHE HIT] ${query}`);
        return res.json(placeCache.get(cacheKey));
    }

    console.log(`[CACHE MISS] ${query}`);

    try {
        // Strategy: Text Search
        const apiUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
        const response = await axios.get(apiUrl, {
            params: {
                query: query,
                key: GOOGLE_API_KEY,
                fields: "name,geometry,photos,place_id,formatted_address,rating,user_ratings_total" // Note: TextSearch doesn't strictly support fields param filtering in same way as Place Details but it's good practice
            }
        });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const place = response.data.results[0];

            // Format for client
            const result = {
                name: place.name,
                placeId: place.place_id,
                location: place.geometry.location,
                formatted_address: place.formatted_address,
                rating: place.rating,
                userRatingsTotal: place.user_ratings_total,
                // Construct Photo Reference (Client needs to build URL or we build it)
                // Ideally we pass the photo_reference and let client build url using API key? 
                // OR we proxy the photo too? 
                // Current app uses: place.photos[0].getUrl() which is client side library method.
                // Since we are moving to server, we should return the raw photo_reference.
                // Client logic mapService.ts will need adjustment.
                photoReference: place.photos?.[0]?.photo_reference
            };

            placeCache.set(cacheKey, result);
            return res.json(result);
        }

        // Retry with "Japan" appended if not found? (Similar to client logic)
        if (!String(query).toLowerCase().includes('japan')) {
            console.log(`[RETRY] Appending 'Japan' to ${query}`);
            const retryResponse = await axios.get(apiUrl, {
                params: { query: `${query} Japan`, key: GOOGLE_API_KEY }
            });
            if (retryResponse.data.status === 'OK' && retryResponse.data.results.length > 0) {
                const place = retryResponse.data.results[0];
                const result = {
                    name: place.name,
                    placeId: place.place_id,
                    location: place.geometry.location,
                    formatted_address: place.formatted_address,
                    photoReference: place.photos?.[0]?.photo_reference
                };
                placeCache.set(cacheKey, result);
                return res.json(result);
            }
        }

        return res.json(null); // Not found

    } catch (error) {
        console.error("Google API Error:", error.message);
        res.status(500).json({ error: 'Failed to fetch place' });
    }
});

// --- PERSISTENCE ---
import fs from 'fs/promises';
const DATA_FILE = path.join(__dirname, 'trip_data.json');

app.get('/api/trip', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.json(null); // No saved trip yet
        }
        console.error("Read Error:", error);
        res.status(500).json({ error: 'Failed to read trip data' });
    }
});

app.post('/api/trip', async (req, res) => {
    try {
        const tripData = req.body;
        if (!tripData) return res.status(400).json({ error: 'No data provided' });

        await fs.writeFile(DATA_FILE, JSON.stringify(tripData, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error("Write Error:", error);
        res.status(500).json({ error: 'Failed to save trip data' });
    }
});

// --- SERVE STATIC FILES (Production) ---
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Handle SPA routing by returning index.html for unknown non-API routes
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
