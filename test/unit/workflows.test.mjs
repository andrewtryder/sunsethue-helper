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

test("production job order enforces validate, prepare, worker, pages, verify, release", () => {
  const production = workflow("production.yml");
  const jobs = production.jobs;

  assert.equal(jobs.validate.uses, "./.github/workflows/validate.yml");
  assert.deepEqual([].concat(jobs.prepare.needs), ["validate"]);
  assert.equal(jobs.migrate, undefined, "D1 migrations are not part of the pipeline");
  assert.deepEqual([].concat(jobs["deploy-worker"].needs), ["prepare"]);
  assert.ok([].concat(jobs["deploy-pages"].needs).includes("deploy-worker"));
  assert.ok([].concat(jobs.verify.needs).includes("deploy-pages"));
  assert.deepEqual([].concat(jobs.release.needs), ["verify"]);
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

test("every production job that touches Cloudflare uses the production environment", () => {
  const production = workflow("production.yml");
  const cloudflareJobs = ["prepare", "deploy-worker", "deploy-pages", "verify"];
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
