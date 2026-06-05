// Dynamic coordinate limits for the radar scope bounding box (defaulting around NY initially)
let BOUNDS = {
  lamin: 51.2,
  lamax: 51.8,
  lomin: -0.5,
  lomax: 0.4
};

// Base API URL depends on context (uses absolute for local file:/// and relative for localhost server hosting)
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

// DOM Elements - Radar & Status
const scanBtn = document.getElementById('scanBtn');
const telemetryList = document.getElementById('telemetryList');
const markersOverlay = document.getElementById('markersOverlay');
const flightCount = document.getElementById('flightCount');
const radarScope = document.getElementById('radarScope');
const statusPulse = document.getElementById('status-pulse');
const statusText = document.getElementById('status-text');
const coordBoundsDisplay = document.getElementById('coordBoundsDisplay');

// DOM Elements - Location & Proximity Alerts Controls
const detectLocationBtn = document.getElementById('detectLocationBtn');
const requestNotifyBtn = document.getElementById('requestNotifyBtn');
const notifyBtnText = document.getElementById('notifyBtnText');
const userLatInput = document.getElementById('userLat');
const userLonInput = document.getElementById('userLon');
const updateCoordsBtn = document.getElementById('updateCoordsBtn');
const alertRadiusSlider = document.getElementById('alertRadiusSlider');
const radiusVal = document.getElementById('radiusVal');

// DOM Elements - Radar Overlay Location
const userLocationOverlay = document.getElementById('userLocationOverlay');
const proximityZone = document.getElementById('proximityZone');

// App State Management
let flights = [];
let selectedFlightCallsign = null;
let notifiedFlights = new Set(); // Track flights we have already notified to prevent spam

// Default User Location — London, UK
let userLocation = {
  latitude: 51.5,
  longitude: -0.12
};
let alertRadius = 5.0; // Proximity threshold in kilometers

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  scanBtn.addEventListener('click', scanAirspace);
  detectLocationBtn.addEventListener('click', detectUserLocation);
  requestNotifyBtn.addEventListener('click', requestNotificationPermission);
  updateCoordsBtn.addEventListener('click', handleManualCoordinateApply);
  alertRadiusSlider.addEventListener('input', handleRadiusSliderChange);
  
  // Synchronize dynamic bounds centered around the initial location
  updateBoundsToCenterUser();

  // Set default coordinates in the inputs
  userLatInput.value = userLocation.latitude.toFixed(4);
  userLonInput.value = userLocation.longitude.toFixed(4);

  // Initialize notifications status display
  updateNotificationButtonState();

  // Draw user marker position and alert circle radius bounds
  updateUserRadarGraphics();

  // Try an initial check to verify server status
  checkServerStatus();

  // Auto-scan on page load then every 12 seconds
  scanAirspace();

  const REFRESH_INTERVAL = 12; // seconds
  let countdown = REFRESH_INTERVAL;

  // Show countdown in the scan button label
  const btnText = scanBtn.querySelector('.btn-text');
  const originalBtnText = btnText ? btnText.textContent : 'Scan Skies';

  function updateCountdown() {
    if (!btnText) return;
    if (scanBtn.disabled) {
      // Scanning in progress — reset countdown
      countdown = REFRESH_INTERVAL;
      return;
    }
    countdown--;
    if (countdown <= 0) {
      countdown = REFRESH_INTERVAL;
      scanAirspace();
    } else {
      btnText.textContent = `Next scan in ${countdown}s`;
    }
  }

  // Reset label back after scan completes (watch disabled state)
  const observer = new MutationObserver(() => {
    if (!scanBtn.disabled && btnText && !btnText.textContent.includes('Next scan')) {
      btnText.textContent = `Next scan in ${countdown}s`;
    }
  });
  observer.observe(scanBtn, { attributes: true, attributeFilter: ['disabled'] });

  setInterval(updateCountdown, 1000);
});

/**
 * Recalculates bounding box to center user location on radar scope (0.4° lat span, 0.6° lon span)
 */
function updateBoundsToCenterUser() {
  BOUNDS.lamin = userLocation.latitude - 0.2;
  BOUNDS.lamax = userLocation.latitude + 0.2;
  BOUNDS.lomin = userLocation.longitude - 0.3;
  BOUNDS.lomax = userLocation.longitude + 0.3;
  
  // Update header text visual display with proper cardinal directions (N/S, E/W)
  const coordValueEl = document.querySelector('.coord-value');
  if (coordValueEl) {
    const latMinStr = formatCoordDisplay(BOUNDS.lamin, 'lat');
    const latMaxStr = formatCoordDisplay(BOUNDS.lamax, 'lat');
    const lonMinStr = formatCoordDisplay(BOUNDS.lomin, 'lon');
    const lonMaxStr = formatCoordDisplay(BOUNDS.lomax, 'lon');
    coordValueEl.textContent = `${latMinStr} - ${latMaxStr} | ${lonMinStr} - ${lonMaxStr}`;
  }
}

/**
 * Helper to display coordinates cleanly
 */
function formatCoordDisplay(val, type) {
  const abs = Math.abs(val).toFixed(2);
  if (type === 'lat') {
    return val >= 0 ? `${abs}°N` : `${abs}°S`;
  } else {
    return val >= 0 ? `${abs}°E` : `${abs}°W`;
  }
}

/**
 * Checks server health and updates the header badge status
 */
async function checkServerStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/planes`);
    if (response.ok) {
      updateStatusBadge('online');
    } else {
      updateStatusBadge('offline');
    }
  } catch (err) {
    updateStatusBadge('offline');
  }
}

/**
 * Updates the visual display of the status badge
 * @param {'online'|'offline'|'scanning'} status 
 */
function updateStatusBadge(status) {
  statusPulse.className = 'pulse-indicator';
  if (status === 'online') {
    statusPulse.classList.add('status-online');
    statusText.textContent = 'ONLINE';
    statusText.style.color = 'var(--color-secondary)';
  } else if (status === 'scanning') {
    statusPulse.classList.add('status-scanning');
    statusText.textContent = 'SCANNING';
    statusText.style.color = 'var(--color-primary)';
  } else {
    statusPulse.classList.add('status-offline');
    statusText.textContent = 'OFFLINE';
    statusText.style.color = 'var(--color-danger)';
  }
}

/**
 * Detects the user's real location using the browser Geolocation API
 */
function detectUserLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }

  detectLocationBtn.disabled = true;
  const originalText = detectLocationBtn.querySelector('.btn-text').textContent;
  detectLocationBtn.querySelector('.btn-text').textContent = 'Locating...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation.latitude = position.coords.latitude;
      userLocation.longitude = position.coords.longitude;

      // Update input fields
      userLatInput.value = userLocation.latitude.toFixed(4);
      userLonInput.value = userLocation.longitude.toFixed(4);

      // Re-center radar bounding box around the detected location
      updateBoundsToCenterUser();

      // Clear notifications cache for the new location
      notifiedFlights.clear();

      // Re-draw visual overlays on radar scope
      updateUserRadarGraphics();

      // Trigger automatic scan sweep centered around the detected coordinates
      scanAirspace();

      detectLocationBtn.disabled = false;
      detectLocationBtn.querySelector('.btn-text').textContent = originalText;
    },
    (error) => {
      console.warn('Geolocation error:', error);
      alert(`Unable to retrieve your location: ${error.message}. Please enter coordinates manually.`);
      detectLocationBtn.disabled = false;
      detectLocationBtn.querySelector('.btn-text').textContent = originalText;
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/**
 * Requests Notification API permissions from browser
 */
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support desktop notifications.');
    return;
  }

  Notification.requestPermission().then((permission) => {
    updateNotificationButtonState();
    if (permission === 'granted') {
      new Notification('SkyScan Alerts Enabled', {
        body: 'You will now receive desktop notifications when an aircraft flies within your proximity zone.',
        silent: false
      });
    }
  });
}

/**
 * Updates button visual based on current Notification API permissions
 */
function updateNotificationButtonState() {
  if (!('Notification' in window)) {
    requestNotifyBtn.disabled = true;
    notifyBtnText.textContent = 'Alerts Unsupported';
    return;
  }

  const status = Notification.permission;
  if (status === 'granted') {
    requestNotifyBtn.style.borderColor = 'var(--color-secondary)';
    requestNotifyBtn.style.color = 'var(--color-secondary)';
    notifyBtnText.textContent = 'Alerts Active';
  } else if (status === 'denied') {
    requestNotifyBtn.style.borderColor = 'var(--color-danger)';
    requestNotifyBtn.style.color = 'var(--color-danger)';
    notifyBtnText.textContent = 'Alerts Blocked';
  } else {
    notifyBtnText.textContent = 'Enable Alerts';
  }
}

/**
 * Triggers manual apply from form inputs
 */
function handleManualCoordinateApply() {
  const lat = parseFloat(userLatInput.value);
  const lon = parseFloat(userLonInput.value);

  // Check general Earth limits (-90 to 90 latitude, -180 to 180 longitude)
  if (isNaN(lat) || lat < -90 || lat > 90) {
    alert('Latitude must be a valid number between -90.0 and 90.0 degrees.');
    return;
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    alert('Longitude must be a valid number between -180.0 and 180.0 degrees.');
    return;
  }

  userLocation.latitude = lat;
  userLocation.longitude = lon;

  // Re-center radar bounding box around the manually inputted coordinates
  updateBoundsToCenterUser();

  // Clear notifications cache for the new location
  notifiedFlights.clear();

  updateUserRadarGraphics();
  
  // Re-run scan logic immediately to notify if new coordinate contains planes overhead
  scanAirspace();
}

/**
 * Updates UI and re-scales overlays when proximity slider shifts
 */
function handleRadiusSliderChange(e) {
  alertRadius = parseFloat(e.target.value);
  radiusVal.textContent = `${alertRadius.toFixed(1)} km`;
  updateUserRadarGraphics();
  
  // Clean active alert notifications list for planes that are now outside the adjusted zone
  processProximityAlerts();
}

/**
 * Calculates user mapping positions and adjusts size of proximity zone visual on radar
 */
function updateUserRadarGraphics() {
  // 1. Position User Marker on Radar Scope
  // Map longitude to X percentage (lomin to lomax)
  const x = ((userLocation.longitude - BOUNDS.lomin) / (BOUNDS.lomax - BOUNDS.lomin)) * 100;
  // Map latitude to Y percentage (lamin to lamax). Invert Y as 0% is top
  const y = 100 - ((userLocation.latitude - BOUNDS.lamin) / (BOUNDS.lamax - BOUNDS.lamin)) * 100;

  userLocationOverlay.style.left = `${x}%`;
  userLocationOverlay.style.top = `${y}%`;

  // 2. Scale Proximity Circle
  // Calculate bounding box width/height in kilometers
  const latRange = BOUNDS.lamax - BOUNDS.lamin;
  const lonRange = BOUNDS.lomax - BOUNDS.lomin;

  const kmPerDegreeLat = 111.04;
  // Account for longitude squeeze depending on latitude
  const kmPerDegreeLon = 111.04 * Math.cos(userLocation.latitude * Math.PI / 180);

  const boxHeightKm = latRange * kmPerDegreeLat;
  const boxWidthKm = lonRange * kmPerDegreeLon;

  // Convert radius to parent diameter percentage
  // alertRadius is radius, we need diameter (radius * 2)
  const heightPercent = ((alertRadius * 2) / boxHeightKm) * 100;
  const widthPercent = ((alertRadius * 2) / boxWidthKm) * 100;

  proximityZone.style.width = `${widthPercent}%`;
  proximityZone.style.height = `${heightPercent}%`;
}

/**
 * Uses Haversine Formula to calculate distance between user coordinates and airplane
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Runs proximity calculations for all active planes, updates UI card styling, and generates web notifications
 */
function processProximityAlerts() {
  const activeCallsignsThisScan = new Set();

  flights.forEach(flight => {
    if (flight.latitude === null || flight.longitude === null) return;

    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      flight.latitude,
      flight.longitude
    );

    flight.distance = distance; // Cache distance on object
    const isClose = distance <= alertRadius;

    // Retrieve corresponding card and marker elements
    const cardEl = document.getElementById(`card-${flight.callsign}`);
    const markerEl = document.querySelector(`.flight-marker[data-callsign="${flight.callsign}"]`);

    if (isClose) {
      activeCallsignsThisScan.add(flight.callsign);
      
      // Update UI displays to show proximity alerts
      if (cardEl) cardEl.classList.add('alert-active');
      if (markerEl) markerEl.classList.add('selected'); // Highlight close flights on radar

      // Trigger Web Push Notification if not already alerted
      if (!notifiedFlights.has(flight.callsign)) {
        triggerProximityPushNotification(flight, distance);
        notifiedFlights.add(flight.callsign);
      }
    } else {
      if (cardEl) cardEl.classList.remove('alert-active');
    }
  });
}

/**
 * Fires a system notification with detail specs
 */
function triggerProximityPushNotification(flight, distance) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const altFeet = flight.altitude !== null ? Math.round(flight.altitude * 3.28084) : null;
  const altDisplay = altFeet !== null ? `${altFeet.toLocaleString()} ft` : 'unknown altitude';
  
  new Notification('🛩️ Aircraft Overhead Alert', {
    body: `Flight ${flight.callsign} is in your vicinity!\nDistance: ${distance.toFixed(2)} km\nAltitude: ${altDisplay}`,
    tag: `proximity-${flight.callsign}`, // Group/replace notifications for same flight
    renotify: false,
    silent: false
  });
}

/**
 * Sweeps the sky by fetching active aircraft positions from the local backend proxy.
 */
async function scanAirspace() {
  // Disable button, start scanning visualization
  scanBtn.disabled = true;
  radarScope.classList.add('scanning');
  updateStatusBadge('scanning');
  
  telemetryList.innerHTML = `
    <div class="empty-state">
      <div class="btn-icon">
        <svg viewBox="0 0 24 24" width="40" height="40" stroke="var(--color-primary)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
        </svg>
      </div>
      <h3>Sweeping Radar Scope...</h3>
      <p>Receiving state vectors from OpenSky Network API. This might take a few seconds.</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE}/api/planes?lamin=${BOUNDS.lamin}&lamax=${BOUNDS.lamax}&lomin=${BOUNDS.lomin}&lomax=${BOUNDS.lomax}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error || `HTTP error! status: ${response.status}`;
      const errDetail = errorData.detail || '';
      const err = new Error(errMsg);
      err.detail = errDetail;
      throw err;
    }
    
    flights = await response.json();
    
    // Render the results
    renderDashboard();
    
    // Process distance thresholds and alerts
    processProximityAlerts();

    updateStatusBadge('online');
  } catch (error) {
    console.error('Scan error:', error);
    updateStatusBadge('offline');
    renderError(error.message, error.detail);
  } finally {
    // Re-enable controls and stop scanner rotation acceleration
    scanBtn.disabled = false;
    radarScope.classList.remove('scanning');
  }
}

/**
 * Draws all telemetry items on the list and radar map overlay.
 */
function renderDashboard() {
  // Clear previous markers & list items
  markersOverlay.innerHTML = '';
  telemetryList.innerHTML = '';
  
  // Update flight counter
  flightCount.textContent = `${flights.length} ${flights.length === 1 ? 'PLANE' : 'PLANES'} DETECTED`;

  // Update coordinate bounds display
  if (coordBoundsDisplay) {
    coordBoundsDisplay.textContent = `${BOUNDS.lamin.toFixed(2)}°–${BOUNDS.lamax.toFixed(2)}°N, ${BOUNDS.lomin.toFixed(2)}°–${BOUNDS.lomax.toFixed(2)}°`;
  }

  if (flights.length === 0) {
    telemetryList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <h3>No Flights in Airspace</h3>
        <p>There are currently no aircraft reporting telemetry within your active radar scope. Try scanning again shortly.</p>
      </div>
    `;
    return;
  }

  // Populate cards and radar dots
  flights.forEach(flight => {
    // 1. Create Radar Marker
    const marker = createRadarMarker(flight);
    markersOverlay.appendChild(marker);

    // 2. Create Info Card
    const card = createFlightCard(flight);
    telemetryList.appendChild(card);
  });
  
  // Re-apply selection if target is still present
  if (selectedFlightCallsign) {
    const stillActive = flights.some(f => f.callsign === selectedFlightCallsign);
    if (stillActive) {
      selectFlight(selectedFlightCallsign);
    } else {
      selectedFlightCallsign = null;
    }
  }
}

/**
 * Creates an absolute-positioned HTML marker representing flight on the radar circle
 */
function createRadarMarker(flight) {
  const marker = document.createElement('div');
  marker.className = 'flight-marker';
  marker.dataset.callsign = flight.callsign;
  
  // Calculate relative position based on NY Bounding box limits
  // Map longitude to X percentage (lomin to lomax)
  const x = ((flight.longitude - BOUNDS.lomin) / (BOUNDS.lomax - BOUNDS.lomin)) * 100;
  // Map latitude to Y percentage (lamin to lamax). Invert Y as 0% is top
  const y = 100 - ((flight.latitude - BOUNDS.lamin) / (BOUNDS.lamax - BOUNDS.lamin)) * 100;

  // Bound checks to avoid plotting markers completely outside circle
  const boundedX = Math.max(2, Math.min(98, x));
  const boundedY = Math.max(2, Math.min(98, y));

  marker.style.left = `${boundedX}%`;
  marker.style.top = `${boundedY}%`;

  marker.innerHTML = `
    <div class="marker-dot"></div>
    <span class="marker-label">${flight.callsign}</span>
  `;

  // Interactivity
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFlight(flight.callsign);
  });

  return marker;
}

/**
 * Creates detailed information card element for list panel
 */
function createFlightCard(flight) {
  const card = document.createElement('div');
  card.className = 'flight-card';
  card.id = `card-${flight.callsign}`;
  card.dataset.callsign = flight.callsign;

  // Convert meters altitude to feet for display
  const altFeet = flight.altitude !== null ? Math.round(flight.altitude * 3.28084) : null;
  const altMeters = flight.altitude !== null ? Math.round(flight.altitude) : null;
  const altDisplay = altFeet !== null ? `${altFeet.toLocaleString()} ft (${altMeters.toLocaleString()} m)` : 'N/A';

  const latDisplay = flight.latitude !== null ? flight.latitude.toFixed(4) : 'N/A';
  const lonDisplay = flight.longitude !== null ? flight.longitude.toFixed(4) : 'N/A';

  const distance = flight.distance;
  const distDisplay = distance !== undefined ? `${distance.toFixed(2)} km` : null;

  card.innerHTML = `
    <div class="card-main">
      <div class="plane-badge">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      </div>
      <div>
        <h3 class="plane-callsign">${flight.callsign}</h3>
        <div class="plane-details">
          <div class="detail-row">
            <span class="detail-label">Altitude:</span>
            <span class="detail-value">${altDisplay}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Position:</span>
            <span class="detail-value">${latDisplay}°N, ${lonDisplay}°E</span>
          </div>
          ${distDisplay ? `
          <div class="detail-row">
            <span class="detail-label">Distance:</span>
            <span class="detail-value" style="color: var(--color-secondary); font-weight: 700;">${distDisplay}</span>
          </div>` : ''}
        </div>
      </div>
    </div>
    <div class="card-action-arrow">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="var(--text-muted)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </div>
  `;

  card.addEventListener('click', () => selectFlight(flight.callsign));
  return card;
}

/**
 * Toggles highlight styling for selected aircraft in both list and map views
 */
function selectFlight(callsign) {
  // Clear previous selections
  document.querySelectorAll('.flight-card.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.flight-marker.selected').forEach(el => el.classList.remove('selected'));

  if (selectedFlightCallsign === callsign) {
    // Clicking the same card again deselects it
    selectedFlightCallsign = null;
    return;
  }

  selectedFlightCallsign = callsign;

  // Add selection formatting to active elements
  const activeCard = document.getElementById(`card-${callsign}`);
  const activeMarker = document.querySelector(`.flight-marker[data-callsign="${callsign}"]`);

  if (activeCard) {
    activeCard.classList.add('selected');
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (activeMarker) {
    activeMarker.classList.add('selected');
  }
}

function renderError(message, detail = '') {
  flightCount.textContent = 'ERROR DETECTED';
  telemetryList.innerHTML = `
    <div class="empty-state error-card">
      <div class="empty-icon" style="color: var(--color-danger)">
        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <h3>Radar Scan Failed</h3>
      <p>Could not load flight data from Express proxy backend.</p>
      <div class="error-details">
        <strong>Details:</strong> ${message}${detail ? `<br><small style="display:block;margin-top:5px;opacity:0.8;color:var(--color-danger)">${detail}</small>` : ''}<br>
        <em>Ensure you run 'node server.js' and the proxy has internet connectivity to OpenSky Network.</em>
      </div>
    </div>
  `;
}
