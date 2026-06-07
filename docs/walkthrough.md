# Sunsethue Helper Walkthrough: Git & GitHub Actions CI/CD Setup

We have initialized local version control using Git and created a custom **GitHub Actions automated deployment workflow**. Now, every push you make to your remote `main` branch will run backend unit tests and deploy your files directly to Firebase.

---

## 🛠️ Completed Tasks

1.  **Git Initialization**:
    - Initialized local Git tracking inside the repository.
    - Set the default branch to `main`.
    - Made the initial commit containing your code files.
    - Verified that node modules and secret `.env` files are completely ignored.
2.  **CI/CD Workflow Configured**:
    - Created the workflow folder at `.github/workflows/`.
    - Wrote the workflow logic at [.github/workflows/firebase-deploy.yml](file:///Users/atr/code/sunsethue-helper/.github/workflows/firebase-deploy.yml).

---

## 🚀 Final Steps to Link GitHub and Activate CI/CD

To push the codebase to your own GitHub account and link the deployment runner, follow these simple steps:

### Step 1: Create a GitHub Repository
1. Go to [GitHub New Repository](https://github.com/new).
2. Set the repository name to: `sunsethue-helper`
3. Select **Private** (recommended to keep your code private).
4. Do **NOT** initialize with a README, gitignore, or license.
5. Click **Create repository**.

### Step 2: Add Your Firebase CI Secret to GitHub
1. On your new GitHub repository page, click the **Settings** tab.
2. Under "Security", expand **Secrets and variables** and click **Actions**.
3. Click the green **New repository secret** button.
4. Name the secret exactly:
   `FIREBASE_TOKEN`
5. Paste the Firebase CI token into the value field:
   `1//05PWPykLs62vECgYIARAAGAUSNwF-L9Ir-zVfTF0zeblBhHWLtk7ODDmPxfWHzDzIDeEGv_o9rA9VM-e52_LW5dcyXQxjGNja6wo`
6. Click **Add secret**.

### Step 3: Link Remote Origin & Push Code
Open your terminal inside the `/Users/atr/code/sunsethue-helper` directory and execute these commands (replacing with your actual GitHub username):
```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/sunsethue-helper.git
git push -u origin main
```

---

## 📋 How It Works After Pushing

Whenever you modify any file locally and commit it to git:
1. When you run `git push`, GitHub receives the changes.
2. The GitHub Action runner spins up a virtual machine running Ubuntu.
3. It installs Node 24, packages the backend dependencies, and executes the backend unit tests (`npm test` in the `functions/` directory).
4. If the tests pass, it uses your `FIREBASE_TOKEN` secret to deploy hosting assets and update Cloud Functions automatically!
