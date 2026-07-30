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
    ["production.yml", "rollback.yml", "validate.yml", "zero-trust.yml"]
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
  assert.equal(production.concurrency.group, "sunsethue-production");
  assert.equal(production.concurrency["cancel-in-progress"], false);
  assert.deepEqual(production.permissions, { contents: "read" });
});

test("production job order enforces validate, migrate, worker, pages, verify, release", () => {
  const production = workflow("production.yml");
  const jobs = production.jobs;

  assert.equal(jobs.validate.uses, "./.github/workflows/validate.yml");
  assert.deepEqual([].concat(jobs.prepare.needs), ["validate"]);
  assert.deepEqual([].concat(jobs.migrate.needs), ["prepare"]);
  assert.ok([].concat(jobs["deploy-worker"].needs).includes("migrate"));
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
  const cloudflareJobs = ["prepare", "migrate", "deploy-worker", "deploy-pages", "verify"];
  for (const name of cloudflareJobs) {
    assert.equal(
      production.jobs[name].environment?.name,
      "production",
      `${name} must run in the production environment`
    );
  }
});

test("application deployment and Zero Trust administration use different tokens", () => {
  const production = workflows.find((entry) => entry.name === "production.yml").text;
  const rollback = workflows.find((entry) => entry.name === "rollback.yml").text;
  const zeroTrust = workflows.find((entry) => entry.name === "zero-trust.yml").text;

  for (const [name, text] of [
    ["production.yml", production],
    ["rollback.yml", rollback]
  ]) {
    assert.match(text, /secrets\.CLOUDFLARE_DEPLOY_API_TOKEN/, `${name} must use the deploy token`);
    assert.doesNotMatch(
      text,
      /secrets\.CLOUDFLARE_ZEROTRUST_API_TOKEN/,
      `${name} must not use the Zero Trust token`
    );
  }

  assert.match(zeroTrust, /secrets\.CLOUDFLARE_ZEROTRUST_API_TOKEN/);
  assert.doesNotMatch(zeroTrust, /secrets\.CLOUDFLARE_DEPLOY_API_TOKEN/);
});

test("the Zero Trust workflow is manual only and defaults to a read-only plan", () => {
  const zeroTrust = workflow("zero-trust.yml");
  assert.deepEqual(triggers(zeroTrust), ["workflow_dispatch"]);
  const action = zeroTrust.on.workflow_dispatch.inputs.action;
  assert.equal(action.default, "plan");
  assert.deepEqual(action.options, ["plan", "verify", "apply"]);
  assert.equal(zeroTrust.jobs["zero-trust"].environment.name, "production");
});

test("rollback is manual, requires a reason, and shares the production concurrency group", () => {
  const rollback = workflow("rollback.yml");
  assert.deepEqual(triggers(rollback), ["workflow_dispatch"]);
  const inputs = rollback.on.workflow_dispatch.inputs;
  assert.equal(inputs.reason.required, true);
  assert.deepEqual(inputs.target.options, ["both", "worker", "pages"]);
  assert.equal(rollback.concurrency.group, "sunsethue-production");
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
