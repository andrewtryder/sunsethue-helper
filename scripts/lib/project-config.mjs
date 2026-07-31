/**
 * Instance-specific project configuration.
 *
 * Non-strict mode supplies placeholder defaults so local CI and tests work on a
 * fresh clone. Strict mode (deploy, verify, rollback, Access) fails closed when
 * required variables are missing, naming only the variable — never its value.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

let envLoaded = false;

export function loadLocalEnv() {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile(resolve(ROOT, ".env"));
  } catch {
    // .env is optional; GitHub Actions and explicit env vars take precedence.
  }
}

const PLACEHOLDER_D1_ID = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_STORE_ID = "00000000000000000000000000000000";
const PLACEHOLDER_ACCOUNT_ID = "00000000000000000000000000000000";

/** Environment variables that must be set when resolveProject({ strict: true }). */
export const STRICT_REQUIRED = [
  "PAGES_PROJECT_NAME",
  "WORKER_NAME",
  "D1_DATABASE_NAME",
  "D1_DATABASE_ID",
  "PRODUCTION_HOSTNAME",
  "AUTHORIZED_EMAIL",
  "DEPLOY_REPOSITORY"
];

/** Additional vars required for production Wrangler generation with Secrets Store. */
export const STRICT_SECRETS_STORE_REQUIRED = [
  "SECRETS_STORE_ID",
  "CREDENTIAL_ADMIN_WORKER_NAME",
  "CLOUDFLARE_ACCOUNT_ID"
];
function read(name) {
  const value = process.env[name];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * @returns {string[]} names of unset required variables (never values)
 */
export function missingRequired(names = STRICT_REQUIRED) {
  loadLocalEnv();
  return names.filter((name) => !read(name));
}

/**
 * @param {{ strict?: boolean }} [options]
 */
export function resolveProject({ strict = false } = {}) {
  loadLocalEnv();

  if (strict) {
    const missing = missingRequired();
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`
      );
    }
  }

  const pagesProject = read("PAGES_PROJECT_NAME") || "sunsethue-helper";
  const workerName = read("WORKER_NAME") || "sunsethue-helper-worker";
  const credentialAdminWorkerName =
    read("CREDENTIAL_ADMIN_WORKER_NAME") || "sunsethue-helper-credential-admin";
  const d1Name = read("D1_DATABASE_NAME") || "sunsethue-db";
  const d1DatabaseId = read("D1_DATABASE_ID") || PLACEHOLDER_D1_ID;
  const secretsStoreId = read("SECRETS_STORE_ID") || PLACEHOLDER_STORE_ID;
  const cloudflareAccountId = read("CLOUDFLARE_ACCOUNT_ID") || PLACEHOLDER_ACCOUNT_ID;
  const productionHostname = read("PRODUCTION_HOSTNAME") || `${pagesProject}.pages.dev`;
  const accessHostname = read("ACCESS_HOSTNAME") || productionHostname;
  const authorizedEmail = (read("AUTHORIZED_EMAIL") || "owner@example.com").toLowerCase();
  const contactEmail = (read("CONTACT_EMAIL") || authorizedEmail).toLowerCase();
  const deployRepository = read("DEPLOY_REPOSITORY") || null;
  const productionBranch = read("PRODUCTION_BRANCH") || "main";
  const productionUrl = read("PRODUCTION_URL") || `https://${productionHostname}`;

  return {
    pagesProject,
    workerName,
    credentialAdminWorkerName,
    d1Name,
    d1DatabaseId,
    secretsStoreId,
    cloudflareAccountId,
    productionHostname,
    accessHostname,
    authorizedEmail,
    contactEmail,
    deployRepository,
    productionBranch,
    productionUrl,
    d1Binding: "DB"
  };
}

/** Token map used to render Wrangler templates. */
export function resolveTemplateValues({ strict = false, requireSecretsStore = false } = {}) {
  const project = resolveProject({ strict });
  if (strict && requireSecretsStore) {
    const missing = missingRequired(STRICT_SECRETS_STORE_REQUIRED);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`
      );
    }
  }
  return {
    PAGES_PROJECT_NAME: project.pagesProject,
    WORKER_NAME: project.workerName,
    CREDENTIAL_ADMIN_WORKER_NAME: project.credentialAdminWorkerName,
    D1_DATABASE_NAME: project.d1Name,
    D1_DATABASE_ID: project.d1DatabaseId,
    SECRETS_STORE_ID: project.secretsStoreId,
    CLOUDFLARE_ACCOUNT_ID: project.cloudflareAccountId,
    PRODUCTION_HOSTNAME: project.productionHostname
  };
}
