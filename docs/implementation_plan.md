# Sunsethue Helper Implementation Plan: Git & GitHub Actions CI/CD

We will set up local Git tracking for the repository and configure **GitHub Actions** to automatically deploy the web app (Hosting and Cloud Functions) to Firebase whenever you push changes to the `main` branch.

---

## 1. Local Git Initialization
We will run the following commands to initialize and prepare the repository:
1. Initialize local repository: `git init`
2. Change the default branch name to main: `git checkout -b main`
3. Stage all files (verifying that `.gitignore` correctly excludes `.env` and node modules): `git add .`
4. Commit the initial workspace state: `git commit -m "Initial commit: Sunsethue Helper full stack"`

---

## 2. GitHub Actions Deployment Workflow

We will create a GitHub Action file at `.github/workflows/firebase-deploy.yml` that triggers on push to the `main` branch.

### [NEW] [.github/workflows/firebase-deploy.yml](file:///Users/atr/code/sunsethue-helper/.github/workflows/firebase-deploy.yml)

The workflow will perform the following steps:
1.  **Check out repository** using `actions/checkout@v4`.
2.  **Set up Node.js 22** using `actions/setup-node@v4` (to match our upgraded function runtime environment).
3.  **Install dependencies**:
    - Install functions dependencies: `npm ci --prefix functions`
4.  **Run backend unit tests**:
    - Run the native node test runner: `npm test --prefix functions`
5.  **Deploy to Firebase** using the official Firebase GitHub Action (`w9jds/firebase-action@v2.2.0`) targeting both `hosting` and `functions` using your stored GitHub Secret token.

```yaml
name: Deploy to Firebase on Push

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Functions Dependencies
        run: npm ci --prefix functions

      - name: Run Backend Unit Tests
        run: npm test --prefix functions

      - name: Deploy to Firebase
        uses: w9jds/firebase-action@v2.2.0
        with:
          args: deploy
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

---

## 3. User Actions Required (GitHub Configuration)

To complete the link between your computer, GitHub, and Firebase, you will need to perform the following steps on GitHub:

1.  **Create a New GitHub Repository**:
    - Go to [GitHub New Repository](https://github.com/new).
    - Name it (e.g. `sunsethue-helper`) and keep it **Private** (recommended since your code contains custom logic).
    - Do NOT initialize with a README, gitignore, or license.
2.  **Link and Push Your Code**:
    - After we configure git locally, you can run the following commands in your host terminal to push the code (replacing with your repository URL):
      ```bash
      git remote add origin https://github.com/YOUR_GITHUB_USERNAME/sunsethue-helper.git
      git push -u origin main
      ```
3.  **Add Firebase Credentials to GitHub Secrets**:
    - Go to your repository page on GitHub.
    - Click **Settings > Secrets and variables > Actions**.
    - Click **New repository secret**.
    - Name the secret: `FIREBASE_TOKEN`
    - Paste your Firebase CI token in the value field:
      `1//05PWPykLs62vECgYIARAAGAUSNwF-L9Ir-zVfTF0zeblBhHWLtk7ODDmPxfWHzDzIDeEGv_o9rA9VM-e52_LW5dcyXQxjGNja6wo`
    - Click **Add secret**.
