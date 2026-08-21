import test from "node:test";
import assert from "node:assert/strict";
import { auditWorkflow, auditWorkflows } from "../../scripts/check-workflows.mjs";

const { findings, workflows } = await auditWorkflows();

function workflow(name) {
  const found = workflows.find((entry) => entry.name === name);
  assert.ok(found, `expected workflow ${name} to exist`);
  return found.doc;
}

function triggers(doc) {
  const on = doc.on ?? doc.true;
  return typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys(on);
}

test("every workflow passes the repository security policy", () => {
  assert.deepEqual(
    findings.map((finding) => `${finding.workflow}: [${finding.rule}] ${finding.message}`),
    []
  );
});

test("the expected workflow set is present", () => {
  assert.deepEqual(
    workflows.map((entry) => entry.name).sort(),
    ["production.yml", "publish-demo.yml", "rollback.yml", "security.yml", "validate.yml"]
  );
});

test("no workflow grants write permissions to pull request events", () => {
  for (const entry of workflows) {
    if (!triggers(entry.doc).includes("pull_request")) continue;
    const scopes = Object.values(entry.doc.permissions ?? {});
    assert.ok(
      scopes.every((scope) => scope === "read" || scope === "none"),
      `${entry.name} must stay read-only on pull requests`
    );
  }
});

test("validation is triggered by pull requests and reusable by the pipeline", () => {
  const validate = workflow("validate.yml");
  assert.deepEqual(triggers(validate).sort(), ["pull_request", "workflow_call"]);
  assert.deepEqual(validate.permissions, { contents: "read" });
  assert.equal(validate.concurrency["cancel-in-progress"], true);
});

test("production deploys on main pushes and manual dispatch, serialized and never cancelled", () => {
  const production = workflow("production.yml");
  assert.deepEqual(triggers(production).sort(), ["push", "workflow_dispatch"]);
  assert.deepEqual(production.on.push.branches, ["main"]);
  assert.equal(production.concurrency.group, "production-deploy");
  assert.equal(production.concurrency["cancel-in-progress"], false);
  assert.deepEqual(production.permissions, { contents: "read" });
});

test("production job order enforces validate, prepare, schema, worker, pages, verify, release", () => {
  const production = workflow("production.yml");
  const jobs = production.jobs;

  assert.equal(jobs.validate.uses, "./.github/workflows/validate.yml");
  assert.deepEqual([].concat(jobs.prepare.needs), ["validate"]);
  assert.equal(jobs.migrate, undefined, "versioned D1 migrations are not a separate pipeline job");
  assert.deepEqual([].concat(jobs.schema.needs), ["prepare"]);
  assert.deepEqual([].concat(jobs["deploy-worker"].needs).sort(), ["prepare", "schema"]);
  assert.ok([].concat(jobs["deploy-pages"].needs).includes("deploy-worker"));
  assert.ok([].concat(jobs.verify.needs).includes("deploy-pages"));
  assert.deepEqual([].concat(jobs.release.needs), ["verify"]);
});

test("the schema job applies and verifies D1 schema before Worker deploy", () => {
  const production = workflow("production.yml");
  const schemaSteps = production.jobs.schema.steps.map((step) => step.name);
  const applyIdx = schemaSteps.indexOf("Apply D1 schema");
  const verifyIdx = schemaSteps.indexOf("Verify required D1 columns");

  assert.ok(applyIdx >= 0, "Apply D1 schema step must exist in the schema job");
  assert.ok(verifyIdx >= 0, "Verify required D1 columns step must exist in the schema job");
  assert.ok(applyIdx < verifyIdx, "schema apply must run before column verify");
  assert.equal(production.jobs.schema.steps[applyIdx].run, "npm run db:schema:remote");
  assert.equal(production.jobs.schema.steps[verifyIdx].run, "npm run db:schema:verify");

  const workerSteps = production.jobs["deploy-worker"].steps.map((step) => step.name);
  assert.equal(
    workerSteps.indexOf("Apply D1 schema"),
    -1,
    "deploy-worker must not apply schema (moved to the schema job)"
  );
  assert.equal(
    workerSteps.indexOf("Verify required D1 columns"),
    -1,
    "deploy-worker must not verify schema (moved to the schema job)"
  );
});

test("schema and deploy-worker are skipped on dry-run dispatch", () => {
  const production = workflow("production.yml");
  assert.equal(
    production.jobs.schema.if,
    "${{ inputs.dry_run != true }}",
    "schema must be skipped on dry-run"
  );
  assert.equal(
    production.jobs["deploy-worker"].if,
    "${{ inputs.dry_run != true }}",
    "deploy-worker must be skipped on dry-run"
  );
});

test("a failed schema job blocks Worker deployment by dependency", () => {
  const production = workflow("production.yml");
  // GitHub Actions skips a downstream job when any `needs` entry fails or is
  // skipped. deploy-worker needs schema, so a failed apply/verify prevents
  // Worker deploy without any extra guard.
  assert.ok(
    [].concat(production.jobs["deploy-worker"].needs).includes("schema"),
    "deploy-worker must depend on the schema job"
  );
});

test("only the release job holds write permissions, and only what Release Please needs", () => {
  const production = workflow("production.yml");
  for (const [name, job] of Object.entries(production.jobs)) {
    if (name === "release") continue;
    assert.equal(job.permissions, undefined, `${name} must inherit the read-only default`);
  }
  assert.deepEqual(production.jobs.release.permissions, {
    contents: "write",
    "pull-requests": "write"
  });
  assert.equal(production.jobs.release.concurrency.group, "sunsethue-release");
});

test("every Generate Wrangler configuration step passes WEB_PUSH_* vars from production environment", () => {
  const production = workflow("production.yml");
  const configSteps = [];
  for (const [jobName, job] of Object.entries(production.jobs)) {
    for (const step of job.steps || []) {
      if (step.run === "npm run config:generate:strict") {
        configSteps.push({ jobName, env: step.env });
      }
    }
  }
  assert.ok(configSteps.length > 0, "expected at least one config-generation step");
  for (const { jobName, env } of configSteps) {
    assert.equal(
      env?.WEB_PUSH_VAPID_PUBLIC_KEY,
      "${{ vars.WEB_PUSH_VAPID_PUBLIC_KEY }}",
      `${jobName} config-generation must pass WEB_PUSH_VAPID_PUBLIC_KEY`
    );
    assert.equal(
      env?.WEB_PUSH_SUBJECT,
      "${{ vars.WEB_PUSH_SUBJECT }}",
      `${jobName} config-generation must pass WEB_PUSH_SUBJECT`
    );
  }
});

test("every production job that touches Cloudflare uses the production environment", () => {
  const production = workflow("production.yml");
  const cloudflareJobs = ["prepare", "schema", "deploy-worker", "deploy-pages", "verify"];
  for (const name of cloudflareJobs) {
    assert.equal(
      production.jobs[name].environment?.name,
      "production",
      `${name} must run in the production environment`
    );
  }
});

test("every Cloudflare-touching workflow uses the single CLOUDFLARE_API_TOKEN", () => {
  for (const entry of workflows) {
    if (entry.name === "validate.yml" || entry.name === "security.yml" || entry.name === "publish-demo.yml") {
      assert.doesNotMatch(entry.text, /secrets\.CLOUDFLARE_/);
      continue;
    }
    assert.match(
      entry.text,
      /secrets\.CLOUDFLARE_API_TOKEN/,
      `${entry.name} must use CLOUDFLARE_API_TOKEN`
    );
    assert.doesNotMatch(entry.text, /CLOUDFLARE_DEPLOY_API_TOKEN/);
    assert.doesNotMatch(entry.text, /CLOUDFLARE_ZEROTRUST_API_TOKEN/);
  }
});

test("security audit is scheduled or manual, read-only, and secret-free", () => {
  const security = workflow("security.yml");
  const securityEntry = workflows.find((entry) => entry.name === "security.yml");
  assert.ok(securityEntry);

  assert.deepEqual(triggers(security).sort(), ["schedule", "workflow_dispatch"]);
  assert.deepEqual(security.permissions, { contents: "read" });
  assert.equal(security.concurrency.group, "security-audit");

  for (const [name, job] of Object.entries(security.jobs)) {
    assert.equal(job.environment, undefined, `${name} must not use a deployment environment`);
  }

  const secretRefs = [...securityEntry.text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(
    secretRefs.filter((name) => name !== "GITHUB_TOKEN"),
    [],
    "security.yml must not read production secrets"
  );

  assert.match(securityEntry.text, /gitleaks\/gitleaks@sha256:[0-9a-f]{64}/);
  assert.match(securityEntry.text, /trufflesecurity\/trufflehog@sha256:[0-9a-f]{64}/);
  assert.match(securityEntry.text, /npm run audit:release -- --ci/);
});

test("rollback is manual, requires a reason, and shares the production concurrency group", () => {
  const rollback = workflow("rollback.yml");
  assert.deepEqual(triggers(rollback), ["workflow_dispatch"]);
  const inputs = rollback.on.workflow_dispatch.inputs;
  assert.equal(inputs.reason.required, true);
  assert.deepEqual(inputs.target.options, ["both", "worker", "pages"]);
  assert.equal(rollback.concurrency.group, "production-deploy");
  assert.equal(rollback.concurrency["cancel-in-progress"], false);
  assert.deepEqual(rollback.permissions, { contents: "read" });
});

test("no workflow reads a production secret on a pull request event", () => {
  for (const entry of workflows) {
    if (!triggers(entry.doc).includes("pull_request")) continue;
    const secrets = [...entry.text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
    assert.deepEqual(
      secrets.filter((name) => name !== "GITHUB_TOKEN"),
      [],
      `${entry.name} must not read production secrets`
    );
  }
});

// The checker itself is load-bearing, so its rules are tested against synthetic inputs.
function audit(doc, text = "") {
  return auditWorkflow({ name: "synthetic.yml", doc, text }).map((finding) => finding.rule);
}

test("the checker rejects an unpinned action", () => {
  const rules = audit({
    on: { push: null },
    permissions: { contents: "read" },
    jobs: {
      build: {
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 5,
        steps: [{ uses: "actions/checkout@v4", with: { "persist-credentials": false } }]
      }
    }
  });
  assert.ok(rules.includes("unpinned-action"));
});

test("the checker accepts a full SHA pin and a docker digest pin", () => {
  const sha = "a".repeat(40);
  const digest = "b".repeat(64);
  const rules = audit({
    on: { push: null },
    permissions: { contents: "read" },
    jobs: {
      build: {
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 5,
        steps: [
          { uses: `actions/checkout@${sha}`, with: { "persist-credentials": false } },
          { uses: `docker://rhysd/actionlint@sha256:${digest}` }
        ]
      }
    }
  });
  assert.equal(rules.includes("unpinned-action"), false);
});

test("the checker rejects pull_request_target", () => {
  const rules = audit({
    on: { pull_request_target: null },
    permissions: { contents: "read" },
    jobs: { build: { "runs-on": "ubuntu-latest", "timeout-minutes": 5, steps: [{ run: "true" }] } }
  });
  assert.ok(rules.includes("pull-request-target"));
});

test("the checker rejects write permissions on a pull request workflow", () => {
  const rules = audit({
    on: { pull_request: null },
    permissions: { contents: "write" },
    jobs: { build: { "runs-on": "ubuntu-latest", "timeout-minutes": 5, steps: [{ run: "true" }] } }
  });
  assert.ok(rules.includes("write-enabled-pr-workflow"));
});

test("the checker rejects a secret read from a pull request workflow", () => {
  const rules = audit(
    {
      on: { pull_request: null },
      permissions: { contents: "read" },
      jobs: { build: { "runs-on": "ubuntu-latest", "timeout-minutes": 5, steps: [{ run: "true" }] } }
    },
    "run: deploy --token ${{ secrets.CLOUDFLARE_API_TOKEN }}"
  );
  assert.ok(rules.includes("secret-in-pr-workflow"));
});

test("the checker rejects interpolating an untrusted expression into a shell script", () => {
  const rules = audit({
    on: { pull_request: null },
    permissions: { contents: "read" },
    jobs: {
      build: {
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 5,
        steps: [{ run: 'echo "${{ github.event.pull_request.title }}"' }]
      }
    }
  });
  assert.ok(rules.includes("untrusted-interpolation"));
});

test("the checker rejects a persisted checkout token and a missing timeout", () => {
  const rules = audit({
    on: { push: null },
    permissions: { contents: "read" },
    jobs: {
      build: {
        "runs-on": "ubuntu-latest",
        steps: [{ uses: `actions/checkout@${"a".repeat(40)}` }]
      }
    }
  });
  assert.ok(rules.includes("persisted-credentials"));
  assert.ok(rules.includes("missing-timeout"));
});

test("the checker rejects a deployment workflow without concurrency", () => {
  const rules = audit({
    on: { push: null },
    permissions: { contents: "read" },
    jobs: {
      deploy: {
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 5,
        environment: { name: "production" },
        steps: [{ run: "true" }]
      }
    }
  });
  assert.ok(rules.includes("missing-concurrency"));
});

test("the checker rejects missing permissions and structural mistakes", () => {
  const rules = audit({
    on: { push: null },
    jobs: {
      broken: { "timeout-minutes": 5, needs: "ghost", steps: [{ run: "true", uses: "x" }] }
    }
  });
  assert.ok(rules.includes("missing-permissions"));
  assert.ok(rules.includes("invalid-workflow"));
});

test("the checker rejects unbalanced GitHub expressions", () => {
  const rules = audit(
    {
      on: { push: null },
      permissions: { contents: "read" },
      jobs: { build: { "runs-on": "ubuntu-latest", "timeout-minutes": 5, steps: [{ run: "true" }] } }
    },
    "name: ${{ github.ref"
  );
  assert.ok(rules.includes("invalid-workflow"));
});
