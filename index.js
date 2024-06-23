const express = require('express');
const awsServerlessExpress = require('aws-serverless-express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const util = require('util');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'page.html'));
    return res.send('Hello World! Api is working')
});

app.post('/generate-pdf', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  const downloadPath = path.resolve(__dirname, 'downloads');

  // Ensure download directory exists
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // Configure download behavior
  await page._client().send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });

  await page.goto(url, { waitUntil: 'networkidle2' });

  // Trigger download using existing JavaScript code
  // await page.evaluate(() => {
  //     document.querySelector('button#download').click();
  // });

  // Function to check if a file exists
  const fileExists = util.promisify(fs.exists);

  // Wait for the file to appear in the download directory
  let downloadComplete = false;
  const downloadTimeout = 30000; // 30 seconds
  const checkInterval = 1000; // 1 second
  const startTime = Date.now();

  while (!downloadComplete && Date.now() - startTime < downloadTimeout) {
    const files = fs.readdirSync(downloadPath);
    if (files.length > 0) {
      downloadComplete = true;
    } else {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  await browser.close();

  if (!downloadComplete) {
    return res.status(500).send('Download did not complete in time');
  }

  // Find the downloaded file (assuming only one file will be downloaded)
  const files = fs.readdirSync(downloadPath);
  const filePath = path.join(downloadPath, files[0]);

  // Read the downloaded file and send it as a response
  const fileBuffer = fs.readFileSync(filePath);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': fileBuffer.length,
    'Content-Disposition': `attachment; filename=${files[0]}`,
  });

  res.send(fileBuffer);

  // Clean up the downloaded file
  fs.unlinkSync(filePath);
});

const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => {
  awsServerlessExpress.proxy(server, event, context);
};
