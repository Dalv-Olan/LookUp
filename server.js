const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Serve static frontend files (index.html, index.css, app.js) from current workspace
app.use(express.static(path.join(__dirname)));

// OpenSky Network API configuration for New York bounding box
const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const NY_BOUNDS = {
  lamin: 40.5,
  lamax: 40.9,
  lomin: -74.3,
  lomax: -73.7
};

/**
 * GET /api/planes
 * Fetches and filters aircraft within the bounding box, mapping array fields to descriptive keys.
 * Supports custom bounds via query parameters: ?lamin=...&lamax=...&lomin=...&lomax=...
 */
app.get('/api/planes', async (req, res) => {
  try {
    const lamin = req.query.lamin ? parseFloat(req.query.lamin) : NY_BOUNDS.lamin;
    const lamax = req.query.lamax ? parseFloat(req.query.lamax) : NY_BOUNDS.lamax;
    const lomin = req.query.lomin ? parseFloat(req.query.lomin) : NY_BOUNDS.lomin;
    const lomax = req.query.lomax ? parseFloat(req.query.lomax) : NY_BOUNDS.lomax;

    const response = await axios.get(OPENSKY_URL, {
      params: { lamin, lamax, lomin, lomax },
      timeout: 10000 // 10 second timeout
    });

    const states = response.data.states;

    if (!states || !Array.isArray(states)) {
      // Return empty list if no aircraft are currently within the bounding box
      return res.json([]);
    }

    const cleanedPlanes = states.map(state => {
      // OpenSky Array Indices:
      // 1: callsign (string)
      // 5: longitude (float, in degrees)
      // 6: latitude (float, in degrees)
      // 7: baro_altitude (float, in meters)
      const callsign = state[1] ? state[1].trim() : 'UNKNOWN';
      const longitude = state[5] !== null ? Number(state[5]) : null;
      const latitude = state[6] !== null ? Number(state[6]) : null;
      const altitude = state[7] !== null ? Number(state[7]) : null;

      return {
        callsign,
        longitude,
        latitude,
        altitude
      };
    });

    res.json(cleanedPlanes);
  } catch (error) {
    console.error('Error fetching data from OpenSky API:', error.message);
    
    // Handle specific errors like rate limits (429) or OpenSky downtime
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Failed to fetch flight data from OpenSky API.',
        details: error.response.data || error.message
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        details: error.message
      });
    }
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Educational Flight Tracker server is running on http://localhost:${PORT}`);
});
