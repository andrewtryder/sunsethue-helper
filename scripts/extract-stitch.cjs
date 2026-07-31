const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} to ${dest}...`);
    // Use curl -L as requested by the user
    try {
      execSync(`/usr/bin/curl -L -s -o "${dest}" "${url}"`);
      console.log(`Successfully downloaded to ${dest}`);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

async function run() {
  try {
    // 1. Extract and write design.md
    console.log('Parsing project response...');
    const projectRaw = fs.readFileSync('scripts/project-response.json', 'utf8');
    const projectData = JSON.parse(projectRaw);
    
    // The result content is a JSON string inside result.content[0].text
    const projectInfo = JSON.parse(projectData.result.content[0].text);
    const designMd = projectInfo.designTheme.designMd;
    
    if (designMd) {
      fs.writeFileSync('docs/design.md', designMd);
      console.log('Saved design.md successfully to docs/!');
    } else {
      console.warn('No designMd content found in project response.');
    }

    // 2. Extract and download screen files
    console.log('Parsing screen response...');
    const screenRaw = fs.readFileSync('scripts/screen-response.json', 'utf8');
    const screenData = JSON.parse(screenRaw);
    const screenInfo = JSON.parse(screenData.result.content[0].text);
    
    const screenshotUrl = screenInfo.screenshot.downloadUrl;
    const htmlUrl = screenInfo.htmlCode.downloadUrl;

    // Create docs/assets/ directory if it doesn't exist
    fs.mkdirSync('docs/assets', { recursive: true });

    if (screenshotUrl) {
      await downloadFile(screenshotUrl, 'docs/assets/forecast-dashboard.png');
    }
    if (htmlUrl) {
      await downloadFile(htmlUrl, 'docs/assets/forecast-dashboard.html');
    }

    console.log('Extraction and downloads complete!');
  } catch (err) {
    console.error('Error running extraction:', err);
    process.exit(1);
  }
}

run();
