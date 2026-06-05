const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

/**
 * Convert a lat/lon bounding box to a center point + radius (nautical miles)
 * ADSB.lol uses lat/lon/radius instead of a bounding box.
 * 1 degree latitude ≈ 60 nautical miles
 */
function boundsToCenter(lamin, lamax, lomin, lomax) {
  const centerLat = (lamin + lamax) / 2;
  const centerLon = (lomin + lomax) / 2;
  const latSpan   = (lamax - lamin) / 2 * 60;
  const lonSpan   = (lomax - lomin) / 2 * 60 * Math.cos(centerLat * Math.PI / 180);
  const radius    = Math.max(Math.ceil(Math.sqrt(latSpan ** 2 + lonSpan ** 2)), 25);
  return { centerLat, centerLon, radius };
}

/**
 * GET /api/debug
 */
app.get('/api/debug', (req, res) => {
  res.json({
    api: 'ADSB.lol (free, no auth required)',
    nodeVersion: process.version,
    port: PORT
  });
});

/**
 * GET /api/planes
 * Fetches live aircraft from ADSB.lol — no API key needed, cloud-friendly.
 */
app.get('/api/planes', async (req, res) => {
  try {
    const lamin = req.query.lamin ? parseFloat(req.query.lamin) : 51.2;
    const lamax = req.query.lamax ? parseFloat(req.query.lamax) : 51.8;
    const lomin = req.query.lomin ? parseFloat(req.query.lomin) : -0.5;
    const lomax = req.query.lomax ? parseFloat(req.query.lomax) : 0.4;

    const { centerLat, centerLon, radius } = boundsToCenter(lamin, lamax, lomin, lomax);
    const url = `https://api.adsb.lol/v2/lat/${centerLat}/lon/${centerLon}/dist/${radius}`;

    console.log(`[ADSB.lol] GET ${url}`);

    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'LookUp-FlightNotifier/1.0' }
    });

    const aircraft = response.data.ac || [];

    if (!Array.isArray(aircraft)) {
      return res.json([]);
    }

    // Filter to aircraft with valid position data and map to our schema
    const planes = aircraft
      .filter(ac => ac.lat != null && ac.lon != null)
      .map(ac => ({
        callsign:  (ac.flight || ac.r || ac.hex || 'UNKNOWN').trim(),
        longitude: Number(ac.lon),
        latitude:  Number(ac.lat),
        // alt_baro is in feet — convert to metres for consistency with original OpenSky schema
        altitude:  ac.alt_baro != null ? Math.round(Number(ac.alt_baro) * 0.3048)
                 : ac.alt_geom != null ? Math.round(Number(ac.alt_geom) * 0.3048)
                 : null
      }));

    console.log(`[ADSB.lol] Returning ${planes.length} aircraft`);
    res.json(planes);

  } catch (error) {
    const status = error.response ? error.response.status : 500;
    const detail = error.response
      ? `ADSB.lol HTTP ${status}: ${JSON.stringify(error.response.data)}`
      : error.message;

    console.error('[ADSB Error]', detail);
    res.status(status).json({ error: 'ADSB fetch failed', detail });
  }
});

app.listen(PORT, () => {
  console.log(`LookUp server running on port ${PORT}`);
});
