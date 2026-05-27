# Sunsethue Helper Implementation Plan: Local Git Hooks & Frontend Testing

We will add a lightweight frontend test suite (verifying critical HTML structures, CSS files, and JS assets) and set up a local Git `pre-commit` hook. This hook will prevent you from committing code if either the frontend checks or the backend unit tests fail. We will also integrate these checks into your GitHub Actions CI pipeline.

---

## 1. Frontend Test Script

We will create a zero-dependency, fast Node.js script at `scripts/test-frontend.js` using the native Node.js test runner.

### [NEW] [test-frontend.js](file:///Users/atr/code/sunsethue-helper/scripts/test-frontend.js)
This script will:
*   Load and parse `public/index.html` to verify all required UI selectors and IDs exist (e.g. `auth-container`, `app-container`, `forecast-table-body`, `logs-list-container`, `pane-main`, `pane-locations`, `pane-logs`).
*   Confirm that `public/style.css` exists, compiles, and contains the required tab styles.
*   Confirm that `public/app.js` contains the dynamic script assets.
*   Ensure that all asset files are present and not empty.

---

## 2. Git Pre-Commit Hook & Installer

We will create a pre-commit script that runs automatically whenever you execute `git commit`.

### [NEW] [pre-commit.sh](file:///Users/atr/code/sunsethue-helper/scripts/pre-commit.sh)
A shell script that:
1. Runs the frontend test: `node scripts/test-frontend.js`
2. Runs the backend unit tests: `npm test --prefix functions`
3. Aborts the commit (exits with code 1) if any test fails, giving you instant local feedback.

### [NEW] [setup-git-hooks.sh](file:///Users/atr/code/sunsethue-helper/scripts/setup-git-hooks.sh)
An installer script that:
- Copies `scripts/pre-commit.sh` into your local `.git/hooks/pre-commit`.
- Makes the hook executable (`chmod +x .git/hooks/pre-commit`).

---

## 3. GitHub Actions CI Integration

We will modify `.github/workflows/firebase-deploy.yml` to include the frontend test suite.

### [MODIFY] [.github/workflows/firebase-deploy.yml](file:///Users/atr/code/sunsethue-helper/.github/workflows/firebase-deploy.yml)
- Add a new step to run the frontend test: `node scripts/test-frontend.js` before executing the backend tests and deployments.

---

## 4. Verification Plan

### Local Verification
1. Run `node scripts/setup-git-hooks.sh` to install the pre-commit hook.
2. Run `node scripts/test-frontend.js` directly to verify it passes.
3. Run `npm test --prefix functions` directly to verify it passes.
4. Make a temporary syntax error (e.g. rename an ID in `public/index.html` or break a backend test) and try to run `git commit`. Verify that the commit is blocked with a clear test failure output.
5. Fix the error, commit, and push. Verify that the GitHub Actions run succeeds.
