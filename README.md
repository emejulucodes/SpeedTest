# SpeedTest Pro

A full-stack internet speed test web app built with **Node.js + Express** (backend) and a rich **Tailwind + D3.js + Three.js** frontend.

The app measures:
- Latency (ping)
- Jitter
- Packet loss
- Download speed
- Upload speed

It also detects network context (IP, ISP, ASN/network, nearest test server), visualizes real-time test activity, and stores recent results in browser local storage.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser and click **Start Test**.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [API Endpoints](#api-endpoints)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Data & Privacy Notes](#data--privacy-notes)
- [Troubleshooting](#troubleshooting)
- [Performance Notes](#performance-notes)
- [Limitations](#limitations)
- [Future Improvements](#future-improvements)
- [License](#license)

## Overview
SpeedTest Pro is a browser-based speed testing application that runs a multi-phase test workflow:

1. **Latency phase**: Repeated requests to `/api/ping` estimate ping and jitter; failures count toward packet loss.
2. **Download phase**: Streaming binary payloads from `/api/download` over a fixed duration to estimate throughput.
3. **Upload phase**: Uploading a generated binary blob to `/api/upload` to estimate outbound speed.

The UI presents test metrics in a modern dashboard, includes a D3 gauge and trend charts, and displays network metadata from IP geolocation/ASN lookups.

## Features

### Core Test Features
- Multi-phase speed test orchestration (ping → download → upload).
- Live gauge animation with dynamic color themes based on current phase and speed band.
- Real-time speed-difference chart (delta between consecutive samples).
- Packet loss estimation from failed ping samples.
- Unit toggle support:
  - Bit-based: `bps`, `Kbps`, `Mbps`, `Gbps`
  - Byte-based: `B/s`, `KB/s`, `MB/s`, `GB/s`

### Network Intelligence
- Public/private IP handling and normalization.
- ISP + ASN/network resolution using:
  - `ipwho.is`
  - `api.bgpview.io`
- Nearest speed-test server selection by geodesic distance (Haversine formula).

### UX & Visualization
- Animated Three.js particle background.
- D3 circular gauge with needle transitions.
- D3 history chart for recent tests.
- Modal result view with share/download actions.
- Local history persistence (up to 20 entries, 5 displayed in sidebar).

## Tech Stack

### Backend
- Node.js
- Express `^4.18.2`
- Built-in `https` module for third-party lookups

### Frontend
- HTML/CSS/Vanilla JavaScript
- Tailwind CSS via CDN
- D3.js v7 via CDN
- Three.js r128 via CDN

## Project Structure

```text
SpeedTest/
├─ package.json
├─ package-lock.json
├─ server.js
└─ public/
   ├─ index.html
   ├─ app.js
   └─ styles.css
```

## How It Works

### 1) Backend (`server.js`)
- Serves static assets from `public/`.
- Exposes API endpoints for ping/download/upload/network info.
- Determines client IP using `x-forwarded-for` (first value) or socket IP.
- Calls IP intelligence providers with timeout-protected HTTPS requests.
- Picks nearest logical test server from a static region list.
- Falls back to `public/index.html` for unmatched routes.

### 2) Frontend (`public/app.js`)
- Initializes on `DOMContentLoaded`:
  - connection type detection,
  - network metadata fetch,
  - Three.js scene,
  - D3 gauge/realtime/history charts,
  - history loading.
- Runs tests sequentially with UI phase updates and event logging.
- Updates primary metric cards and gauge continuously.
- Saves test summaries into localStorage (`speedTestHistory`).

### 3) Styling (`public/index.html`, `public/styles.css`)
- Tailwind utility classes define layout/theme.
- Custom CSS adds scrollbar, glow effects, responsive gauge sizing, and animation polish.

## API Endpoints

### `GET /api/ping`
Returns current server timestamp.

**Response**
```json
{ "t": 1739790000000 }
```

### `GET /api/download?size=<bytes>`
Streams binary payload for throughput testing.

**Behavior**
- Min size: `1024` bytes
- Default size: `5MB`
- Max size: `100MB`
- Content type: `application/octet-stream`

### `POST /api/upload`
Accepts raw upload body and returns total bytes + elapsed server-side duration.

**Response**
```json
{ "bytes": 15728640, "durationMs": 1234.56 }
```

### `GET /api/network-info`
Returns resolved network metadata and selected server.

**Response shape**
```json
{
  "ip": "203.0.113.10",
  "isp": "Example ISP",
  "network": "AS12345 Example Network",
  "server": {
    "name": "West Africa - Lagos",
    "host": "lagos.speedtest.local",
    "location": "Lagos, NG",
    "distanceKm": 12.34
  }
}
```

## Getting Started

### Prerequisites
- Node.js 18+ recommended
- npm 9+ recommended
- Internet access (for external JS CDNs and IP intelligence APIs)

### Install
```bash
npm install
```

### Run
```bash
npm start
```

Server starts on:
- `http://localhost:3000` (default)
- or `http://localhost:<PORT>` if `PORT` is set

### Development mode
```bash
npm run dev
```
(Currently identical to `npm start`.)

## Configuration

### Environment Variables
- `PORT`: HTTP port for Express server.

Example (PowerShell):
```powershell
$env:PORT=8080
npm start
```

## Usage
1. Open the app in your browser.
2. Wait for connection/network metadata to populate.
3. Click **Start Test**.
4. Observe live metrics during:
   - Latency test
   - Download test
   - Upload test
5. Review result cards, charts, and history.
6. Use **Results** tab/modal to share or download summary.

## Data & Privacy Notes
- Test history is stored in browser local storage (`speedTestHistory`).
- The backend queries external services (`ipwho.is`, `bgpview`) using detected public IP when available.
- No database is used in this project.

## Troubleshooting

### App won’t start
- Ensure dependencies are installed: `npm install`.
- Verify Node.js version is modern (18+ recommended).
- Check if port is already in use; change `PORT`.

### Network info stays "Unavailable"
- External APIs may be unreachable, rate-limited, or blocked.
- Corporate VPN/proxy/private IP environments may limit geolocation/ASN accuracy.

### Speed values look unstable
- Browser load, background downloads, Wi-Fi variability, and ISP traffic shaping affect measurements.
- Try running tests multiple times and compare trends rather than one-off peaks.

### UI appears broken offline
- Tailwind/D3/Three are loaded via CDN in `index.html`; offline environments will need local bundling.

## Performance Notes
- Download throughput uses repeated streamed fetches and periodic UI updates (~200ms).
- Upload test uses `XMLHttpRequest` progress events for smoother sampling.
- Realtime difference chart keeps a rolling window of 60 points.

## Limitations
- This is not equivalent to enterprise-grade speed testing networks with globally distributed edge nodes.
- Server selection is logical/geographic from a static list, not actual distributed test infrastructure.
- External geolocation/ASN services are best-effort and may return incomplete data.
- No authentication, rate limiting, or abuse protection is implemented by default.

## Future Improvements
- Replace CDN scripts with bundled frontend assets.
- Add automated tests (API + UI).
- Add server-side observability and health checks.
- Add configurable server regions via environment/config file.
- Add Docker support and CI pipeline.

## License
No license file is currently defined in this repository.

If this project is intended for public use, add a `LICENSE` file (e.g., MIT) and update this section.
