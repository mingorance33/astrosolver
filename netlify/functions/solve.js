const fetch = require('node-fetch');
const FormData = require('form-data');

const API_KEY = process.env.ASTROMETRY_API_KEY || "eevmnnvxnnnhuyhm";
const BASE_URL = "https://nova.astrometry.net/api";
const HEADERS = { "Referer": "https://nova.astrometry.net/api/login" };

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

  return { alt: altRad * (180 / Math.PI), az: azRad * (180 / Math.PI) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método no permitido" };

  try {
    const payload = JSON.parse(event.body);

    // PASO 1: Subida inicial de la imagen
    if (payload.action === "upload") {
      const { imageBase64 } = payload;
      
      // Login
      const loginRes = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
        body: `request-json=${encodeURIComponent(JSON.stringify({ apikey: API_KEY }))}`
      });
      const loginData = await loginRes.json();
      if (loginData.status !== "success") throw new Error("Fallo en login con Astrometry");
      const session = loginData.session;

      // Subir archivo
      const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      const buffer = Buffer.from(cleanBase64, "base64");
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
      if (uploadData.status !== "success") throw new Error("Fallo al subir a Astrometry");

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "uploaded", subid: uploadData.subid })
      };
    }

    // PASO 2: Comprobación de estado y calibración
    if (payload.action === "check") {
      const { subid, targetRa, targetDec, lat, lon } = payload;

      // Consultar submission
      const subRes = await fetch(`${BASE_URL}/submissions/${subid}`, { headers: HEADERS });
      const subData = await subRes.json();
      const jobs = subData.jobs || [];

      if (!jobs.length || jobs[0] === null) {
        return { statusCode: 200, body: JSON.stringify({ status: "processing", msg: "Asignando trabajo..." }) };
      }

      const jobId = jobs[0];
      const jobRes = await fetch(`${BASE_URL}/jobs/${jobId}`, { headers: HEADERS });
      const jobData = await jobRes.json();

      if (jobData.status === "processing" || jobData.status === "solving") {
        return { statusCode: 200, body: JSON.stringify({ status: "processing", msg: "Identificando estrellas..." }) };
      }

      if (jobData.status === "failure") {
        return { statusCode: 200, body: JSON.stringify({ status: "failure", error: "No se encontraron suficientes estrellas" }) };
      }

      if (jobData.status === "success") {
        const calibRes = await fetch(`${BASE_URL}/jobs/${jobId}/calibration/`, { headers: HEADERS });
        const calib = await calibRes.json();

        const now = new Date();
        const currentAltAz = eqToAltAz(calib.ra, calib.dec, lat, lon, now);
        const targetAltAz = eqToAltAz(targetRa, targetDec, lat, lon, now);

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "success",
            current: { ra: calib.ra, dec: calib.dec, ...currentAltAz },
            target: { ra: targetRa, dec: targetDec, ...targetAltAz },
            deltaAlt: targetAltAz.alt - currentAltAz.alt,
            deltaAz: targetAltAz.az - currentAltAz.az
          })
        };
      }
    }

    throw new Error("Acción desconocida");
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
