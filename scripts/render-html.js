const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function renderHTML(inputPath, outputPath) {
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputPath);

  if (!fs.existsSync(absoluteInput)) {
    console.error(`Input file not found: ${absoluteInput}`);
    process.exit(1);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(absoluteOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // A4 at 300dpi: 2480x3508
    await page.setViewport({
      width: 2480,
      height: 3508,
      deviceScaleFactor: 1,
    });

    const fileUrl = `file:///${absoluteInput.replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    await page.screenshot({
      path: absoluteOutput,
      type: 'png',
      fullPage: false,
      omitBackground: false,
    });

    console.log(`Rendered: ${absoluteOutput}`);
  } finally {
    await browser.close();
  }
}

const [inputFile, outputFile] = process.argv.slice(2);

if (!inputFile || !outputFile) {
  console.error('Usage: node scripts/render-html.js <input.html> <output.png>');
  process.exit(1);
}

renderHTML(inputFile, outputFile).catch((err) => {
  console.error('Render failed:', err.message);
  process.exit(1);
});
