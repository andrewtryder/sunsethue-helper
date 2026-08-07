import { chromium } from "@playwright/test";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use("/sunsethue-helper", express.static(path.join(__dirname, "dist/demo")));
app.use((req, res) => {
  console.log("SERVER 404:", req.url);
  res.status(404).send("Not found");
});

const server = app.listen(8080, async () => {
  console.log("Server listening");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on("console", msg => console.log("PAGE CONSOLE:", msg.type(), msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));
  
  await page.goto("http://localhost:8080/sunsethue-helper/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000); // wait longer
  
  await browser.close();
  server.close();
});
