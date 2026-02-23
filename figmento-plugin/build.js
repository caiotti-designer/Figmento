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

// Build UI: bundle ui-app.ts and inject into ui.html template
async function buildUI() {
  // Bundle UI TypeScript into a single JS string
  const uiBundle = await esbuild.build({
    entryPoints: ['src/ui-app.ts'],
    bundle: true,
    write: false,
    target: 'es6',
    format: 'iife',
    minify: isProd,
    sourcemap: false,
  });

  const uiJs = uiBundle.outputFiles[0].text;

  // Read HTML template
  const htmlTemplate = fs.readFileSync('src/ui.html', 'utf8');

  // Inject bundled JS at the placeholder
  const html = htmlTemplate.replace(
    '<!-- SCRIPT_PLACEHOLDER -->',
    `<script>\n${uiJs}\n</script>`
  );

  // Ensure dist directory
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  fs.writeFileSync('dist/ui.html', html);

  const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`Built dist/ui.html (${sizeKB} KB${isProd ? ', production' : ''})`);
}

async function build() {
  try {
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist');
    }

    if (isProd) {
      console.log('Building for production...');
    }

    if (isWatch) {
      const codeCtx = await esbuild.context(codeBuild);
      await codeCtx.watch();
      console.log('Watching for changes...');

      // Watch for UI HTML and TS changes
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

      await buildUI();
    } else {
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
