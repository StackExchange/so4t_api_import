// Optional browser regression suite: real file:// page + real HTTPS/CORS mock API.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'content-import-test-'));
const token = 'synthetic-browser-test-token';
let browser, server;

(async () => {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(temp, 'key.pem'), '-out', path.join(temp, 'cert.pem'), '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
    let allowCors = true, failAnswer = false, unknown = false, posts = [], preflights = 0, userId = 1;
    server = https.createServer({ key: fs.readFileSync(path.join(temp, 'key.pem')), cert: fs.readFileSync(path.join(temp, 'cert.pem')) }, (req, res) => {
        if (allowCors) {
            res.setHeader('Access-Control-Allow-Origin', 'null');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }
        if (req.method === 'OPTIONS') { preflights++; res.writeHead(204); res.end(); return; }
        assert.equal(req.headers.authorization, `Bearer ${token}`);
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET') { res.end(JSON.stringify({ id: userId, name: 'Import test user' })); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            posts.push({ path: req.url, body: JSON.parse(body) });
            if (unknown) { res.writeHead(500); res.end('{}'); return; }
            if (failAnswer && req.url.endsWith('/answers')) { res.writeHead(403); res.end(JSON.stringify({ title: 'Answer permission required' })); return; }
            const entity = req.url.endsWith('/answers') ? 'answer' : req.url.endsWith('/articles') ? 'article' : 'question';
            const value = { id: 100 + posts.length };
            res.writeHead(201);
            res.end(JSON.stringify(req.url.includes('/content-import/') ? { importId: 900 + posts.length, [entity]: value } : value));
        });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `https://127.0.0.1:${server.address().port}`;
    const chrome = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
    browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const errors = [];
    async function fresh() {
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
        return page;
    }
    async function connect(page) {
        await page.locator('#site-url').fill(base);
        await page.locator('#token').fill(token);
        await page.locator('#test-connection').click();
        await page.locator('#connection-status').filter({ hasText: 'Connected as' }).waitFor();
    }
    async function load(page, csv) {
        await page.locator('#csv-file').setInputFiles({ name: 'content.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
        await page.locator('#preview').click();
        await page.locator('#validation').filter({ hasText: 'CSV validated' }).waitFor();
    }
    async function start(page, expected = 'Import complete.') {
        await page.locator('#confirm').check(); await page.locator('#start').click();
        await page.locator('#run-status').filter({ hasText: expected }).waitFor();
    }
    const page = await fresh();
    await page.screenshot({ path: path.join(temp, 'desktop.png'), fullPage: true });
    await connect(page);
    failAnswer = true;
    await load(page, 'title,body,tags,answer\n"A <img src=x onerror=alert(1)> question","Line one\nLine two",tag,Answer');
    assert.equal(await page.locator('#preview-rows img').count(), 0);
    await start(page, 'Import stopped.');
    assert.equal(posts.length, 2); assert.match(await page.locator('#preview-rows').innerText(), /Post #101/);
    // Refreshing credentials must preserve the in-memory question checkpoint.
    await page.locator('#token').fill(token); await page.locator('#test-connection').click();
    await page.locator('#connection-status').filter({ hasText: 'Connected as' }).waitFor();
    failAnswer = false;
    await start(page);
    assert.equal(posts.length, 3); assert.equal(posts[2].path, '/api/v3/questions/101/answers');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-results').click();
    const download = await downloadPromise;
    const results = fs.readFileSync(await download.path(), 'utf8');
    assert.match(results, /complete/); assert.ok(!results.includes(token));
    await page.screenshot({ path: path.join(temp, 'results.png'), fullPage: true });

    for (const attributed of [false, true]) {
        const article = await fresh(); await connect(article);
        await article.locator('#kind').selectOption('articles');
        if (attributed) await article.locator('#authorship').selectOption('attributed');
        await load(article, attributed ? 'title,author_user_id,body,type,tags\nGuide,42,Body,knowledge-article,tag' : 'title,body,type,tags\nGuide,Body,knowledge-article,tag');
        await start(article);
        const last = posts.at(-1);
        assert.equal(last.path, attributed ? '/api/v3/content-import/articles' : '/api/v3/articles');
        assert.equal(last.body.type, 'knowledgeArticle');
        assert.equal(Object.hasOwn(last.body, 'permissions'), !attributed);
        if (attributed) assert.equal(last.body.authorId, 42);
        await article.close();
    }

    userId = -1; // The supplied UserDetailsResponseModel allows service-user IDs.
    const authored = await fresh(); await connect(authored);
    userId = 1;
    await authored.locator('#authorship').selectOption('attributed');
    await load(authored, 'title,asker_user_id,body,tags,answer,answerer_user_id\nQuestion,42,Body,tag,Answer,43');
    await start(authored);
    assert.equal(posts.at(-2).path, '/api/v3/content-import/questions');
    assert.equal(posts.at(-1).body.authorId, 43);
    await authored.close();

    const uncertain = await fresh(); await connect(uncertain);
    await load(uncertain, 'title,body,tags\nQuestion,Body,tag');
    unknown = true;
    await start(uncertain, 'unknown outcome');
    assert.equal(await uncertain.locator('#start').isDisabled(), true);
    assert.equal(await uncertain.locator('#confirm').isDisabled(), true);
    unknown = false;
    await uncertain.close();

    // A separate context avoids the browser's preflight cache for the denial test.
    allowCors = false;
    const blockedContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const blocked = await blockedContext.newPage();
    await blocked.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await blocked.locator('#site-url').fill(base); await blocked.locator('#token').fill(token);
    await blocked.locator('#test-connection').click();
    await blocked.locator('#connection-status').filter({ hasText: 'CORS' }).waitFor();
    assert.equal(await blocked.locator('#start').isDisabled(), true);
    await blockedContext.close();

    // Mobile/offline rendering, template downloads, and validation need no network.
    const mobile = await fresh();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await context.setOffline(true);
    await mobile.locator('#csv-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from([0xff]) });
    await mobile.locator('#preview').click();
    await mobile.locator('#validation').filter({ hasText: 'not valid UTF-8' }).waitFor();
    await load(mobile, 'title,body,tags\nOffline question,Body,tag');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const templatePromise = mobile.waitForEvent('download'); await mobile.locator('#template').click();
    const template = await templatePromise; assert.match(fs.readFileSync(await template.path(), 'utf8'), /title,body,tags,answer/);
    await mobile.screenshot({ path: path.join(temp, 'mobile.png'), fullPage: true });
    assert.ok(preflights > 0); assert.deepEqual(errors, []);
    console.log(`Browser smoke passed: file:// imports, real CORS allow/deny, normal/authored Q&A and articles, partial recovery, uncertain outcomes, safe preview, downloads, offline/mobile. Screenshots: ${temp}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    // Keep screenshots for visual inspection; remove ephemeral test private keys.
    for (const file of ['key.pem', 'cert.pem']) fs.rmSync(path.join(temp, file), { force: true });
});
