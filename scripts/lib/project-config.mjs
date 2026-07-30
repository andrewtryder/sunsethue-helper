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
  const d1Name = read("D1_DATABASE_NAME") || "sunsethue-db";
  const d1DatabaseId = read("D1_DATABASE_ID") || PLACEHOLDER_D1_ID;
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
    d1Name,
    d1DatabaseId,
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
export function resolveTemplateValues({ strict = false } = {}) {
  const project = resolveProject({ strict });
  return {
    PAGES_PROJECT_NAME: project.pagesProject,
    WORKER_NAME: project.workerName,
    D1_DATABASE_NAME: project.d1Name,
    D1_DATABASE_ID: project.d1DatabaseId,
    PRODUCTION_HOSTNAME: project.productionHostname
  };
}
