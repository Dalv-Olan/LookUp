const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

const OPENSKY_API    = 'https://opensky-network.org/api/states/all';
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

// Token cache
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Fetches a Bearer token using OAuth2 client_credentials flow.
 * Caches it until 60s before expiry.
 */
async function getAccessToken() {
  const clientId     = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  console.log('[OAuth2] Fetching new access token...');
  const params = new URLSearchParams();
  params.append('grant_type',    'client_credentials');
  params.append('client_id',     clientId);
  params.append('client_secret', clientSecret);

  const response = await axios.post(OPENSKY_TOKEN_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000
  });

  const { access_token, expires_in } = response.data;
  cachedToken    = access_token;
  tokenExpiresAt = Date.now() + (expires_in - 60) * 1000; // refresh 60s early

  console.log('[OAuth2] Token acquired, expires in', expires_in, 's');
  return cachedToken;
}

/**
 * GET /api/debug
 */
app.get('/api/debug', (req, res) => {
  res.json({
    hasClientId:     !!process.env.OPENSKY_CLIENT_ID,
    clientIdValue:   process.env.OPENSKY_CLIENT_ID || '(not set)',
    hasClientSecret: !!process.env.OPENSKY_CLIENT_SECRET,
    tokenCached:     !!cachedToken,
    nodeVersion:     process.version,
    port:            PORT
  });
});

/**
 * GET /api/planes
 */
app.get('/api/planes', async (req, res) => {
  try {
    const lamin = req.query.lamin ? parseFloat(req.query.lamin) : 51.2;
    const lamax = req.query.lamax ? parseFloat(req.query.lamax) : 51.8;
    const lomin = req.query.lomin ? parseFloat(req.query.lomin) : -0.5;
    const lomax = req.query.lomax ? parseFloat(req.query.lomax) : 0.4;

    const requestConfig = {
      params:  { lamin, lamax, lomin, lomax },
      timeout: 15000,
      headers: { 'User-Agent': 'LookUp-FlightNotifier/1.0' }
    };

    // Try OAuth2 token if credentials are present
    const token = await getAccessToken();
    if (token) {
      requestConfig.headers['Authorization'] = `Bearer ${token}`;
      console.log('[OpenSky] Using Bearer token');
    } else {
      console.log('[OpenSky] No credentials — anonymous request');
    }

    const response = await axios.get(OPENSKY_API, requestConfig);
    const states   = response.data.states;

    if (!states || !Array.isArray(states)) {
      return res.json([]);
    }

    const planes = states.map(s => ({
      callsign:  s[1] ? s[1].trim() : 'UNKNOWN',
      longitude: s[5] !== null ? Number(s[5]) : null,
      latitude:  s[6] !== null ? Number(s[6]) : null,
      altitude:  s[7] !== null ? Number(s[7]) : null
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
