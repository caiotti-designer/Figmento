const puppeteer = require('puppeteer');
const path = require('path');

async function renderHtmlToPng(inputHtml, outputPng) {
    console.log('Starting HTML to PNG conversion...');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Set viewport to exact size
        await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1
        });

        // Navigate to the HTML file
        const htmlPath = path.resolve(inputHtml);
        await page.goto(`file://${htmlPath}`, {
            waitUntil: 'networkidle0'
        });

        // Wait for any animations or fonts to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Take screenshot
        await page.screenshot({
            path: outputPng,
            width: 1920,
            height: 1080,
            type: 'png'
        });

        console.log(`Successfully generated: ${outputPng}`);

    } catch (error) {
        console.error('Error rendering HTML:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Command line usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.log('Usage: node render-html.js <input.html> <output.png>');
        process.exit(1);
    }

    const [inputHtml, outputPng] = args;
    renderHtmlToPng(inputHtml, outputPng)
        .then(() => console.log('Conversion complete!'))
        .catch(error => {
            console.error('Conversion failed:', error);
            process.exit(1);
        });
}

module.exports = { renderHtmlToPng };