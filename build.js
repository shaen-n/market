const fs = require('fs');
const path = require('path');
const { minify: minifyHTML } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJS } = require('terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

async function build(srcSubDir, distSubDir) {
  const srcDir = path.join(__dirname, srcSubDir);
  const distDir = path.join(__dirname, distSubDir);
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // HTML
  let htmlRaw;
  const htmlPath = path.join(srcDir, 'index.html');
  if (fs.existsSync(htmlPath)) {
    htmlRaw = fs.readFileSync(htmlPath, 'utf8');
    const htmlMin = await minifyHTML(htmlRaw, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyJS: true,
      minifyCSS: true
    });
    fs.writeFileSync(path.join(distDir, 'index.html'), htmlMin);
    console.log(`✅ ${path.basename(distDir)}/index.html минифицирован`);
  } else {
    console.warn(`⚠️  ${htmlPath} не найден, пропускаем HTML`);
  }

  // CSS
  const cssPath = path.join(srcDir, 'style.css');
  if (fs.existsSync(cssPath)) {
    const cssRaw = fs.readFileSync(cssPath, 'utf8');
    const cssMin = new CleanCSS({}).minify(cssRaw).styles;
    fs.writeFileSync(path.join(distDir, 'style.css'), cssMin);
    console.log(`✅ ${path.basename(distDir)}/style.css минифицирован`);
  }

  // JS
  const jsPath = path.join(srcDir, 'app.js');
  if (fs.existsSync(jsPath)) {
    let jsRaw = fs.readFileSync(jsPath, 'utf8');
    const minified = (await minifyJS(jsRaw, { compress: true, mangle: true })).code;
    const obfuscated = JavaScriptObfuscator.obfuscate(minified, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      stringArray: true,
      stringArrayThreshold: 0.5,
      unicodeEscapeSequence: false,
      identifierNamesGenerator: 'mangled',
      renameGlobals: false,
      selfDefending: false,
    }).getObfuscatedCode();
    fs.writeFileSync(path.join(distDir, 'app.js'), obfuscated);
    console.log(`✅ ${path.basename(distDir)}/app.js минифицирован и обфусцирован`);
  }
}

async function main() {
  try {
    await build('src', 'dist');                     // админ-панель
    await build('marketplace-src', 'marketplace-dist'); // витрина (если папка существует)
    console.log('Сборка завершена.');
  } catch (err) {
    console.error('Ошибка сборки:', err);
  }
}

main();