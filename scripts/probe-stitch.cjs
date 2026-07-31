const http = require('https');

const project = '10665816774671482405';
const screen = 'f537391c0a404527ad9f4993417e556a';

const domains = [
  'https://stitch.withgoogle.com',
  'https://app-companion-430619.appspot.com'
];

const paths = [
  `/api/projects/${project}/screens/${screen}`,
  `/api/projects/${project}/screens/${screen}/code`,
  `/api/projects/${project}/screens/${screen}/markdown`,
  `/api/projects/${project}/screens/${screen}/design.md`,
  `/api/projects/${project}/screens/${screen}/download`,
  `/api/projects/${project}/screens/${screen}/export`,
  `/api/projects/${project}/screens/${screen}/raw`,
  `/api/projects/${project}/screens/${screen}/zip`,
  `/api/projects/${project}/screens/${screen}/export/markdown`,
  `/publish/${project}/${screen}`,
  `/publish/${project}/${screen}/design.md`,
  `/publish/${project}/design.md`,
  `/p/${project}/s/${screen}`,
  `/p/${project}/s/${screen}/design.md`,
  `/s/${screen}`,
  `/s/${screen}/design.md`,
  `/projects/${project}/screens/${screen}`,
  `/projects/${project}/screens/${screen}/design.md`,
];

async function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 2000) {
          req.destroy();
        }
      });

      res.on('close', () => {
        const isSPA = data.includes('appcompanion-root') || data.includes('<div id="root">') || data.includes('editor_dark') || data.includes('stitch-app');
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentLength: res.headers['content-length'],
          location: res.headers['location'],
          isSPA,
          snippet: data.substring(0, 150).replace(/\r?\n|\r/g, ' ')
        });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });
  });
}

async function run() {
  console.log(`Probing URLs for Project ${project}, Screen ${screen}...`);
  for (const domain of domains) {
    for (const p of paths) {
      const url = domain + p;
      const res = await probe(url);
      if (res.error) {
        console.log(`[ERROR] ${url} -> ${res.error}`);
        continue;
      }
      console.log(`[${res.statusCode}] ${url} -> type: ${res.contentType}, size: ${res.contentLength}, SPA: ${res.isSPA}, snippet: ${res.snippet}`);
    }
  }
  console.log('Probe complete.');
}

run();
