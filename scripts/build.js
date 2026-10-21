// No build dependencies. End users only need the generated index.html.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function build() {
    let html = read('src/page.html');
    const css = read('vendor/stacks-3.0.2.min.css').replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
    // CSS data-URI SVGs can contain literal </style>; HTML parses that as an end tag.
    const inlineCSS = value => value.replace(/<\/style/gi, '%3C/style');
    html = html.replace('/* STACKS_CSS */', () => `/* Stacks 3.0.2 · MIT\n${read('vendor/stacks-LICENSE.txt')}\n*/\n${inlineCSS(css)}`)
        .replace('/* APP_CSS */', () => inlineCSS(read('src/app.css')))
        .replace('/* IMPORTER_JS */', () => read('src/importer.js').replace(/<\/script/gi, '<\\/script'))
        .replace('/* APP_JS */', () => read('src/app.js').replace(/<\/script/gi, '<\\/script'));
    return html;
}
if (require.main === module) {
    fs.writeFileSync(path.join(root, 'index.html'), build());
    console.log('Built standalone index.html');
}
module.exports = { build };
