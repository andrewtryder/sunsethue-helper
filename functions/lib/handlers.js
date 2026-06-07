const { isAuthorizedEmail, parseBearerToken } = require("./auth");

async function handleTriggerReport(req, res, deps) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const idToken = parseBearerToken(req.headers.authorization);
  if (!idToken) {
    res.status(401).json({ error: "Unauthorized: Missing auth header" });
    return;
  }

  try {
    const decodedToken = await deps.verifyIdToken(idToken);

    if (!isAuthorizedEmail(decodedToken.email)) {
      res.status(403).json({ error: "Forbidden: Unauthorized user account." });
      return;
    }

    await deps.runAndSendReport("Manual Test");
    res.status(200).json({ success: true, message: "Report processed and email sent." });
  } catch (error) {
    console.error("Error in triggerReport onRequest:", error);
    res.status(500).json({ error: error.message });
  }
}

async function handleSearchCoordinates(req, res, deps) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const idToken = parseBearerToken(req.headers.authorization);
  if (!idToken) {
    res.status(401).json({ error: "Unauthorized: Missing auth header" });
    return;
  }

  try {
    const decodedToken = await deps.verifyIdToken(idToken);

    if (!isAuthorizedEmail(decodedToken.email)) {
      res.status(403).json({ error: "Forbidden: Unauthorized user account." });
      return;
    }

    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: "Missing search query" });
      return;
    }

    console.log(`Nominatim search via proxy: "${query}"`);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const response = await deps.fetch(url, {
      headers: {
        "User-Agent": "SunsethueHelper/1.0 (owner@example.com)",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim API returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in searchCoordinates proxy:", error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleTriggerReport,
  handleSearchCoordinates
};
