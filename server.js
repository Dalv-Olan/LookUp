const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

const OPENSKY_URL = 'https://opensky-network.org/api/states/all';

/**
 * GET /api/debug
 * Shows what env vars are detected — use this to verify Railway vars are set correctly.
 */
app.get('/api/debug', (req, res) => {
  res.json({
    hasUsername: !!process.env.OPENSKY_USERNAME,
    usernameValue: process.env.OPENSKY_USERNAME || '(not set)',
    hasPassword: !!process.env.OPENSKY_PASSWORD,
    nodeVersion: process.version,
    port: PORT
  });
});

/**
 * GET /api/planes
 * Fetches aircraft within a bounding box from OpenSky Network.
 */
app.get('/api/planes', async (req, res) => {
  try {
    const lamin = req.query.lamin ? parseFloat(req.query.lamin) : 51.2;
    const lamax = req.query.lamax ? parseFloat(req.query.lamax) : 51.8;
    const lomin = req.query.lomin ? parseFloat(req.query.lomin) : -0.5;
    const lomax = req.query.lomax ? parseFloat(req.query.lomax) : 0.4;

    const requestConfig = {
      params: { lamin, lamax, lomin, lomax },
      timeout: 15000,
      headers: { 'User-Agent': 'LookUp-FlightNotifier/1.0' }
    };

    const user = process.env.OPENSKY_USERNAME;
    const pass = process.env.OPENSKY_PASSWORD;

    if (user && pass) {
      requestConfig.auth = { username: user, password: pass };
      console.log(`[OpenSky] Authenticating as: ${user}`);
    } else {
      console.log('[OpenSky] No credentials — anonymous request');
    }

    const response = await axios.get(OPENSKY_URL, requestConfig);
    const states = response.data.states;

    if (!states || !Array.isArray(states)) {
      return res.json([]);
    }

    const planes = states.map(state => ({
      callsign:  state[1] ? state[1].trim() : 'UNKNOWN',
      longitude: state[5] !== null ? Number(state[5]) : null,
      latitude:  state[6] !== null ? Number(state[6]) : null,
      altitude:  state[7] !== null ? Number(state[7]) : null
    }));

    res.json(planes);

  } catch (error) {
    const status = error.response ? error.response.status : 500;
    const detail = error.response
      ? `OpenSky HTTP ${status}: ${JSON.stringify(error.response.data)}`
      : error.message;

    console.error('[OpenSky Error]', detail);
    res.status(status).json({ error: 'OpenSky fetch failed', detail });
  }
});

app.listen(PORT, () => {
  console.log(`LookUp server running on port ${PORT}`);
});
