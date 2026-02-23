const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/index.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: 'inline',
    banner: {},
    // Don't bundle node built-ins
    external: [],
    logLevel: 'info',
  });

  console.log('Build complete!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
