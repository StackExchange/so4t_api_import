const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../src/importer');
const schema = require('../schema/import-api-v3.json');
const root = path.resolve(__dirname, '..');
const normal = { kind: 'questions', attributed: false, editableBy: 'ownerOnly' };
const questions = 'title,body,tags,answer\nQuestion?,Some **markdown**,one two,An answer';
const response = (body, status = 201, headers = {}) => new Response(JSON.stringify(body), { status, headers });

function validate(value, definition) {
    if (definition.$ref) definition = schema.components.schemas[definition.$ref.split('/').pop()];
    if (definition.enum) assert.ok(definition.enum.includes(value), `${value} not in enum`);
    if (definition.type === 'object') {
        for (const field of definition.required || []) assert.ok(Object.hasOwn(value, field), `missing ${field}`);
        for (const [key, val] of Object.entries(value)) {
            if (definition.additionalProperties === false) assert.ok(Object.hasOwn(definition.properties, key), `unexpected ${key}`);
            if (definition.properties[key]) validate(val, definition.properties[key]);
        }
    } else if (definition.type === 'array') {
        assert.ok(Array.isArray(value)); value.forEach(v => validate(v, definition.items));
    } else if (definition.type === 'integer') {
        assert.ok(Number.isInteger(value));
        if (definition.minimum !== undefined) assert.ok(value >= definition.minimum);
        if (definition.maximum !== undefined) assert.ok(value <= definition.maximum);
    } else if (definition.type === 'string') {
        assert.equal(typeof value, 'string');
        if (definition.minLength) assert.ok(value.length >= definition.minLength);
    }
}

test('CSV supports BOM, CRLF, multiline Markdown, commas, escaped quotes, and trailing empty fields', () => {
    const parsed = I.parseCSV('\uFEFFtitle,body,tags,answer\r\n"A, title","line 1\r\n""quoted""",tag,\r\n\r\n');
    assert.equal(parsed.rows.length, 1);
    assert.deepEqual(parsed.rows[0], { title: 'A, title', body: 'line 1\r\n"quoted"', tags: 'tag', answer: '' });
});

test('CSV rejects malformed input before any API writes', () => {
    for (const csv of ['', 'title,body', 'a,a\n1,2', 'a,\n1,2', 'a,b\n1', 'a\n"unterminated', 'a\n"closed"junk', 'a\nbad"quote']) {
        assert.throws(() => I.parseCSV(csv), undefined, csv);
    }
    assert.throws(() => I.parseCSV('a\n' + 'x\n'.repeat(I.MAX_ROWS + 1)), /at most/);
});

test('CSV checks columns, mode, required content, and author IDs', () => {
    assert.throws(() => I.prepareCSV('title,body\nTitle,body', normal), /Missing columns: tags/);
    assert.throws(() => I.prepareCSV('title,body,tags,wat\nTitle,body,tag,no', normal), /Unrecognized columns/);
    assert.throws(() => I.prepareCSV('title,body,tags,asker_account_id\nTitle,body,tag,1', normal), /Legacy account IDs/);
    assert.throws(() => I.prepareCSV('title,body,tags,asker_user_id\nTitle,body,tag,1', normal), /Preserve authors/);
    const invalid = I.prepareCSV('title,body,tags,asker_user_id,answer,answerer_user_id\n, ,tag tag,2147483648,Answer,0', { ...normal, attributed: true });
    assert.equal(invalid.issues.length, 5);
    const noAnswer = I.prepareCSV('title,body,tags,asker_user_id\nTitle,body,tag,12', { ...normal, attributed: true });
    assert.deepEqual(noAnswer.issues, []);
    assert.equal(noAnswer.items[0].answer, null);
});

test('question-only imports accept missing or blank answers without creating empty answers', async () => {
    for (const csv of ['title,body,tags\nTitle,body,tag', 'title,body,tags,answer\nTitle,body,tag,   ']) {
        const { items, issues } = I.prepareCSV(csv, normal);
        assert.equal(issues.length, 0);
        const calls = [];
        await I.runImport(items, normal, { request: async p => { calls.push(p); return { id: 17 }; } });
        assert.deepEqual(calls, ['/questions']);
    }
});

test('article type mapping, permissions, and dates follow the v3 schema', () => {
    const options = { kind: 'articles', attributed: false, editableBy: 'everyone' };
    const { items, issues } = I.prepareCSV('title,body,tags,type,expiration_date\nArticle,Body,tag,knowledge-article,\nNews,Body,tag,announcement,2028-02-29', options);
    assert.deepEqual(issues, []);
    assert.deepEqual(items[0].body.permissions, { editableBy: 'everyone' });
    assert.equal(items[0].body.type, 'knowledgeArticle');
    assert.equal(items[1].body.expirationDate, '2028-02-29');
    const bad = I.prepareCSV('title,body,tags,type,expiration_date\nA,B,t,toString,\nA,B,t,policy,2027-02-29', options);
    assert.equal(bad.issues.length, 3);
});

test('destination normalization supports Enterprise and exact hosted team domains', () => {
    const cases = new Map([
        ['https://company.example/', 'https://company.example/api/v3'],
        ['https://company.example/api/v3/', 'https://company.example/api/v3'],
        ['https://company.example/api/v3/teams/my-team', 'https://company.example/api/v3/teams/my-team'],
        ['https://stackoverflowteams.com/c/my-team/', 'https://api.stackoverflowteams.com/v3/teams/my-team'],
        ['https://api.stackoverflowteams.com/v3/teams/my-team', 'https://api.stackoverflowteams.com/v3/teams/my-team'],
        ['https://stackoverflowteams.com.evil.example', 'https://stackoverflowteams.com.evil.example/api/v3']
    ]);
    for (const [url, expected] of cases) assert.equal(I.normalizeBase(url), expected);
    for (const url of ['http://company.example', 'javascript:alert(1)', 'https://u:p@company.example', 'https://company.example?token=x', 'https://company.example/#x', 'https://company.example/api/2.3', 'https://stackoverflowteams.com/c/', 'https://api.stackoverflowteams.com/v3']) assert.throws(() => I.normalizeBase(url));
});

for (const attributed of [false, true]) {
    for (const kind of ['questions', 'articles']) {
        for (const team of [false, true]) {
            test(`${kind}: ${attributed ? 'preserved author' : 'token owner'}, ${team ? 'team' : 'site'} matches supplied request/response contracts`, async () => {
                const options = { ...normal, kind, attributed };
                const csv = kind === 'questions'
                    ? (attributed ? 'title,body,tags,asker_user_id,answer,answerer_user_id\nQuestion,Body,one two,12,Answer,13' : questions)
                    : (attributed ? 'title,body,tags,type,author_user_id\nArticle,Body,one two,how-to-guide,12' : 'title,body,tags,type\nArticle,Body,one two,howToGuide');
                const { items, issues } = I.prepareCSV(csv, options);
                assert.deepEqual(issues, []);
                const base = team ? 'https://api.stackoverflowteams.com/v3/teams/demo' : 'https://company.example/api/v3';
                const calls = [];
                const client = I.createClient(base, 'test-token', async (url, init) => {
                    calls.push(url);
                    assert.equal(init.headers.Authorization, 'Bearer test-token');
                    assert.equal(init.headers['Content-Type'], 'application/json');
                    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
                    let endpoint = url.slice(base.length).replace(/\/42\/answers$/, '/{questionId}/answers');
                    if (team) endpoint = '/teams/{team}' + endpoint;
                    const operation = schema.paths[endpoint].post;
                    const body = JSON.parse(init.body);
                    validate(body, operation.requestBody.content['application/json'].schema);
                    assert.equal(Object.hasOwn(body, 'authorId'), attributed);
                    if (kind === 'articles') assert.equal(Object.hasOwn(body, 'permissions'), !attributed);
                    const entity = endpoint.endsWith('answers') ? 'answer' : kind === 'questions' ? 'question' : 'article';
                    const data = attributed ? { importId: 901, [entity]: { id: 42 } } : { id: 42 };
                    validate(data, operation.responses['201'].content['application/json'].schema);
                    return response(data);
                });
                assert.equal(await I.runImport(items, options, client), 'complete');
                assert.equal(items[0].postId, 42);
                assert.equal(items[0].importId, attributed ? 901 : null);
                assert.equal(calls.length, kind === 'questions' ? 2 : 1);
                if (kind === 'questions') assert.equal(items[0].answerId, 42);
            });
        }
    }
}

test('failed answer preserves question ID; continuing never recreates completed posts', async () => {
    const { items } = I.prepareCSV(questions + '\nSecond,Body,tag,', normal);
    let fail = true;
    const calls = [];
    const client = { request: async p => {
        calls.push(p);
        if (p.endsWith('/answers') && fail) throw new I.ApiError('HTTP 403', { status: 403 });
        return { id: calls.length };
    } };
    assert.equal(await I.runImport(items, normal, client), 'failed');
    assert.equal(items[0].status, 'partial'); assert.equal(items[0].postId, 1);
    assert.equal(items[1].status, 'pending');
    fail = false;
    assert.equal(await I.runImport(items, normal, client), 'complete');
    assert.deepEqual(calls, ['/questions', '/questions/1/answers', '/questions/1/answers', '/questions']);
    await I.runImport(items, normal, client);
    assert.equal(calls.length, 4);
});

test('stop lets the in-flight question finish but does not send its answer', async () => {
    const { items } = I.prepareCSV(questions, normal);
    let stop = false;
    const client = { request: async () => { stop = true; return { id: 9 }; } };
    assert.equal(await I.runImport(items, normal, client, { shouldStop: () => stop }), 'stopped');
    assert.equal(items[0].postId, 9); assert.equal(items[0].answerId, null);
    assert.equal(items[0].status, 'partial');
});

test('unknown network outcome locks the row and cannot replay the POST', async () => {
    const { items } = I.prepareCSV(questions, normal);
    let count = 0;
    const client = I.createClient('https://site.example', 'secret-token', async () => { count++; throw new TypeError('network'); });
    assert.equal(await I.runImport(items, normal, client), 'failed');
    assert.equal(items[0].status, 'uncertain'); assert.match(items[0].message, /CORS/);
    assert.equal(await I.runImport(items, normal, client), 'blocked'); assert.equal(count, 1);
});

test('429 reports Retry-After and stops without automatically retrying', async () => {
    let count = 0;
    const client = I.createClient('https://site.example', 'secret-token', async () => { count++; return response({ title: 'Slow down' }, 429, { 'Retry-After': '60' }); });
    await assert.rejects(() => client.request('/articles', {}), e => e.status === 429 && !e.uncertain && e.retryAfter === '60');
    assert.equal(count, 1);
});

test('server failures, empty successes, and missing IDs are treated as uncertain writes', async () => {
    for (const res of [response({}, 500), new Response('', { status: 201 }), response({})]) {
        const { items } = I.prepareCSV(questions, normal);
        const client = I.createClient('https://site.example', 'secret-token', async () => res);
        await I.runImport(items, normal, client);
        assert.equal(items[0].status, 'uncertain');
    }
});

test('timeouts abort the fetch and do not assume a POST failed', async () => {
    const client = I.createClient('https://site.example', 'secret-token', (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }), 5);
    await assert.rejects(() => client.request('/questions', {}), e => e.uncertain);
});

test('API errors redact the token and retain structured validation details', async () => {
    const client = I.createClient('https://site.example', 'secret-token', async () => response({ title: 'Bad input secret-token', errors: { tags: ['Unknown tag'] } }, 400));
    await assert.rejects(() => client.request('/questions', {}), error => {
        assert.match(error.message, /Unknown tag/); assert.doesNotMatch(error.message, /secret-token/);
        return !error.uncertain;
    });
});

test('result exports escape CSV and prevent spreadsheet formulas', () => {
    const { items } = I.prepareCSV(questions, normal);
    items[0].body.title = '=HYPERLINK("bad")'; items[0].message = '\t+formula';
    const csv = I.resultsCSV(items);
    assert.match(csv, /'=HYPERLINK\(""bad""\)/); assert.match(csv, /'\t\+formula/);
    assert.doesNotMatch(csv, /Authorization|test-token/);
});

test('checked-in standalone HTML is current and does not load external runtime assets', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.equal(html, require('../scripts/build').build(), 'Run npm run build after changing sources');
    assert.doesNotMatch(html, /<script[^>]*\bsrc=|<link[^>]*\brel="stylesheet"|type="module"/);
    assert.equal((html.match(/<\/style>/gi) || []).length, 2);
    assert.equal((html.match(/<\/script>/gi) || []).length, 2);
    for (const source of ['src/importer.js', 'src/app.js']) assert.doesNotMatch(fs.readFileSync(path.join(root, source), 'utf8'), /\/2\.3|access-tokens\/exchange|X-API-Key|localStorage|sessionStorage/);
});

test('all current CSV examples validate in their intended mode', () => {
    for (const file of fs.readdirSync(path.join(root, 'CSV Templates'))) {
        const options = { ...normal, kind: file.includes('articles') ? 'articles' : 'questions', attributed: file.startsWith('authored_') };
        const prepared = I.prepareCSV(fs.readFileSync(path.join(root, 'CSV Templates', file), 'utf8'), options);
        assert.deepEqual(prepared.issues, [], file);
    }
});
