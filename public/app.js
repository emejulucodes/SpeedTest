// DOM Elements
const startBtn = document.getElementById('startBtn');
const statusDot = document.getElementById('statusDot');
const pingValue = document.getElementById('pingValue');
const jitterValue = document.getElementById('jitterValue');
const downloadValue = document.getElementById('downloadValue');
const uploadValue = document.getElementById('uploadValue');
const lossValue = document.getElementById('lossValue');
const speedValue = document.getElementById('speedValue');
const speedUnit = document.getElementById('speedUnit');
const phaseLabel = document.getElementById('phaseLabel');
const phaseDetail = document.getElementById('phaseDetail');
const dataTransferred = document.getElementById('dataTransferred');
const durationValue = document.getElementById('durationValue');
const eventLog = document.getElementById('eventLog');
const mbpsBtn = document.getElementById('mbpsBtn');
const mbsBtn = document.getElementById('mbsBtn');
const downloadUnitLabel = document.querySelector('#downloadValue + span');
const uploadUnitLabel = document.querySelector('#uploadValue + span');
const historyList = document.getElementById('historyList');
const connectionType = document.getElementById('connectionType');
const ispValue = document.getElementById('ispValue');
const ipValue = document.getElementById('ipValue');
const serverValue = document.getElementById('serverValue');
const networkValue = document.getElementById('networkValue');
const progressPercent = document.getElementById('progressPercent');
const resultModal = document.getElementById('resultModal');

// State
let running = false;
let useMetric = false;
let lastDownloadMbps = 0;
let lastUploadMbps = 0;
let testHistory = JSON.parse(localStorage.getItem('speedTestHistory') || '[]');
let realtimeDiffData = [];
let previousRealtimeSpeed = null;
let connectionListenerBound = false;
let connectionChangeListenerBound = false;

let realtimeDiffSvg;
let realtimeDiffLine;
let realtimeDiffZeroLine;
let realtimeDiffXAxis;
let realtimeDiffYAxis;
let realtimeDiffXScale;
let realtimeDiffYScale;
let realtimeDiffResizeBound = false;

const GAUGE_MAX_SPEED = 1000;
const REALTIME_DIFF_MAX_POINTS = 60;
const GAUGE_THEME = {
  idle: {
    gradient: ['#06b6d4', '#3b82f6', '#8b5cf6'],
    needle: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.8)'
  },
  download: {
    gradient: ['#10b981', '#34d399', '#06b6d4'],
    needle: '#10b981',
    glow: 'rgba(16, 185, 129, 0.8)'
  },
  upload: {
    gradient: ['#8b5cf6', '#a78bfa', '#3b82f6'],
    needle: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.8)'
  }
};
const GAUGE_SPEED_BAND_THEME = {
  slow: {
    gradient: ['#f59e0b', '#f97316', '#ef4444'],
    needle: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.8)'
  },
  fast: {
    gradient: ['#10b981', '#34d399', '#06b6d4'],
    needle: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.8)'
  }
};

// D3.js Gauge Setup
let d3Gauge, d3Arc, d3ValueArc, d3GaugeSvg;
let d3GaugeGradientStops = [];
let d3Needle;
let d3NeedleCenterOuter;
let currentGaugeThemeName = 'idle';
let lastAppliedGaugeThemeKey = '';
let currentGaugeEndAngle = -Math.PI * 0.75;
let currentNeedleAngle = -135;

// Three.js Setup
let threeScene, threeCamera, threeRenderer, particleSystem;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  detectConnectionType();
  fetchNetworkInfo();
  initThreeJS();
  initD3Gauge();
  initRealtimeDiffChart();
  initD3HistoryChart();
  loadHistory();
  animateThreeJS();
});

// Detect connection type
function detectConnectionType() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (!connectionListenerBound) {
    window.addEventListener('online', detectConnectionType);
    window.addEventListener('offline', detectConnectionType);
    connectionListenerBound = true;
  }

  if (!conn) {
    connectionType.textContent = navigator.onLine ? 'Online' : 'Offline';
    return;
  }

  const typeMap = {
    wifi: 'Wi-Fi',
    ethernet: 'Ethernet',
    cellular: 'Cellular',
    bluetooth: 'Bluetooth',
    wimax: 'WiMAX',
    none: 'Offline',
    other: 'Other'
  };

  const effectiveTypeMap = {
    'slow-2g': 'Slow 2G',
    '2g': '2G',
    '3g': '3G',
    '4g': '4G'
  };

  const rawType = typeof conn.type === 'string' ? conn.type.toLowerCase() : '';
  const transportLabel = typeMap[rawType] || '';
  const rawEffectiveType = typeof conn.effectiveType === 'string' ? conn.effectiveType.toLowerCase() : '';
  const qualityLabel = effectiveTypeMap[rawEffectiveType] || '';

  if (transportLabel === 'Offline' || !navigator.onLine) {
    connectionType.textContent = 'Offline';
  } else if (transportLabel && qualityLabel) {
    connectionType.textContent = `${transportLabel} • ${qualityLabel}`;
  } else if (transportLabel) {
    connectionType.textContent = transportLabel;
  } else if (qualityLabel) {
    connectionType.textContent = qualityLabel;
  } else {
    connectionType.textContent = 'Online';
  }

  if (!connectionChangeListenerBound && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', detectConnectionType);
    connectionChangeListenerBound = true;
  }
}

async function fetchNetworkInfo() {
  try {
    if (ipValue) ipValue.textContent = 'Detecting...';
    if (ispValue) ispValue.textContent = 'Detecting...';
    if (serverValue) serverValue.textContent = 'Detecting...';
    if (networkValue) networkValue.textContent = 'Detecting...';

    const browserPublicIp = await detectBrowserPublicIp();
    const endpoint = browserPublicIp
      ? `/api/network-info?clientIp=${encodeURIComponent(browserPublicIp)}`
      : '/api/network-info';

    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error('Network info unavailable');

    const data = await response.json();
    const resolvedIp = data?.ip || 'Unavailable';
    const resolvedIsp = data?.isp || 'Unavailable';
    const resolvedNetwork = data?.network || 'Unavailable';
    const serverName = data?.server?.name || 'Server';
    const serverLocation = data?.server?.location || '';

    if (ipValue) ipValue.textContent = resolvedIp;
    if (ispValue) ispValue.textContent = resolvedIsp;
    if (networkValue) networkValue.textContent = resolvedNetwork;
    if (serverValue) {
      serverValue.textContent = serverLocation ? `${serverName} - ${serverLocation}` : serverName;
    }

    if (data?.debug) {
      console.debug('Network debug', data.debug);
    }
  } catch {
    if (ipValue) ipValue.textContent = 'Unavailable';
    if (ispValue) ispValue.textContent = 'Unavailable';
    if (serverValue) serverValue.textContent = 'Unavailable';
    if (networkValue) networkValue.textContent = 'Unavailable';
  }
}

async function detectBrowserPublicIp() {
  const providers = [
    'https://api64.ipify.org?format=json',
    'https://api.ipify.org?format=json'
  ];

  for (const provider of providers) {
    try {
      const response = await fetch(provider, { cache: 'no-store' });
      if (!response.ok) continue;
      const payload = await response.json();
      const ip = String(payload?.ip || '').trim();
      if (ip) return ip;
    } catch {
      // Continue to next provider.
    }
  }

  return '';
}

// Three.js 3D Background Animation
function initThreeJS() {
  const canvas = document.getElementById('threejs-bg');
  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  threeRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  threeRenderer.setSize(window.innerWidth, window.innerHeight);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  threeCamera.position.z = 50;

  // Create particle system
  const particlesGeometry = new THREE.BufferGeometry();
  const particlesCount = 1500;
  const posArray = new Float32Array(particlesCount * 3);
  const colors = new Float32Array(particlesCount * 3);

  for (let i = 0; i < particlesCount * 3; i += 3) {
    posArray[i] = (Math.random() - 0.5) * 100;
    posArray[i + 1] = (Math.random() - 0.5) * 100;
    posArray[i + 2] = (Math.random() - 0.5) * 100;

    // Colorful particles
    const colorChoice = Math.random();
    if (colorChoice < 0.33) {
      colors[i] = 0.02; colors[i + 1] = 0.71; colors[i + 2] = 0.83; // Cyan
    } else if (colorChoice < 0.66) {
      colors[i] = 0.23; colors[i + 1] = 0.51; colors[i + 2] = 0.96; // Blue
    } else {
      colors[i] = 0.55; colors[i + 1] = 0.36; colors[i + 2] = 0.96; // Purple
    }
  }

  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particlesMaterial = new THREE.PointsMaterial({
    size: 0.3,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });

  particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
  threeScene.add(particleSystem);

  // Add ambient lighting effect
  const ambientLight = new THREE.AmbientLight(0x404040);
  threeScene.add(ambientLight);

  // Handle window resize
  window.addEventListener('resize', () => {
    threeCamera.aspect = window.innerWidth / window.innerHeight;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animateThreeJS() {
  requestAnimationFrame(animateThreeJS);

  // Rotate and animate particles
  particleSystem.rotation.x += 0.0003;
  particleSystem.rotation.y += 0.0005;

  // Wave effect
  const positions = particleSystem.geometry.attributes.position.array;
  const time = Date.now() * 0.0001;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    positions[i + 1] += Math.sin(time + x * 0.1) * 0.01;
  }
  
  particleSystem.geometry.attributes.position.needsUpdate = true;
  threeRenderer.render(threeScene, threeCamera);
}

// D3.js Circular Gauge with Needle

function valueToGaugeAngle(value) {
  const ratio = Math.min(Math.max(value, 0) / GAUGE_MAX_SPEED, 1);
  return -135 + (ratio * 270);
}

function setGaugeTheme(themeName = 'idle', speedBand = 'normal') {
  const baseTheme = GAUGE_THEME[themeName] || GAUGE_THEME.idle;
  const overrideTheme = GAUGE_SPEED_BAND_THEME[speedBand] || null;
  const theme = overrideTheme || baseTheme;
  const themeKey = `${themeName}:${speedBand}`;
  const transitionMs = 260;

  currentGaugeThemeName = themeName;

  if (themeKey === lastAppliedGaugeThemeKey) {
    return;
  }
  lastAppliedGaugeThemeKey = themeKey;

  if (d3GaugeGradientStops.length === 3) {
    d3GaugeGradientStops[0]
      .transition('theme')
      .duration(transitionMs)
      .attr('stop-color', theme.gradient[0]);
    d3GaugeGradientStops[1]
      .transition('theme')
      .duration(transitionMs)
      .attr('stop-color', theme.gradient[1]);
    d3GaugeGradientStops[2]
      .transition('theme')
      .duration(transitionMs)
      .attr('stop-color', theme.gradient[2]);
  }

  if (d3Gauge) {
    d3Gauge.style('filter', `drop-shadow(0 0 10px ${theme.glow})`);
  }

  if (d3Needle) {
    d3Needle
      .transition('theme')
      .duration(transitionMs)
      .attr('stroke', theme.needle)
      .selection()
      .style('filter', `drop-shadow(0 0 8px ${theme.glow})`);
  }

  if (d3NeedleCenterOuter) {
    d3NeedleCenterOuter
      .transition('theme')
      .duration(transitionMs)
      .attr('fill', theme.needle)
      .selection()
      .style('filter', `drop-shadow(0 0 6px ${theme.glow})`);
  }
}

function initD3Gauge() {
  // Responsive sizing
  const container = document.getElementById('d3-gauge');
  const containerWidth = container.clientWidth || 320;
  const width = Math.min(containerWidth, 320);
  const height = width;
  const radius = Math.min(width, height) / 2 - 15;

  d3GaugeSvg = d3.select('#d3-gauge')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${width / 2}, ${height / 2})`);

  // Background arc (full circle)
  d3Arc = d3.arc()
    .innerRadius(radius - 20)
    .outerRadius(radius)
    .startAngle(-Math.PI * 0.75)
    .cornerRadius(10);

  // Background circle
  d3GaugeSvg.append('path')
    .attr('d', d3Arc({ endAngle: Math.PI * 0.75 }))
    .attr('fill', 'rgba(71, 85, 105, 0.3)');

  // Value arc
  d3ValueArc = d3.arc()
    .innerRadius(radius - 20)
    .outerRadius(radius)
    .startAngle(-Math.PI * 0.75)
    .cornerRadius(10);

  d3Gauge = d3GaugeSvg.append('path')
    .attr('d', d3ValueArc({ endAngle: -Math.PI * 0.75 }))
    .attr('fill', 'url(#gaugeGradient)')
    .style('filter', 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.5))');

  // Create gradient
  const gradient = d3GaugeSvg.append('defs')
    .append('linearGradient')
    .attr('id', 'gaugeGradient')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '100%')
    .attr('y2', '100%');

  const stopStart = gradient.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', '#06b6d4');

  const stopMiddle = gradient.append('stop')
    .attr('offset', '50%')
    .attr('stop-color', '#3b82f6');

  const stopEnd = gradient.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', '#8b5cf6');

  d3GaugeGradientStops = [stopStart, stopMiddle, stopEnd];

  // Add needle
  const needleLength = radius - 30;
  d3Needle = d3GaugeSvg.append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', -needleLength)
    .attr('stroke', '#06b6d4')
    .attr('stroke-width', 3)
    .attr('stroke-linecap', 'round')
    .style('filter', 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.8))')
    .attr('transform', 'rotate(-135)');

  currentNeedleAngle = -135;

  // Needle center circle
  d3NeedleCenterOuter = d3GaugeSvg.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', 8)
    .attr('fill', '#06b6d4')
    .style('filter', 'drop-shadow(0 0 6px rgba(6, 182, 212, 0.6))');

  d3GaugeSvg.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', 4)
    .attr('fill', '#0f172a');

  setGaugeTheme('idle', 'normal');

  // Handle window resize
  window.addEventListener('resize', () => {
    const newContainerWidth = container.clientWidth || 320;
    const newWidth = Math.min(newContainerWidth, 320);
    d3.select('#d3-gauge svg')
      .attr('width', newWidth)
      .attr('height', newWidth);
  });
}

function initRealtimeDiffChart() {
  const container = document.getElementById('realtime-speed-chart');
  if (!container) return;

  d3.select('#realtime-speed-chart').selectAll('*').remove();

  const margin = { top: 8, right: 10, bottom: 20, left: 40 };
  const width = Math.max((container.clientWidth || 320) - margin.left - margin.right, 100);
  const height = 140 - margin.top - margin.bottom;

  realtimeDiffXScale = d3.scaleLinear()
    .domain([0, REALTIME_DIFF_MAX_POINTS - 1])
    .range([0, width]);

  realtimeDiffYScale = d3.scaleLinear()
    .domain([-10, 10])
    .range([height, 0]);

  const svg = d3.select('#realtime-speed-chart')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  realtimeDiffSvg = svg;

  realtimeDiffZeroLine = svg.append('line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', realtimeDiffYScale(0))
    .attr('y2', realtimeDiffYScale(0))
    .attr('stroke', 'rgba(148, 163, 184, 0.4)')
    .attr('stroke-dasharray', '3 3');

  realtimeDiffLine = svg.append('path')
    .attr('fill', 'none')
    .attr('stroke', '#06b6d4')
    .attr('stroke-width', 2)
    .style('filter', 'drop-shadow(0 0 6px rgba(6, 182, 212, 0.5))');

  realtimeDiffXAxis = svg.append('g')
    .attr('transform', `translate(0, ${height})`)
    .attr('color', '#64748b')
    .attr('font-size', '10px');

  realtimeDiffYAxis = svg.append('g')
    .attr('color', '#64748b')
    .attr('font-size', '10px');

  updateRealtimeDiffChart();

  if (!realtimeDiffResizeBound) {
    window.addEventListener('resize', () => {
      initRealtimeDiffChart();
    });
    realtimeDiffResizeBound = true;
  }
}

function updateRealtimeDiffChart() {
  if (!realtimeDiffSvg || !realtimeDiffLine || !realtimeDiffXScale || !realtimeDiffYScale) return;

  const chartData = realtimeDiffData.length > 0
    ? realtimeDiffData
    : [{ index: 0, diff: 0 }];

  const maxAbsDiff = Math.max(1, d3.max(chartData, d => Math.abs(d.diff)) || 1);
  const domainLimit = maxAbsDiff * 1.2;

  realtimeDiffYScale.domain([-domainLimit, domainLimit]);

  const lineGenerator = d3.line()
    .x(d => realtimeDiffXScale(d.index))
    .y(d => realtimeDiffYScale(d.diff))
    .curve(d3.curveMonotoneX);

  const latestDiff = chartData[chartData.length - 1]?.diff || 0;
  const lineColor = latestDiff > 0 ? '#10b981' : latestDiff < 0 ? '#ef4444' : '#06b6d4';

  realtimeDiffLine
    .datum(chartData)
    .attr('stroke', lineColor)
    .attr('d', lineGenerator);

  realtimeDiffZeroLine
    .attr('y1', realtimeDiffYScale(0))
    .attr('y2', realtimeDiffYScale(0));

  realtimeDiffXAxis
    .call(d3.axisBottom(realtimeDiffXScale).ticks(5).tickFormat(() => ''));

  realtimeDiffYAxis
    .call(d3.axisLeft(realtimeDiffYScale).ticks(4));
}

function pushRealtimeSample(speedMbps) {
  if (!Number.isFinite(speedMbps)) return;

  const diff = previousRealtimeSpeed === null ? 0 : speedMbps - previousRealtimeSpeed;
  previousRealtimeSpeed = speedMbps;

  realtimeDiffData.push({
    index: realtimeDiffData.length,
    diff
  });

  if (realtimeDiffData.length > REALTIME_DIFF_MAX_POINTS) {
    realtimeDiffData = realtimeDiffData.slice(-REALTIME_DIFF_MAX_POINTS);
  }

  realtimeDiffData = realtimeDiffData.map((point, idx) => ({
    index: idx,
    diff: point.diff
  }));

  updateRealtimeDiffChart();
}

function resetRealtimeDiffChart() {
  realtimeDiffData = [];
  previousRealtimeSpeed = null;
  updateRealtimeDiffChart();
}

// D3.js History Chart
function initD3HistoryChart() {
  updateD3HistoryChart();
}

function updateD3HistoryChart() {
  const container = document.getElementById('d3-history-chart');
  if (!container) return;

  // Clear previous chart
  d3.select('#d3-history-chart').selectAll('*').remove();

  if (testHistory.length === 0) {
    d3.select('#d3-history-chart')
      .append('div')
      .attr('class', 'flex items-center justify-center h-full text-slate-500 text-xs')
      .text('No test history yet');
    return;
  }

  const margin = { top: 10, right: 10, bottom: 20, left: 35 };
  const width = container.clientWidth - margin.left - margin.right;
  const height = 128 - margin.top - margin.bottom;

  const svg = d3.select('#d3-history-chart')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  // Prepare data
  const data = testHistory.slice(0, 10).reverse().map((d, i) => ({
    index: i,
    download: d.download,
    upload: d.upload
  }));

  // Scales
  const xScale = d3.scaleLinear()
    .domain([0, Math.max(data.length - 1, 1)])
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => Math.max(d.download, d.upload)) * 1.1])
    .range([height, 0]);

  // Line generators
  const downloadLine = d3.line()
    .x(d => xScale(d.index))
    .y(d => yScale(d.download))
    .curve(d3.curveMonotoneX);

  const uploadLine = d3.line()
    .x(d => xScale(d.index))
    .y(d => yScale(d.upload))
    .curve(d3.curveMonotoneX);

  // Grid lines
  svg.append('g')
    .attr('class', 'grid')
    .attr('opacity', 0.1)
    .call(d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat(''));

  // Download line
  svg.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#10b981')
    .attr('stroke-width', 2)
    .attr('d', downloadLine);

  // Upload line
  svg.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#06b6d4')
    .attr('stroke-width', 2)
    .attr('d', uploadLine);

  // Axes
  svg.append('g')
    .attr('transform', `translate(0, ${height})`)
    .call(d3.axisBottom(xScale).ticks(5))
    .attr('color', '#64748b')
    .attr('font-size', '10px');

  svg.append('g')
    .call(d3.axisLeft(yScale).ticks(4))
    .attr('color', '#64748b')
    .attr('font-size', '10px');
}

// Utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatMbps(value) {
  return value >= 100 ? Math.round(value) : value.toFixed(1);
}

function convertToMetric(mbps) {
  return mbps / 8;
}

function normalizeSpeedUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase();
  const aliases = {
    bps: 'bps',
    kbps: 'Kbps',
    mbps: 'Mbps',
    gbps: 'Gbps',
    'b/s': 'B/s',
    'kb/s': 'KB/s',
    'mb/s': 'MB/s',
    'gb/s': 'GB/s'
  };
  return aliases[normalized] || null;
}

function toBitsPerSecond(value, unit) {
  const normalizedUnit = normalizeSpeedUnit(unit);
  const multipliers = {
    bps: 1,
    Kbps: 1e3,
    Mbps: 1e6,
    Gbps: 1e9,
    'B/s': 8,
    'KB/s': 8e3,
    'MB/s': 8e6,
    'GB/s': 8e9
  };

  if (!normalizedUnit || !multipliers[normalizedUnit]) {
    throw new Error(`Unsupported speed unit: ${unit}`);
  }

  return Number(value) * multipliers[normalizedUnit];
}

function fromBitsPerSecond(bps, unit) {
  const normalizedUnit = normalizeSpeedUnit(unit);
  const divisors = {
    bps: 1,
    Kbps: 1e3,
    Mbps: 1e6,
    Gbps: 1e9,
    'B/s': 8,
    'KB/s': 8e3,
    'MB/s': 8e6,
    'GB/s': 8e9
  };

  if (!normalizedUnit || !divisors[normalizedUnit]) {
    throw new Error(`Unsupported speed unit: ${unit}`);
  }

  return bps / divisors[normalizedUnit];
}

function convertSpeed(value, fromUnit, toUnit) {
  return fromBitsPerSecond(toBitsPerSecond(value, fromUnit), toUnit);
}

function formatSpeedValue(value) {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toString();
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function getAdaptiveSpeedFromMbps(mbps, preferBytes = false) {
  const unitOrder = preferBytes
    ? ['GB/s', 'MB/s', 'KB/s', 'B/s']
    : ['Gbps', 'Mbps', 'Kbps', 'bps'];

  for (const unit of unitOrder) {
    const converted = convertSpeed(mbps, 'Mbps', unit);
    if (converted >= 1 || unit === unitOrder[unitOrder.length - 1]) {
      return { value: converted, unit };
    }
  }

  return { value: mbps, unit: 'Mbps' };
}

function formatDataSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatTime(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${minutes}m ${secs}s`;
}

// Update gauge with D3.js animation
function updateGauge(speed, max = 300) {
  const display = getAdaptiveSpeedFromMbps(speed, useMetric);
  
  speedValue.textContent = formatSpeedValue(display.value);
  speedUnit.textContent = display.unit;

  pushRealtimeSample(speed);
  
  const gaugeRatio = Math.min(speed / GAUGE_MAX_SPEED, 1);
  const progressRatio = Math.min(speed / max, 1);

  let speedBand = 'normal';
  if (progressRatio <= 0.35) {
    speedBand = 'slow';
  } else if (progressRatio >= 0.8) {
    speedBand = 'fast';
  }
  setGaugeTheme(currentGaugeThemeName, speedBand);

  // Map to 270 degrees arc (-135 to 135)
  const totalAngle = Math.PI * 1.5; // 270 degrees
  const startAngle = -Math.PI * 0.75; // -135 degrees
  const endAngle = startAngle + (gaugeRatio * totalAngle);
  const needleAngle = -135 + (gaugeRatio * 270); // Degrees for rotation
  const motionDuration = 140;

  // Animate D3 gauge arc
  if (d3Gauge) {
    d3Gauge.interrupt('motion');
    d3Gauge.transition('motion')
      .duration(motionDuration)
      .ease(d3.easeLinear)
      .attrTween('d', function() {
        const currentAngle = Number.isFinite(currentGaugeEndAngle) ? currentGaugeEndAngle : startAngle;
        const interpolate = d3.interpolate(currentAngle, endAngle);
        return function(t) {
          const angle = interpolate(t);
          currentGaugeEndAngle = angle;
          return d3ValueArc({ endAngle: angle });
        };
      });
  }

  // Animate needle rotation
  if (d3Needle) {
    d3Needle.interrupt('motion');
    d3Needle.transition('motion')
      .duration(motionDuration)
      .ease(d3.easeLinear)
      .attrTween('transform', function() {
        const from = Number.isFinite(currentNeedleAngle) ? currentNeedleAngle : -135;
        const interpolate = d3.interpolateNumber(from, needleAngle);
        return function(t) {
          const angle = interpolate(t);
          currentNeedleAngle = angle;
          return `rotate(${angle})`;
        };
      });
  }
  
  // Update progress
  progressPercent.textContent = Math.round(progressRatio * 100) + '%';
}

function setPhase(phase, detail = '') {
  phaseLabel.textContent = phase;
  phaseDetail.textContent = detail || phase;
}

function logEvent(message, type = 'info') {
  const item = document.createElement('div');
  item.className = 'item';
  item.textContent = `✓ ${message}`;
  item.style.opacity = '0';
  eventLog.insertBefore(item, eventLog.firstChild);
  
  // Fade in animation
  requestAnimationFrame(() => {
    item.style.transition = 'opacity 0.3s ease';
    item.style.opacity = '1';
  });
  
  // Keep only last 15 events
  while (eventLog.children.length > 15) {
    eventLog.removeChild(eventLog.lastChild);
  }
}

// Ping test
async function runPingTest(samples = 10) {
  setPhase('Latency', 'Measuring ping');
  logEvent('Starting latency test');
  
  let times = [];
  let failures = 0;
  
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      await fetch(`/api/ping?_=${Date.now()}_${i}`, { cache: 'no-store' });
      const ms = performance.now() - start;
      times.push(ms);
      updateGauge(Math.random() * 100);
    } catch {
      failures++;
    }
    await sleep(150);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const jitters = times.slice(1).map((t, i) => Math.abs(t - times[i]));
  const jitter = jitters.reduce((a, b) => a + b, 0) / Math.max(1, jitters.length);
  const loss = Math.round((failures / samples) * 100);
  
  logEvent(`Latency: ${Math.round(avg)}ms, Jitter: ${Math.round(jitter)}ms`);
  return { avg, jitter, loss };
}

// Download test
async function runDownloadTest(durationMs = 10000) {
  setPhase('Download', 'Measuring download speed');
  logEvent('Starting download test');
  setGaugeTheme('download', 'normal');
  
  let bytes = 0;
  const start = performance.now();
  let lastUpdate = start;
  const testStart = start;
  
  while (performance.now() - start < durationMs) {
    const elapsed = performance.now() - start;
    const size = elapsed < durationMs / 2 ? 6 * 1024 * 1024 : 18 * 1024 * 1024;
    
    try {
      const response = await fetch(`/api/download?size=${size}&_=${Date.now()}`, { cache: 'no-store' });
      const reader = response.body.getReader();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        bytes += value.length;
        const now = performance.now();
        
        if (now - lastUpdate > 200) {
          const mbps = (bytes * 8) / 1e6 / ((now - start) / 1000);
          updateGauge(mbps, 500);
          dataTransferred.textContent = formatDataSize(bytes);
          durationValue.textContent = formatTime((now - start) / 1000);
          lastUpdate = now;
        }
      }
    } catch (e) {
      console.error('Download error:', e);
    }
  }
  
  const totalSeconds = (performance.now() - start) / 1000;
  const mbps = (bytes * 8) / 1e6 / totalSeconds;
  logEvent(`Download: ${formatMbps(mbps)} Mbps`);
  return { mbps, bytes, duration: totalSeconds };
}

// Upload test
function createUploadBlob(sizeMb) {
  const chunk = new Uint8Array(1024 * 256);
  const chunks = Array.from({ length: Math.ceil((sizeMb * 1024 * 1024) / chunk.length) }, () => chunk);
  return new Blob(chunks, { type: 'application/octet-stream' });
}

function runSingleUploadAttempt(sizeMb, options = {}) {
  const { timeoutMs = 0, onProgress = null } = options;
  const blob = createUploadBlob(sizeMb);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const start = performance.now();

    if (timeoutMs > 0) {
      xhr.timeout = timeoutMs;
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      if (typeof onProgress === 'function') {
        onProgress(event.loaded, blob.size);
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        const totalSeconds = Math.max((performance.now() - start) / 1000, 0.001);
        resolve({ bytes: blob.size, duration: totalSeconds });
      } else {
        reject({ status: xhr.status, message: xhr.responseText || 'Upload failed' });
      }
    };

    xhr.ontimeout = () => {
      reject({ status: 408, message: 'Upload attempt timed out' });
    };

    xhr.onerror = () => {
      reject({ status: 0, message: 'Network error during upload' });
    };

    xhr.open('POST', '/api/upload');
    xhr.send(blob);
  });
}

async function runUploadTest(durationMs = 10000, initialChunkMb = 2) {
  setPhase('Upload', 'Measuring upload speed');
  logEvent('Starting upload test');
  setGaugeTheme('upload', 'normal');

  const chunkSizesMb = [initialChunkMb, 1, 0.5, 0.25]
    .filter((value, index, array) => value > 0 && array.indexOf(value) === index)
    .sort((a, b) => b - a);

  let sizeIndex = 0;
  let totalUploadedBytes = 0;
  const testStart = performance.now();
  let lastError = null;

  while (performance.now() - testStart < durationMs) {
    const elapsedMs = performance.now() - testStart;
    const remainingMs = Math.max(durationMs - elapsedMs, 0);
    if (remainingMs <= 200) break;

    const attemptSize = chunkSizesMb[sizeIndex] || chunkSizesMb[chunkSizesMb.length - 1];

    try {
      const result = await runSingleUploadAttempt(attemptSize, {
        timeoutMs: Math.max(500, Math.floor(remainingMs)),
        onProgress: (loadedBytes) => {
          const now = performance.now();
          const seconds = Math.max((now - testStart) / 1000, 0.001);
          const uploadedSoFar = totalUploadedBytes + loadedBytes;
          const avgMbps = (uploadedSoFar * 8) / 1e6 / seconds;
          updateGauge(avgMbps, 200);
          dataTransferred.textContent = formatDataSize(uploadedSoFar);
          durationValue.textContent = formatTime(seconds);
        }
      });

      totalUploadedBytes += result.bytes;
    } catch (error) {
      lastError = error;
      if (error && error.status === 413) {
        if (sizeIndex < chunkSizesMb.length - 1) {
          logEvent(`Upload payload too large (${attemptSize} MB), reducing size`);
          sizeIndex += 1;
          continue;
        }
      }

      if (error && error.status === 408) {
        continue;
      }

      break;
    }
  }

  const totalSeconds = Math.max((performance.now() - testStart) / 1000, 0.001);
  if (totalUploadedBytes > 0) {
    const mbps = (totalUploadedBytes * 8) / 1e6 / totalSeconds;
    logEvent(`Upload avg: ${formatMbps(mbps)} Mbps`);
    return { mbps, bytes: totalUploadedBytes, duration: totalSeconds };
  }

  if (lastError && lastError.status === 413) {
    throw new Error('Upload failed: host upload size limit exceeded');
  }

  throw new Error('Upload failed');
}

// Main test function
async function runTest() {
  if (running) return;
  
  running = true;
  startBtn.disabled = true;
  eventLog.innerHTML = '';
  setGaugeTheme('idle', 'normal');
  resetRealtimeDiffChart();
  updateGauge(0);
  
  // Reset values
  pingValue.textContent = '--';
  jitterValue.textContent = '--';
  downloadValue.textContent = '--';
  uploadValue.textContent = '--';
  lossValue.textContent = '0';
  dataTransferred.textContent = '0 MB';
  durationValue.textContent = '0.0s';
  progressPercent.textContent = '0%';
  fetchNetworkInfo();
  
  try {
    setPhase('Preparing', 'Initializing speed test');
    logEvent('Speed test started');
    await sleep(500);
    
    // Ping test
    const ping = await runPingTest(10);
    pingValue.textContent = Math.round(ping.avg);
    jitterValue.textContent = Math.round(ping.jitter);
    lossValue.textContent = ping.loss;
    
    // Download test
    const download = await runDownloadTest(10000);
    lastDownloadMbps = download.mbps;
    updateUnitDisplay();
    updateGauge(download.mbps, 500);

    // Reset gauge before starting upload test
    await sleep(300);
    updateGauge(0, 500);
    await sleep(300);
    
    // Upload test
    const upload = await runUploadTest(10000, 2);
    lastUploadMbps = upload.mbps;
    updateUnitDisplay();
    updateGauge(upload.mbps, 200);

    // Reset gauge after upload test completes
    await sleep(300);
    updateGauge(0, 200);
    setGaugeTheme('idle', 'normal');
    
    // Completion
    setPhase('Complete', 'Test finished');
    logEvent('Speed test completed');
    fetchNetworkInfo();
    
    // Save to history
    const result = {
      timestamp: new Date().toLocaleString(),
      download: download.mbps,
      upload: upload.mbps,
      ping: ping.avg,
      jitter: ping.jitter,
      loss: ping.loss,
      connection: connectionType.textContent
    };
    saveToHistory(result);
    
  } catch (error) {
    console.error('Test error:', error);
    setPhase('Error', 'Test failed - please retry');
    logEvent('Test failed: ' + error.message);
  } finally {
    setGaugeTheme('idle', 'normal');
    running = false;
    startBtn.disabled = false;
  }
}

// History management
function saveToHistory(result) {
  testHistory.unshift(result);
  if (testHistory.length > 20) testHistory.pop();
  localStorage.setItem('speedTestHistory', JSON.stringify(testHistory));
  loadHistory();
  updateD3HistoryChart();
}

function loadHistory() {
  historyList.innerHTML = '';
  
  if (testHistory.length === 0) {
    historyList.innerHTML = '<div class="text-center text-slate-500 text-xs py-4">No tests yet</div>';
    return;
  }
  
  testHistory.slice(0, 5).forEach(result => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-all';
    item.innerHTML = `
      <div>
        <div class="text-sm font-semibold text-white">${formatMbps(result.download)} Mbps</div>
        <div class="text-xs text-slate-400">${new Date(result.timestamp).toLocaleDateString()}</div>
      </div>
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    `;
    item.onclick = () => showResultDetail(result);
    historyList.appendChild(item);
  });
}

function clearHistory() {
  if (confirm('Clear all test history?')) {
    testHistory = [];
    localStorage.removeItem('speedTestHistory');
    loadHistory();
    updateD3HistoryChart();
  }
}

// Modal functions
function showResultDetail(result) {
  const downloadDisplay = getAdaptiveSpeedFromMbps(result.download, useMetric);
  const uploadDisplay = getAdaptiveSpeedFromMbps(result.upload, useMetric);

  document.getElementById('resultTime').textContent = result.timestamp;
  document.getElementById('modalDownload').textContent = `${formatSpeedValue(downloadDisplay.value)} ${downloadDisplay.unit}`;
  document.getElementById('modalUpload').textContent = `${formatSpeedValue(uploadDisplay.value)} ${uploadDisplay.unit}`;
  document.getElementById('modalPing').textContent = Math.round(result.ping) + ' ms';
  document.getElementById('modalJitter').textContent = Math.round(result.jitter) + ' ms';
  document.getElementById('modalLoss').textContent = result.loss + '%';
  document.getElementById('modalConnection').textContent = result.connection;
  resultModal.classList.remove('hidden');
}

function closeResultModal() {
  resultModal.classList.add('hidden');
}

function showResults(e) {
  e.preventDefault();
  if (testHistory.length > 0) {
    showResultDetail(testHistory[0]);
  } else {
    alert('No test history yet. Run a test first!');
  }
}

function setUnit(unit) {
  if (unit === 'mbps') {
    useMetric = false;
    mbpsBtn.classList.add('bg-cyan-500', 'text-white');
    mbpsBtn.classList.remove('text-slate-300');
    mbsBtn.classList.remove('bg-cyan-500', 'text-white');
    mbsBtn.classList.add('text-slate-300');
  } else {
    useMetric = true;
    mbsBtn.classList.add('bg-cyan-500', 'text-white');
    mbsBtn.classList.remove('text-slate-300');
    mbpsBtn.classList.remove('bg-cyan-500', 'text-white');
    mbpsBtn.classList.add('text-slate-300');
  }
  updateUnitDisplay();
}

function updateUnitDisplay() {
  if (lastDownloadMbps > 0) {
    const display = getAdaptiveSpeedFromMbps(lastDownloadMbps, useMetric);
    downloadValue.textContent = formatSpeedValue(display.value);
    if (downloadUnitLabel) downloadUnitLabel.textContent = display.unit;
  }
  if (lastUploadMbps > 0) {
    const display = getAdaptiveSpeedFromMbps(lastUploadMbps, useMetric);
    uploadValue.textContent = formatSpeedValue(display.value);
    if (uploadUnitLabel) uploadUnitLabel.textContent = display.unit;
  }
}

function shareResult() {
  const result = testHistory[0];
  const downloadDisplay = getAdaptiveSpeedFromMbps(result.download, useMetric);
  const uploadDisplay = getAdaptiveSpeedFromMbps(result.upload, useMetric);
  const text = `I just tested my internet speed! Download: ${formatSpeedValue(downloadDisplay.value)} ${downloadDisplay.unit}, Upload: ${formatSpeedValue(uploadDisplay.value)} ${uploadDisplay.unit}, Ping: ${Math.round(result.ping)}ms`;
  if (navigator.share) {
    navigator.share({ title: 'SpeedTest Pro', text });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('Results copied to clipboard!');
    }).catch(() => {
      alert(text);
    });
  }
}

function downloadResult() {
  const result = testHistory[0];
  const downloadDisplay = getAdaptiveSpeedFromMbps(result.download, useMetric);
  const uploadDisplay = getAdaptiveSpeedFromMbps(result.upload, useMetric);
  const csv = `Speed Test Report\nDate,${result.timestamp}\nDownload,${formatSpeedValue(downloadDisplay.value)} ${downloadDisplay.unit}\nUpload,${formatSpeedValue(uploadDisplay.value)} ${uploadDisplay.unit}\nPing,${result.ping} ms\nJitter,${result.jitter} ms\nPacket Loss,${result.loss}%\nConnection,${result.connection}`;
  const blob = new Blob([csv], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speedtest-${Date.now()}.txt`;
  a.click();
}
