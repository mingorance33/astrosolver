const fetch = require('node-fetch');
const FormData = require('form-data');

const API_KEY = process.env.ASTROMETRY_API_KEY || "eevmnnvxnnnhuyhm";
const BASE_URL = "https://nova.astrometry.net/api";
const HEADERS = { "Referer": "https://nova.astrometry.net/api/login" };

// Conversión RA/Dec a Alt/Az
function eqToAltAz(raDeg, decDeg, latDeg, lonDeg, date) {
  const jd = (date.getTime() / 86400000.0) + 2440587.5;
  const d = jd - 2451545.0;
  const gmst = 280.46061837 + 360.98564736629 * d;
  const lst = (gmst + lonDeg) % 360.0;

  const haRad = ((lst - raDeg) % 360.0) * (Math.PI / 180);
  const decRad = decDeg * (Math.PI / 180);
  const latRad = latDeg * (Math.PI / 180);

  const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altRad = Math.asin(sinAlt);

  let cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) / (Math.cos(latRad) * Math.cos(altRad));
  cosAz = Math.max(-1.0, Math.min(1.0, cosAz));
  let azRad = Math.acos(cosAz);
  if (Math.sin(haRad) > 0) azRad = 2 * Math.PI - azRad;

  return {
    alt: altRad * (180 / Math.PI),
    az: azRad * (180 / Math.PI)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { imageBase64, targetRa, targetDec, lat, lon } = JSON.parse(event.body);

    // 1. Login
    const loginRes = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: `request-json=${encodeURIComponent(JSON.stringify({ apikey: API_KEY }))}`
    });
    const loginData = await loginRes.json();
    if (loginData.status !== "success") throw new Error("Fallo en login de Astrometry");
    const session = loginData.session;

    // 2. Upload imagen
    const buffer = Buffer.from(imageBase64.split(",")[1] || imageBase64, "base64");
    const form = new FormData();
    form.append("request-json", JSON.stringify({
      session,
      allow_commercial_use: "d",
      allow_modifications: "d",
      publicly_visible: "n"
    }));
    form.append("file", buffer, { filename: "sky.jpg", contentType: "image/jpeg" });

    const uploadRes = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: { ...HEADERS, ...form.getHeaders() },
      body: form
    });
    const uploadData = await uploadRes.json();
    if (uploadData.status !== "success") throw new Error("Fallo al subir imagen");
    const subId = uploadData.subid;

    // 3. Polling Job
    let jobId = null;
    let attempts = 0;
    while (!jobId && attempts < 25) {
      await new Promise(r => setTimeout(r, 2500));
      const subCheck = await fetch(`${BASE_URL}/submissions/${subId}`, { headers: HEADERS });
      const subJson = await subCheck.json();
      if (subJson.jobs && subJson.jobs[0]) jobId = subJson.jobs[0];
      attempts++;
    }
    if (!jobId) throw new Error("Tiempo de espera agotado buscando job");

    // 4. Polling Calibración
    let solved = false;
    attempts = 0;
    while (!solved && attempts < 25) {
      await new Promise(r => setTimeout(r, 2500));
      const jobCheck = await fetch(`${BASE_URL}/jobs/${jobId}`, { headers: HEADERS });
      const jobJson = await jobCheck.json();
      if (jobJson.status === "success") solved = true;
      if (jobJson.status === "failure") throw new Error("No se pudo resolver el campo estelar");
      attempts++;
    }

    const calibRes = await fetch(`${BASE_URL}/jobs/${jobId}/calibration/`, { headers: HEADERS });
    const calib = await calibRes.json();

    // 5. Cálculo de offsets Alt/Az
    const now = new Date();
    const currentAltAz = eqToAltAz(calib.ra, calib.dec, lat, lon, now);
    const targetAltAz = eqToAltAz(targetRa, targetDec, lat, lon, now);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solved: true,
        current: { ra: calib.ra, dec: calib.dec, ...currentAltAz },
        target: { ra: targetRa, dec: targetDec, ...targetAltAz },
        deltaAlt: targetAltAz.alt - currentAltAz.alt,
        deltaAz: targetAltAz.az - currentAltAz.az
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
