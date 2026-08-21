import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDeliveryChannels } from "../../public/features/setup-status.js";

test("setup status: email alone is enough for delivery channels ready", () => {
  const result = summarizeDeliveryChannels({
    email: "ready",
    pushover: "not_configured",
    webhook: "not_configured",
    browserPushDevices: "not_configured",
    deliveryChannels: { configured: 1, enabled: 1, ready: true }
  });
  assert.equal(result.state, "ready");
  assert.equal(result.text, "1 configured · 1 enabled");
});

test("setup status: configured but disabled channels report none enabled", () => {
  const result = summarizeDeliveryChannels({
    deliveryChannels: { configured: 2, enabled: 0, ready: false }
  });
  assert.equal(result.state, "partial");
  assert.equal(result.text, "2 configured · None enabled");
});

test("setup status: zero usable channels is informational not incomplete", () => {
  const result = summarizeDeliveryChannels({
    email: "not_configured",
    pushover: "not_configured",
    webhook: "not_configured",
    browserPushDevices: "not_configured",
    deliveryChannels: { configured: 0, enabled: 0, ready: false }
  });
  assert.equal(result.state, "partial");
  assert.equal(result.text, "None enabled");
});

test("setup status: browser push absent does not force incomplete when email is usable", () => {
  const result = summarizeDeliveryChannels({
    email: "ready",
    pushover: "ready",
    webhook: "not_configured",
    browserPushDevices: "not_configured",
    deliveryChannels: { configured: 2, enabled: 1, ready: true }
  });
  assert.equal(result.state, "ready");
  assert.match(result.text, /2 configured · 1 enabled/);
});

test("setup status: legacy payloads without deliveryChannels treat any ready channel as enough", () => {
  const result = summarizeDeliveryChannels({
    email: "ready",
    pushover: "not_configured",
    webhook: "not_configured",
    browserPushDevices: "not_configured"
  });
  assert.equal(result.state, "ready");
  assert.match(result.text, /1 configured/);
});
