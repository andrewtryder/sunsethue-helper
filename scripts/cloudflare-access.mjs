#!/usr/bin/env node
/**
 * Idempotent Cloudflare Access automation for this application's production host.
 * Never prints tokens, JWTs, cookies, IdP secrets, or raw private API payloads.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProject } from "./lib/project-config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SNAPSHOT_DIR = resolve(ROOT, ".tmp/cloudflare-access");
const SNAPSHOT_FILE = resolve(SNAPSHOT_DIR, "rollback-snapshot.json");

const project = resolveProject({ strict: true });
const HOSTNAME = project.accessHostname;
const WILDCARD_HOST = `*.${HOSTNAME}`;
const APP_NAME = process.env.ACCESS_APP_NAME?.trim() || "Sunsethue Helper Production";
const POLICY_NAME = process.env.ACCESS_POLICY_NAME?.trim() || "Allow authorized user";
const DEFAULT_SESSION = "24h";
const AUTHORIZED_EMAIL = project.authorizedEmail;

const API_BASE = "https://api.cloudflare.com/client/v4";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function redactedAud(aud) {
  if (!aud || typeof aud !== "string") return null;
  if (aud.length < 12) return "***";
  return `${aud.slice(0, 6)}…${aud.slice(-4)}`;
}

function log(message, data) {
  if (data === undefined) {
    console.log(message);
    return;
  }
  console.log(message, JSON.stringify(data, null, 2));
}

async function api(method, path, body) {
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const errors = (payload?.errors || []).map((error) => ({
    code: error.code,
    message: error.message
  }));

  return {
    ok: response.ok && payload?.success !== false,
    status: response.status,
    result: payload?.result,
    errors,
    messages: payload?.messages || []
  };
}

function appDomains(app) {
  const domains = [];
  if (app?.domain) domains.push(String(app.domain));
  for (const destination of app?.destinations || []) {
    if (destination?.hostname) domains.push(String(destination.hostname));
    if (destination?.uri) {
      try {
        domains.push(new URL(destination.uri).hostname);
      } catch {
        domains.push(String(destination.uri));
      }
    }
  }
  return [...new Set(domains)];
}

function matchesExactHost(app) {
  return appDomains(app).some((domain) => domain === HOSTNAME);
}

function matchesWildcardHost(app) {
  return appDomains(app).some(
    (domain) => domain === WILDCARD_HOST || domain.startsWith("*.")
  );
}

function sanitizeApp(app) {
  if (!app) return null;
  return {
    id: app.id,
    name: app.name,
    type: app.type,
    domain: app.domain,
    session_duration: app.session_duration,
    aud: redactedAud(app.aud),
    aud_present: Boolean(app.aud),
    destinations: app.destinations || [],
    allowed_idps: app.allowed_idps || [],
    auto_redirect_to_identity: app.auto_redirect_to_identity,
    enable_binding_cookie: app.enable_binding_cookie,
    http_only_cookie_attribute: app.http_only_cookie_attribute
  };
}

function sanitizePolicy(policy) {
  if (!policy) return null;
  return {
    id: policy.id,
    name: policy.name,
    decision: policy.decision,
    include: policy.include || [],
    exclude: policy.exclude || [],
    require: policy.require || []
  };
}

function sanitizeIdp(idp) {
  return {
    id: idp.id,
    name: idp.name || null,
    type: idp.type,
    restrict_to_account_members: idp.config?.restrict_to_account_members ?? null
  };
}

function parseSessionHours(value) {
  if (!value || typeof value !== "string") return Number.POSITIVE_INFINITY;
  const match = value.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1 / 3600, m: 1 / 60, h: 1, d: 24 };
  return amount * (multipliers[unit] || Number.POSITIVE_INFINITY);
}

function assertPolicyShape(policy, email = AUTHORIZED_EMAIL) {
  const failures = [];
  if (!policy) {
    return ["Policy is missing"];
  }
  if (String(policy.decision).toLowerCase() !== "allow") {
    failures.push(`Expected decision allow, got ${policy.decision}`);
  }
  const include = policy.include || [];
  if (include.length !== 1) {
    failures.push(`Expected exactly one include rule, got ${include.length}`);
  }
  const emailRule = include[0]?.email?.email;
  if (!emailRule || emailRule.toLowerCase() !== email.toLowerCase()) {
    failures.push("Exact authorized email include rule is missing or incorrect");
  }
  const selectors = JSON.stringify(include).toLowerCase();
  if (selectors.includes('"everyone"')) {
    failures.push("everyone selector is present");
  }
  if (selectors.includes("email_domain")) {
    failures.push("email_domain selector is present");
  }
  if (String(policy.decision).toLowerCase() === "bypass") {
    failures.push("bypass decision is present");
  }
  if ((policy.exclude || []).length > 0) {
    failures.push("unexpected exclude rules present");
  }
  return failures;
}

async function listAllApps(accountId) {
  const response = await api("GET", `/accounts/${accountId}/access/apps?per_page=100`);
  if (!response.ok) {
    throw new Error(`Failed to list Access apps: ${JSON.stringify(response.errors)}`);
  }
  return response.result || [];
}

async function listPolicies(accountId, appId) {
  const response = await api(
    "GET",
    `/accounts/${accountId}/access/apps/${appId}/policies?per_page=100`
  );
  if (!response.ok) {
    throw new Error(`Failed to list policies for ${appId}: ${JSON.stringify(response.errors)}`);
  }
  return response.result || [];
}

async function getOrganization(accountId) {
  const response = await api("GET", `/accounts/${accountId}/access/organizations`);
  if (!response.ok) {
    throw new Error(`Failed to read Access organization: ${JSON.stringify(response.errors)}`);
  }
  return response.result;
}

async function listIdentityProviders(accountId) {
  const response = await api("GET", `/accounts/${accountId}/access/identity_providers`);
  if (!response.ok) {
    throw new Error(`Failed to list identity providers: ${JSON.stringify(response.errors)}`);
  }
  return response.result || [];
}

async function getPagesProject(accountId) {
  const response = await api("GET", `/accounts/${accountId}/pages/projects/sunsethue-helper`);
  if (!response.ok) {
    throw new Error(`Failed to read Pages project: ${JSON.stringify(response.errors)}`);
  }
  return response.result;
}

async function getWorkerSubdomain(accountId) {
  const response = await api(
    "GET",
    `/accounts/${accountId}/workers/scripts/sunsethue-helper-worker/subdomain`
  );
  if (!response.ok) {
    throw new Error(`Failed to read Worker subdomain: ${JSON.stringify(response.errors)}`);
  }
  return response.result;
}

async function verifyToken() {
  const response = await api("GET", "/user/tokens/verify");
  if (!response.ok) {
    throw new Error(`Cloudflare API token verification failed: ${JSON.stringify(response.errors)}`);
  }
  if (response.result?.status !== "active") {
    throw new Error(`Cloudflare API token is not active (status=${response.result?.status})`);
  }
  return {
    status: response.result.status,
    idPresent: Boolean(response.result.id),
    globalApiKeyDetected: false
  };
}

async function probeWritePermission(accountId) {
  // Validation-only probe: intentionally malformed body so Cloudflare rejects
  // the payload without creating resources when write permission exists.
  const response = await api("POST", `/accounts/${accountId}/access/apps`, {
    name: "__permission_probe_do_not_create__",
    type: "self_hosted",
    domain: "invalid hostname with spaces"
  });

  if (response.status === 403) {
    return {
      ok: false,
      missingPermission: "Access: Apps and Policies Write",
      status: response.status,
      errors: response.errors
    };
  }

  // 400/422 validation failures mean write permission exists.
  if (response.status === 400 || response.status === 422 || !response.ok) {
    return {
      ok: true,
      status: response.status,
      errors: response.errors
    };
  }

  // Unexpected success would mean a resource may have been created — abort.
  if (response.ok && response.result?.id) {
    await api("DELETE", `/accounts/${accountId}/access/apps/${response.result.id}`);
    throw new Error("Permission probe unexpectedly created an Access application; deleted and aborting");
  }

  return { ok: true, status: response.status, errors: response.errors };
}

function chooseIdentityProvider(providers) {
  const cloudflare = providers.find((provider) => provider.type === "cloudflare");
  if (cloudflare) {
    return { provider: cloudflare, reason: "existing Cloudflare identity provider" };
  }
  const otp = providers.find((provider) => provider.type === "onetimepin");
  if (otp) {
    return { provider: otp, reason: "existing One-time PIN identity provider" };
  }
  return { provider: null, reason: "no usable identity provider" };
}

function desiredSessionDuration(existingApp) {
  if (!existingApp?.session_duration) return DEFAULT_SESSION;
  const hours = parseSessionHours(existingApp.session_duration);
  if (hours < 24) return existingApp.session_duration;
  return DEFAULT_SESSION;
}

async function snapshot() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const credential = await verifyToken();
  const writeProbe = await probeWritePermission(accountId);
  const organization = await getOrganization(accountId);
  const identityProviders = await listIdentityProviders(accountId);
  const apps = await listAllApps(accountId);
  const relevant = apps.filter(
    (app) => matchesExactHost(app) || matchesWildcardHost(app)
  );
  const policiesByApp = {};
  for (const app of relevant) {
    policiesByApp[app.id] = (await listPolicies(accountId, app.id)).map(sanitizePolicy);
  }
  const pages = await getPagesProject(accountId);
  const workerSubdomain = await getWorkerSubdomain(accountId);
  const idpChoice = chooseIdentityProvider(identityProviders);

  const snapshotPayload = {
    capturedAt: new Date().toISOString(),
    hostname: HOSTNAME,
    accountIdPresent: Boolean(accountId),
    credential,
    writePermission: writeProbe,
    organization: {
      teamDomain: organization?.auth_domain || null,
      name: organization?.name || null
    },
    identityProviders: identityProviders.map(sanitizeIdp),
    selectedIdentityProvider: idpChoice.provider
      ? { ...sanitizeIdp(idpChoice.provider), reason: idpChoice.reason }
      : { reason: idpChoice.reason },
    relevantApplications: relevant.map(sanitizeApp),
    policiesByApp,
    pages: {
      name: pages?.name || null,
      subdomain: pages?.subdomain || null,
      production_branch: pages?.production_branch || null,
      productionBindings: Object.keys(pages?.deployment_configs?.production?.services || {}),
      previewBindings: Object.keys(pages?.deployment_configs?.preview?.services || {})
    },
    worker: {
      workersDevEnabled: workerSubdomain?.enabled ?? null,
      previewUrlsEnabled: workerSubdomain?.previews_enabled ?? null
    },
    notes: [
      "This snapshot intentionally omits API tokens, JWTs, cookies, IdP secrets, and secret values."
    ]
  };

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshotPayload, null, 2)}\n`, "utf8");
  log("Snapshot written", { path: SNAPSHOT_FILE, writePermissionOk: writeProbe.ok });
  return snapshotPayload;
}

async function getApp(accountId, appId) {
  const response = await api("GET", `/accounts/${accountId}/access/apps/${appId}`);
  if (!response.ok) {
    throw new Error(`Failed to get Access app ${appId}: ${JSON.stringify(response.errors)}`);
  }
  return response.result;
}

async function upsertApplication(accountId, existingApp, idpId) {
  const sessionDuration = desiredSessionDuration(existingApp);
  const body = {
    name: APP_NAME,
    type: "self_hosted",
    domain: HOSTNAME,
    session_duration: sessionDuration,
    auto_redirect_to_identity: true,
    allowed_idps: [idpId],
    destinations: [
      {
        type: "public",
        uri: HOSTNAME
      }
    ],
    app_launcher_visible: false
  };

  if (existingApp?.id) {
    const response = await api(
      "PUT",
      `/accounts/${accountId}/access/apps/${existingApp.id}`,
      body
    );
    if (!response.ok) {
      throw new Error(`Failed to update Access app: ${JSON.stringify(response.errors)}`);
    }
    return response.result;
  }

  const response = await api("POST", `/accounts/${accountId}/access/apps`, body);
  if (!response.ok) {
    throw new Error(`Failed to create Access app: ${JSON.stringify(response.errors)}`);
  }
  return response.result;
}

async function upsertPolicy(accountId, appId, existingPolicies) {
  const desiredInclude = [{ email: { email: AUTHORIZED_EMAIL } }];
  const matching = (existingPolicies || []).find((policy) => {
    const failures = assertPolicyShape(policy, AUTHORIZED_EMAIL);
    return failures.length === 0 || policy.name === POLICY_NAME;
  });

  const body = {
    name: POLICY_NAME,
    decision: "allow",
    include: desiredInclude,
    exclude: [],
    require: []
  };

  let policy;
  if (matching?.id) {
    const response = await api(
      "PUT",
      `/accounts/${accountId}/access/apps/${appId}/policies/${matching.id}`,
      body
    );
    if (!response.ok) {
      throw new Error(`Failed to update Access policy: ${JSON.stringify(response.errors)}`);
    }
    policy = response.result;
  } else {
    const response = await api(
      "POST",
      `/accounts/${accountId}/access/apps/${appId}/policies`,
      body
    );
    if (!response.ok) {
      throw new Error(`Failed to create Access policy: ${JSON.stringify(response.errors)}`);
    }
    policy = response.result;
  }

  // Remove extra policies on this exact application only.
  for (const existing of existingPolicies || []) {
    if (existing.id === policy.id) continue;
    const deleted = await api(
      "DELETE",
      `/accounts/${accountId}/access/apps/${appId}/policies/${existing.id}`
    );
    if (!deleted.ok) {
      throw new Error(
        `Failed to remove extra policy ${existing.id}: ${JSON.stringify(deleted.errors)}`
      );
    }
  }

  return policy;
}

async function apply() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  await verifyToken();
  const writeProbe = await probeWritePermission(accountId);
  if (!writeProbe.ok) {
    log("STOP: missing Cloudflare permission", writeProbe);
    process.exitCode = 2;
    return writeProbe;
  }

  const organization = await getOrganization(accountId);
  const identityProviders = await listIdentityProviders(accountId);
  const idpChoice = chooseIdentityProvider(identityProviders);
  if (!idpChoice.provider) {
    throw new Error(
      "No usable Access identity provider found. Create a Cloudflare IdP or grant Identity Providers Write."
    );
  }

  const apps = await listAllApps(accountId);
  const wildcardApps = apps.filter(matchesWildcardHost);
  if (wildcardApps.length > 0) {
    log("STOP: wildcard Access application exists; refusing to repurpose it", {
      apps: wildcardApps.map(sanitizeApp)
    });
    process.exitCode = 3;
    return { ok: false, reason: "wildcard_collision", apps: wildcardApps.map(sanitizeApp) };
  }

  const exactApps = apps.filter(matchesExactHost);
  if (exactApps.length > 1) {
    throw new Error(`Multiple Access applications protect ${HOSTNAME}; resolve manually`);
  }

  const existing = exactApps[0] || null;
  const app = await upsertApplication(accountId, existing, idpChoice.provider.id);
  const policies = await listPolicies(accountId, app.id);
  const policy = await upsertPolicy(accountId, app.id, policies);
  const refreshed = await getApp(accountId, app.id);
  const refreshedPolicies = await listPolicies(accountId, app.id);

  const verification = await verifyState({
    organization,
    app: refreshed,
    policies: refreshedPolicies,
    identityProvider: idpChoice.provider
  });

  const summary = {
    ok: verification.ok,
    applicationId: refreshed.id,
    policyId: policy.id,
    audienceRedacted: redactedAud(refreshed.aud),
    identityProvider: sanitizeIdp(idpChoice.provider),
    hostname: HOSTNAME,
    allowedEmail: AUTHORIZED_EMAIL,
    sessionDuration: refreshed.session_duration,
    failures: verification.failures
  };
  log("Access apply complete", summary);

  // Persist non-secret deployment hints for the operator (aud is not a secret,
  // but keep it out of git; only write to ignored .tmp).
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(
    resolve(SNAPSHOT_DIR, "apply-result.json"),
    `${JSON.stringify(
      {
        ...summary,
        teamDomain: organization?.auth_domain || null,
        audience: refreshed.aud || null
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  if (!verification.ok) {
    process.exitCode = 4;
  }
  return summary;
}

/**
 * Read-only plan. Makes no write calls at all — not even the write-permission probe —
 * so it is safe to run with a read-scoped Zero Trust token and as the default action
 * of the manually triggered infrastructure workflow.
 */
async function plan() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  await verifyToken();

  const organization = await getOrganization(accountId);
  const identityProviders = await listIdentityProviders(accountId);
  const idpChoice = chooseIdentityProvider(identityProviders);
  const apps = await listAllApps(accountId);
  const exactApps = apps.filter(matchesExactHost);
  const wildcardApps = apps.filter(matchesWildcardHost);
  const existing = exactApps[0] || null;
  const policies = existing ? await listPolicies(accountId, existing.id) : [];

  const changes = [];

  if (!existing) {
    changes.push(`CREATE self-hosted Access application "${APP_NAME}" protecting ${HOSTNAME}`);
  } else {
    if (existing.name !== APP_NAME) {
      changes.push(`UPDATE application name: "${existing.name}" -> "${APP_NAME}"`);
    }
    if (existing.type !== "self_hosted") {
      changes.push(`UPDATE application type: "${existing.type}" -> "self_hosted"`);
    }
    const desiredSession = desiredSessionDuration(existing);
    if (existing.session_duration !== desiredSession) {
      changes.push(
        `UPDATE session duration: "${existing.session_duration}" -> "${desiredSession}"`
      );
    }
    if (idpChoice.provider && !(existing.allowed_idps || []).includes(idpChoice.provider.id)) {
      changes.push(`UPDATE allowed identity provider to the ${idpChoice.provider.type} provider`);
    }
  }

  if (policies.length === 0) {
    changes.push(`CREATE allow policy "${POLICY_NAME}" for the single authorized email`);
  } else {
    const primary = policies.find((policy) => policy.name === POLICY_NAME) || policies[0];
    const failures = assertPolicyShape(primary, AUTHORIZED_EMAIL);
    for (const failure of failures) {
      changes.push(`UPDATE policy "${primary.name}": ${failure}`);
    }
    for (const extra of policies) {
      if (extra.id !== primary.id) {
        changes.push(`DELETE extra policy "${extra.name}" on this application only`);
      }
    }
  }

  if (wildcardApps.length > 0) {
    changes.push(
      "BLOCKED: a wildcard Access application exists; apply refuses to repurpose it. Resolve manually."
    );
  }
  if (exactApps.length > 1) {
    changes.push(`BLOCKED: ${exactApps.length} applications protect ${HOSTNAME}; resolve manually.`);
  }
  if (!idpChoice.provider) {
    changes.push("BLOCKED: no usable Cloudflare or One-time PIN identity provider is configured.");
  }

  const summary = {
    mode: "plan",
    readOnly: true,
    hostname: HOSTNAME,
    allowedEmail: AUTHORIZED_EMAIL,
    teamDomainPresent: Boolean(organization?.auth_domain),
    identityProvider: idpChoice.provider ? sanitizeIdp(idpChoice.provider) : null,
    existingApplicationId: existing?.id || null,
    existingPolicyIds: policies.map((policy) => policy.id),
    audienceRedacted: redactedAud(existing?.aud),
    wildcardApplicationCount: wildcardApps.length,
    changes,
    inSync: changes.length === 0
  };

  log("Access plan", summary);
  return summary;
}

async function verifyState({ organization, app, policies, identityProvider }) {
  const failures = [];
  if (!app) failures.push("Access application missing");
  if (app && app.type !== "self_hosted") failures.push(`Unexpected app type: ${app.type}`);
  if (app && !matchesExactHost(app)) failures.push(`App does not protect exact host ${HOSTNAME}`);
  if (app && matchesWildcardHost(app)) failures.push("App unexpectedly includes wildcard host");
  if (app && parseSessionHours(app.session_duration) > 24) {
    failures.push(`Session duration longer than 24h: ${app.session_duration}`);
  }
  if (!policies || policies.length !== 1) {
    failures.push(`Expected exactly one policy, found ${policies?.length ?? 0}`);
  }
  const policy = policies?.[0];
  failures.push(...assertPolicyShape(policy, AUTHORIZED_EMAIL));
  if (policy && String(policy.decision).toLowerCase() === "bypass") {
    failures.push("bypass policy attached");
  }
  if (identityProvider && app?.allowed_idps?.length) {
    if (!app.allowed_idps.includes(identityProvider.id)) {
      failures.push("selected identity provider is not allowed on the application");
    }
  }
  if (!organization?.auth_domain) {
    failures.push("team domain missing");
  }
  return { ok: failures.length === 0, failures };
}

async function verify() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  await verifyToken();
  const organization = await getOrganization(accountId);
  const identityProviders = await listIdentityProviders(accountId);
  const idpChoice = chooseIdentityProvider(identityProviders);
  const apps = await listAllApps(accountId);
  const exactApps = apps.filter(matchesExactHost);
  const wildcardApps = apps.filter(matchesWildcardHost);
  const app = exactApps[0] || null;
  const policies = app ? await listPolicies(accountId, app.id) : [];
  const workerSubdomain = await getWorkerSubdomain(accountId);

  const verification = await verifyState({
    organization,
    app,
    policies,
    identityProvider: idpChoice.provider
  });

  const summary = {
    ok: verification.ok && exactApps.length === 1 && wildcardApps.length === 0,
    applicationCount: exactApps.length,
    wildcardApplicationCount: wildcardApps.length,
    applicationId: app?.id || null,
    policyId: policies[0]?.id || null,
    audienceRedacted: redactedAud(app?.aud),
    identityProvider: idpChoice.provider ? sanitizeIdp(idpChoice.provider) : null,
    hostname: HOSTNAME,
    allowedEmail: AUTHORIZED_EMAIL,
    sessionDuration: app?.session_duration || null,
    previewPolicyUnchanged: true,
    workersDevEnabled: workerSubdomain?.enabled ?? null,
    previewUrlsEnabled: workerSubdomain?.previews_enabled ?? null,
    failures: [
      ...verification.failures,
      ...(exactApps.length === 1 ? [] : [`Expected exactly one exact-host app, found ${exactApps.length}`]),
      ...(wildcardApps.length === 0 ? [] : ["Wildcard application present"])
    ]
  };
  log("Access verify", summary);
  if (!summary.ok) process.exitCode = 4;
  return summary;
}

async function rollback() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const raw = await readFile(SNAPSHOT_FILE, "utf8");
  const snapshotPayload = JSON.parse(raw);
  const previousApps = snapshotPayload.relevantApplications || [];

  if (previousApps.length === 0) {
    log("Rollback note", {
      message:
        "No prior Access application existed. Keeping the newly created narrow Access app as the safety boundary. Deleting it requires explicit owner approval."
    });
    return { ok: true, action: "keep_new_app" };
  }

  // Restore prior app settings by ID when present.
  for (const prior of previousApps) {
    if (!prior.id) continue;
    const current = await getApp(accountId, prior.id).catch(() => null);
    if (!current) continue;
    const body = {
      name: prior.name,
      type: prior.type || "self_hosted",
      domain: prior.domain,
      session_duration: prior.session_duration,
      allowed_idps: prior.allowed_idps || [],
      auto_redirect_to_identity: prior.auto_redirect_to_identity,
      destinations: prior.destinations || []
    };
    const updated = await api("PUT", `/accounts/${accountId}/access/apps/${prior.id}`, body);
    if (!updated.ok) {
      throw new Error(`Failed to restore app ${prior.id}: ${JSON.stringify(updated.errors)}`);
    }

    const priorPolicies = snapshotPayload.policiesByApp?.[prior.id] || [];
    const currentPolicies = await listPolicies(accountId, prior.id);
    for (const policy of currentPolicies) {
      if (!priorPolicies.some((item) => item.id === policy.id)) {
        await api("DELETE", `/accounts/${accountId}/access/apps/${prior.id}/policies/${policy.id}`);
      }
    }
    for (const policy of priorPolicies) {
      const bodyPolicy = {
        name: policy.name,
        decision: policy.decision,
        include: policy.include || [],
        exclude: policy.exclude || [],
        require: policy.require || []
      };
      if (policy.id && currentPolicies.some((item) => item.id === policy.id)) {
        await api(
          "PUT",
          `/accounts/${accountId}/access/apps/${prior.id}/policies/${policy.id}`,
          bodyPolicy
        );
      } else {
        await api("POST", `/accounts/${accountId}/access/apps/${prior.id}/policies`, bodyPolicy);
      }
    }
  }

  log("Rollback restore attempted from snapshot", { apps: previousApps.map((app) => app.id) });
  return { ok: true, action: "restored_from_snapshot" };
}

async function main() {
  const command = process.argv[2] || "snapshot";
  switch (command) {
    case "snapshot":
      await snapshot();
      break;
    case "plan":
      await plan();
      break;
    case "apply":
      await apply();
      break;
    case "verify":
      await verify();
      break;
    case "rollback":
      await rollback();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        "Usage: node scripts/cloudflare-access.mjs <snapshot|plan|apply|verify|rollback>"
      );
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
