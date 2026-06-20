const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function run() {
  const args = process.argv.slice(2);
  const isHelp = args.includes("--help") || args.includes("-h");
  const isRemote = args.includes("--remote");
  const serviceAccountArg = args.find(arg => arg.startsWith("--service-account="));
  const serviceAccountPath = serviceAccountArg ? serviceAccountArg.split("=")[1] : null;

  if (isHelp) {
    console.log(`
Firestore to Cloudflare D1 Database Migration Utility

Usage:
  node scripts/migrate-db.js [options]

Options:
  --remote                   Migrate to remote D1 instead of local D1 database.
  --service-account=<path>   Path to Google Service Account JSON file. If omitted,
                             the script will attempt to read from the local Firestore
                             emulator (http://127.0.0.1:8080).
  --help, -h                 Show this help.
    `);
    process.exit(0);
  }

  let locations = [];

  if (serviceAccountPath) {
    console.log(`🔑 Loading Service Account from: ${serviceAccountPath}`);
    const resolvedPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`❌ Service account file not found at: ${resolvedPath}`);
      process.exit(1);
    }

    let admin;
    try {
      // Try to require from backup directory first
      admin = require("../functions-firebase-backup/node_modules/firebase-admin");
    } catch (e) {
      try {
        admin = require("firebase-admin");
      } catch (err) {
        console.log("Installing firebase-admin temporary dependency...");
        execSync("npm install firebase-admin --no-save", { stdio: "inherit" });
        admin = require("firebase-admin");
      }
    }

    const serviceAccount = require(resolvedPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    const firestore = admin.firestore();
    console.log("📡 Fetching locations from production Firestore...");
    const snapshot = await firestore.collection("locations").get();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      locations.push({
        id: doc.id,
        name: data.name || "Unknown",
        latitude: data.latitude ?? 0,
        longitude: data.longitude ?? 0,
        latestSunriseTime: data.latestSunriseTime || null,
        latestSunriseQuality: data.latestSunriseQuality ?? null,
        latestSunriseText: data.latestSunriseText || null,
        latestSunsetTime: data.latestSunsetTime || null,
        latestSunsetQuality: data.latestSunsetQuality ?? null,
        latestSunsetText: data.latestSunsetText || null,
        lastForecastUpdate: data.lastForecastUpdate || null,
        forecastError: data.forecastError || null,
        createdAt: data.createdAt || Date.now()
      });
    });
  } else {
    console.log(`📡 Fetching locations from local Firestore emulator using Admin SDK...`);
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    
    let admin;
    try {
      // Try to require from backup directory first
      admin = require("../functions-firebase-backup/node_modules/firebase-admin");
    } catch (e) {
      try {
        admin = require("firebase-admin");
      } catch (err) {
        console.log("Installing firebase-admin temporary dependency...");
        execSync("npm install firebase-admin --no-save", { stdio: "inherit" });
        admin = require("firebase-admin");
      }
    }

    admin.initializeApp({
      projectId: "sunsethue-helper-12345"
    });

    try {
      const firestore = admin.firestore();
      const snapshot = await firestore.collection("locations").get();
      console.log(`Found ${snapshot.size} locations in local Firestore emulator.`);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        locations.push({
          id: doc.id,
          name: data.name || "Unknown",
          latitude: data.latitude ?? 0,
          longitude: data.longitude ?? 0,
          latestSunriseTime: data.latestSunriseTime || null,
          latestSunriseQuality: data.latestSunriseQuality ?? null,
          latestSunriseText: data.latestSunriseText || null,
          latestSunsetTime: data.latestSunsetTime || null,
          latestSunsetQuality: data.latestSunsetQuality ?? null,
          latestSunsetText: data.latestSunsetText || null,
          lastForecastUpdate: data.lastForecastUpdate || null,
          forecastError: data.forecastError || null,
          createdAt: data.createdAt || Date.now()
        });
      });
    } catch (e) {
      console.error(`❌ Failed to fetch from local Firestore emulator: ${e.message}`);
      process.exit(1);
    }
  }

  if (locations.length === 0) {
    console.log("⚠️ No locations to migrate.");
    process.exit(0);
  }

  console.log(`Preparing migration SQL for ${locations.length} locations...`);
  
  // Format inserts
  let sql = "";
  for (const loc of locations) {
    const sunriseTime = loc.latestSunriseTime ? `'${loc.latestSunriseTime}'` : "NULL";
    const sunriseQuality = loc.latestSunriseQuality !== null ? loc.latestSunriseQuality : "NULL";
    const sunriseText = loc.latestSunriseText ? `'${loc.latestSunriseText.replace(/'/g, "''")}'` : "NULL";
    const sunsetTime = loc.latestSunsetTime ?  `'${loc.latestSunsetTime}'` : "NULL";
    const sunsetQuality = loc.latestSunsetQuality !== null ? loc.latestSunsetQuality : "NULL";
    const sunsetText = loc.latestSunsetText ? `'${loc.latestSunsetText.replace(/'/g, "''")}'` : "NULL";
    const lastUpdate = loc.lastForecastUpdate !== null ? loc.lastForecastUpdate : "NULL";
    const errorText = loc.forecastError ? `'${loc.forecastError.replace(/'/g, "''")}'` : "NULL";

    sql += `INSERT OR REPLACE INTO locations (id, name, latitude, longitude, latestSunriseTime, latestSunriseQuality, latestSunriseText, latestSunsetTime, latestSunsetQuality, latestSunsetText, lastForecastUpdate, forecastError, createdAt) VALUES ('${loc.id}', '${loc.name.replace(/'/g, "''")}', ${loc.latitude}, ${loc.longitude}, ${sunriseTime}, ${sunriseQuality}, ${sunriseText}, ${sunsetTime}, ${sunsetQuality}, ${sunsetText}, ${lastUpdate}, ${errorText}, ${loc.createdAt});\n`;
  }

  const tempSqlFile = path.resolve("./migration_temp.sql");
  fs.writeFileSync(tempSqlFile, sql);
  console.log(`📝 Generated temporary migration SQL: ${tempSqlFile}`);

  const d1Target = isRemote ? "--remote" : "--local";
  console.log(`🚀 Executing migration on Cloudflare D1 (${d1Target})...`);
  
  try {
    execSync(`npx wrangler d1 execute sunsethue-db ${d1Target} --file=${tempSqlFile}`, { stdio: "inherit" });
    console.log("✅ D1 migration completed successfully!");
  } catch (err) {
    console.error("❌ Failed to execute migration SQL in D1:", err.message);
  } finally {
    try {
      fs.unlinkSync(tempSqlFile);
      console.log("🧹 Cleaned up temporary migration SQL file.");
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

run().catch(console.error);
