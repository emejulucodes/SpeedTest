const path = require("path");
const https = require("https");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", true);

app.use(express.static(path.join(__dirname, "public")));

const TEST_SERVERS = [
  {
    name: "West Africa - Lagos",
    host: "lagos.speedtest.local",
    location: "Lagos, NG",
    lat: 6.5244,
    lon: 3.3792
  },
  {
    name: "West Africa - Accra",
    host: "accra.speedtest.local",
    location: "Accra, GH",
    lat: 5.6037,
    lon: -0.1870
  },
  {
    name: "Europe - London",
    host: "london.speedtest.local",
    location: "London, UK",
    lat: 51.5074,
    lon: -0.1278
  },
  {
    name: "North America - New York",
    host: "newyork.speedtest.local",
    location: "New York, US",
    lat: 40.7128,
    lon: -74.0060
  },
  {
    name: "Asia - Singapore",
    host: "singapore.speedtest.local",
    location: "Singapore, SG",
    lat: 1.3521,
    lon: 103.8198
  }
];

function normalizeIp(ip) {
  if (!ip) return "";
  let value = String(ip).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  const bracketedIpv6Match = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6Match) {
    value = bracketedIpv6Match[1];
  }

  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
    value = value.split(":")[0];
  }

  if (value.startsWith("::ffff:")) {
    return value.slice(7);
  }

  return value;
}

function parseForwardedFor(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((part) => normalizeIp(part))
    .filter(Boolean);
}

function isPrivateIp(ip) {
  const value = normalizeIp(ip);
  const lower = value.toLowerCase();

  if (!value) return true;
  if (lower === "::1" || lower === "localhost") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;

  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  return false;
}

function fetchIpWhois(targetIp) {
  const endpoint = targetIp
    ? `https://ipwho.is/${encodeURIComponent(targetIp)}`
    : "https://ipwho.is/";

  return new Promise((resolve) => {
    const request = https.get(endpoint, (response) => {
      let body = "";

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          if (parsed && parsed.success !== false) {
            resolve(parsed);
            return;
          }
        } catch {
          // Ignore parse failures and fall through to resolve null.
        }
        resolve(null);
      });
    });

    request.on("error", () => resolve(null));
    request.setTimeout(2500, () => {
      request.destroy();
      resolve(null);
    });
  });
}

function fetchBgpView(targetIp) {
  if (!targetIp) return Promise.resolve(null);
  const endpoint = `https://api.bgpview.io/ip/${encodeURIComponent(targetIp)}`;

  return new Promise((resolve) => {
    const request = https.get(endpoint, (response) => {
      let body = "";

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          if (parsed && parsed.status === "ok") {
            resolve(parsed);
            return;
          }
        } catch {
          // Ignore parse failures and fall through to resolve null.
        }
        resolve(null);
      });
    });

    request.on("error", () => resolve(null));
    request.setTimeout(2500, () => {
      request.destroy();
      resolve(null);
    });
  });
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function pickNearestServer(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ...TEST_SERVERS[0], distanceKm: null };
  }

  let nearest = null;
  for (const server of TEST_SERVERS) {
    const distanceKm = calculateDistanceKm(lat, lon, server.lat, server.lon);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { ...server, distanceKm };
    }
  }

  return nearest || { ...TEST_SERVERS[0], distanceKm: null };
}

function getClientIp(req) {
  const headerSources = [
    { key: "x-vercel-forwarded-for", multi: true },
    { key: "x-real-ip", multi: false },
    { key: "cf-connecting-ip", multi: false },
    { key: "fly-client-ip", multi: false },
    { key: "true-client-ip", multi: false },
    { key: "x-client-ip", multi: false },
    { key: "x-forwarded-for", multi: true }
  ];

  const candidates = [];

  for (const source of headerSources) {
    const rawValue = req.headers[source.key];
    if (!rawValue) continue;

    const ips = source.multi
      ? parseForwardedFor(rawValue)
      : [normalizeIp(rawValue)].filter(Boolean);

    for (const ip of ips) {
      candidates.push({ source: source.key, ip });
    }
  }

  const reqIp = normalizeIp(req.ip || "");
  const socketIp = normalizeIp(req.socket?.remoteAddress || "");

  if (reqIp) {
    candidates.push({ source: "req.ip", ip: reqIp });
  }
  if (socketIp) {
    candidates.push({ source: "req.socket.remoteAddress", ip: socketIp });
  }

  const publicCandidate = candidates.find((candidate) => !isPrivateIp(candidate.ip));
  const selected = publicCandidate || candidates[0] || null;

  return {
    ip: selected?.ip || "",
    source: selected?.source || null,
    candidates
  };
}

app.get("/api/ping", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ t: Date.now() });
});

app.get("/api/download", (req, res) => {
  const size = Math.max(1024, Math.min(parseInt(req.query.size, 10) || 5 * 1024 * 1024, 100 * 1024 * 1024));
  const chunkSize = 64 * 1024;
  res.set("Content-Type", "application/octet-stream");
  res.set("Cache-Control", "no-store");
  res.set("Content-Length", String(size));

  let sent = 0;
  function write() {
    while (sent < size) {
      const remaining = size - sent;
      const current = Math.min(chunkSize, remaining);
      const ok = res.write(Buffer.alloc(current));
      sent += current;
      if (!ok) {
        res.once("drain", write);
        return;
      }
    }
    res.end();
  }
  write();
});

app.post("/api/upload", (req, res) => {
  res.set("Cache-Control", "no-store");
  let bytes = 0;
  const start = process.hrtime.bigint();

  req.on("data", (chunk) => {
    bytes += chunk.length;
  });
  req.on("end", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    res.json({ bytes, durationMs });
  });
  req.on("error", () => {
    res.status(500).json({ error: "upload_failed" });
  });
});

app.get("/api/network-info", async (req, res) => {
  res.set("Cache-Control", "no-store");

  const client = getClientIp(req);
  const clientIp = client.ip;
  const overrideIp = normalizeIp(req.query.clientIp || "");
  const overrideIsValid = overrideIp && !isPrivateIp(overrideIp);
  const lookupIp = overrideIsValid ? overrideIp : (clientIp && !isPrivateIp(clientIp) ? clientIp : "");
  const ipInfo = await fetchIpWhois(lookupIp);
  const bgpLookupIp = ipInfo?.ip && !isPrivateIp(ipInfo.ip) ? ipInfo.ip : lookupIp;
  const bgpInfo = await fetchBgpView(bgpLookupIp);

  const geoLat = Number.isFinite(ipInfo?.latitude) ? ipInfo.latitude : null;
  const geoLon = Number.isFinite(ipInfo?.longitude) ? ipInfo.longitude : null;
  const selectedServer = pickNearestServer(geoLat, geoLon);

  const resolvedIp = ipInfo?.ip || clientIp || "Unavailable";
  const resolvedIsp =
    ipInfo?.connection?.isp ||
    ipInfo?.connection?.org ||
    ipInfo?.org ||
    "Unavailable";

  const ipWhoisAsn = ipInfo?.connection?.asn || null;
  const ipWhoisOrg = ipInfo?.connection?.org || ipInfo?.connection?.isp || null;
  const bgpAsn = bgpInfo?.data?.prefixes?.[0]?.asn?.asn || bgpInfo?.data?.asn?.asn || null;
  const bgpAsnName =
    bgpInfo?.data?.prefixes?.[0]?.asn?.name ||
    bgpInfo?.data?.asn?.name ||
    null;
  const resolvedAsn = ipWhoisAsn || bgpAsn || null;
  const resolvedAsnName = ipWhoisOrg || bgpAsnName || null;
  const network = resolvedAsn ? `AS${resolvedAsn}${resolvedAsnName ? ` ${resolvedAsnName}` : ""}` : "Unavailable";

  const debugPayload = {
    clientIpSource: overrideIsValid ? "query.clientIp" : client.source,
    clientIpSeen: clientIp || null,
    overrideIp: overrideIp || null,
    overrideUsed: Boolean(overrideIsValid),
    lookupIp: lookupIp || null,
    resolvedIp,
    headers: {
      xVercelForwardedFor: req.headers["x-vercel-forwarded-for"] || null,
      xRealIp: req.headers["x-real-ip"] || null,
      xForwardedFor: req.headers["x-forwarded-for"] || null
    }
  };

  if (req.query.debug === "1") {
    debugPayload.candidates = client.candidates;
  }

  res.json({
    ip: resolvedIp,
    isp: resolvedIsp,
    network,
    server: {
      name: selectedServer.name,
      host: selectedServer.host,
      location: selectedServer.location,
      distanceKm: selectedServer.distanceKm
    },
    debug: debugPayload
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
