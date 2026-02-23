const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';

// Build code.ts (sandbox) - target ES6 for Figma compatibility
const codeBuild = {
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es6',
  format: 'iife',
  minify: isProd,
  sourcemap: !isProd ? 'inline' : false,
  logLevel: 'info',
};

// Build ui.ts and inline into ui.html
async function buildUI() {
  const result = await esbuild.build({
    entryPoints: ['src/ui/index.ts'],
    bundle: true,
    write: false,
    target: 'es2020',
    format: 'iife',
    minify: isProd,
    sourcemap: !isProd ? 'inline' : false,
    logLevel: 'info',
  });

  const jsCode = result.outputFiles[0].text;

  // Read ui.html template
  const htmlTemplate = fs.readFileSync('src/ui.html', 'utf8');

  // Inject the JS into the HTML
  const finalHtml = htmlTemplate.replace(
    '<!-- SCRIPT_PLACEHOLDER -->',
    `<script>${jsCode}</script>`
  );

  // Write to dist
  fs.writeFileSync('dist/ui.html', finalHtml);

  const sizeKB = (Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Built dist/ui.html (${sizeKB} KB${isProd ? ', minified' : ''})`);
}

async function build() {
  try {
    // Ensure dist directory exists
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist');
    }

    if (isProd) {
      console.log('Building for production (minified, no source maps)...');
    }

    if (isWatch) {
      // Watch mode
      const codeCtx = await esbuild.context(codeBuild);
      await codeCtx.watch();
      console.log('Watching for changes...');

      // Watch for UI changes - now watches all .ts and .html files in src/
      fs.watch('src', { recursive: true }, async (eventType, filename) => {
        if (filename && (filename.endsWith('.ts') || filename.endsWith('.html'))) {
          console.log(`File changed: ${filename}`);
          try {
            await buildUI();
          } catch (error) {
            console.error('UI build failed:', error.message);
          }
        }
      });

      // Initial UI build
      await buildUI();
    } else {
      // One-time build
      await esbuild.build(codeBuild);
      await buildUI();
      console.log('Build complete!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
