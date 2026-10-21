/* API v3 import engine. No DOM or third-party runtime dependencies. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ImportTool = api;
})(globalThis, function () {
    'use strict';
    const MAX_ROWS = 10000;
    const MAX_BYTES = 20 * 1024 * 1024;
    const articleTypes = Object.freeze({
        'knowledge-article': 'knowledgeArticle', knowledgeArticle: 'knowledgeArticle',
        'how-to-guide': 'howToGuide', howToGuide: 'howToGuide',
        announcement: 'announcement', policy: 'policy'
    });

    function parseCSV(text) {
        text = text.replace(/^\uFEFF/, '');
        const records = [];
        let row = [], field = '', quoted = false, closed = false;
        const finishField = () => { row.push(field); field = ''; closed = false; };
        const finishRow = () => {
            finishField();
            if (!(row.length === 1 && !row[0].trim())) records.push(row);
            row = [];
            if (records.length > MAX_ROWS + 1) throw new Error(`Use at most ${MAX_ROWS.toLocaleString()} rows per file.`);
        };
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else { quoted = false; closed = true; }
                } else field += c;
            } else if (c === ',') finishField();
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                finishRow();
            } else if (c === '"') {
                if (field || closed) throw new Error('Unexpected quote. Enclose the entire CSV field in double quotes.');
                quoted = true;
            } else {
                if (closed) throw new Error('Unexpected text after a closing CSV quote.');
                field += c;
            }
        }
        if (quoted) throw new Error('Unclosed CSV quote. Check multiline fields and escape quotes as "".');
        if (field || row.length || closed) finishRow();
        if (records.length < 2) throw new Error('The CSV needs a header and at least one content row.');
        const headers = records.shift().map(h => h.trim());
        if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Column names must be nonempty and unique.');
        const rows = records.map((values, i) => {
            if (values.length !== headers.length) throw new Error(`Record ${i + 2} has ${values.length} fields; expected ${headers.length}. Quote fields containing commas or line breaks.`);
            return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
        });
        return { headers, rows };
    }

    function validId(value) {
        return /^\d+$/.test(String(value)) && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
    }

    function prepareCSV(text, options) {
        if (!['questions', 'articles'].includes(options.kind)) throw new Error('Choose questions or articles.');
        const { headers, rows } = parseCSV(text);
        if (headers.some(h => h.endsWith('_account_id'))) throw new Error('Legacy account IDs cannot be used with v3 author preservation. Replace them with site user IDs using an author template.');
        const authorColumns = options.kind === 'questions' ? ['asker_user_id', 'answerer_user_id'] : ['author_user_id'];
        const required = ['title', 'body', 'tags', ...(options.kind === 'articles' ? ['type'] : [])];
        if (options.attributed) required.push(authorColumns[0]);
        const allowed = new Set([...required, ...(options.kind === 'questions' ? ['answer'] : ['expiration_date']), ...authorColumns]);
        const missing = required.filter(h => !headers.includes(h));
        if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}.`);
        const unknown = headers.filter(h => !allowed.has(h));
        if (unknown.length) throw new Error(`Unrecognized columns: ${unknown.join(', ')}. Choose the matching content type and template.`);
        if (!options.attributed && authorColumns.some(h => headers.includes(h))) throw new Error('This CSV contains author IDs. Select “Preserve authors” to use them.');
        const issues = [];
        const items = rows.map((row, i) => {
            const record = i + 2;
            const issue = message => issues.push({ record, message });
            if (!row.title.trim()) issue('Title is required.');
            if (!row.body.trim()) issue('Body is required.');
            const tags = row.tags.trim() ? row.tags.trim().split(/\s+/) : [];
            if (new Set(tags).size !== tags.length) issue('Remove duplicate tags.');
            const body = { title: row.title.trim(), body: row.body, tags };
            let answer = row.answer?.trim() ? { body: row.answer } : null;
            if (options.attributed) {
                if (!validId(row[authorColumns[0]]?.trim())) issue(`${authorColumns[0]} must be a positive site user ID (up to 2147483647).`);
                body.authorId = Number(row[authorColumns[0]]);
                if (answer) {
                    if (!validId(row.answerer_user_id?.trim())) issue('An answer needs a positive answerer_user_id (site user ID).');
                    answer.authorId = Number(row.answerer_user_id);
                } else if (row.answerer_user_id?.trim()) issue('An answerer_user_id was provided without an answer.');
            }
            if (options.kind === 'articles') {
                const type = Object.hasOwn(articleTypes, row.type.trim()) ? articleTypes[row.type.trim()] : undefined;
                if (!type) issue('Article type must be knowledgeArticle, howToGuide, announcement, or policy (legacy hyphenated spellings also work).');
                body.type = type;
                if (!options.attributed) {
                    if (!['ownerOnly', 'everyone'].includes(options.editableBy)) issue('Choose article editing permissions.');
                    body.permissions = { editableBy: options.editableBy };
                }
                if (row.expiration_date?.trim()) {
                    const date = row.expiration_date.trim();
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) issue('expiration_date must be a real date in YYYY-MM-DD format.');
                    if (type !== 'announcement') issue('Only announcements can have an expiration date.');
                    body.expirationDate = date;
                }
            }
            return { record, body, answer, status: 'pending', postId: null, answerId: null,
                importId: null, answerImportId: null, stage: '', message: '', webUrl: '' };
        });
        return { items, issues };
    }

    function normalizeBase(input) {
        let url;
        try { url = new URL(input.trim()); } catch { throw new Error('Enter a full HTTPS site URL or API v3 base URL.'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS URL without credentials, query parameters, or a fragment.');
        const path = url.pathname.replace(/\/+$/, '');
        if (url.hostname === 'stackoverflowteams.com') {
            const match = path.match(/^\/c\/([a-zA-Z0-9_-]+)$/);
            if (!match || url.port) throw new Error('Use https://stackoverflowteams.com/c/TEAM-NAME.');
            return `https://api.stackoverflowteams.com/v3/teams/${match[1]}`;
        }
        if (url.hostname === 'api.stackoverflowteams.com') {
            if (!/^\/v3\/teams\/[a-zA-Z0-9_-]+$/.test(path) || url.port) throw new Error('The hosted API URL must include /v3/teams/TEAM-NAME.');
            return url.origin + path;
        }
        if (!path) return url.origin + '/api/v3';
        if (/\/api\/v3(?:\/teams\/[a-zA-Z0-9_-]+)?$/.test(path)) return url.origin + path;
        throw new Error('Use the site root or a base URL ending in /api/v3 (optionally /teams/TEAM-NAME).');
    }

    class ApiError extends Error {
        constructor(message, { uncertain = false, status = 0, retryAfter = '' } = {}) {
            super(message); this.name = 'ApiError'; this.uncertain = uncertain;
            this.status = status; this.retryAfter = retryAfter;
        }
    }

    function createClient(base, token, fetcher = globalThis.fetch, timeoutMs = 60000) {
        base = normalizeBase(base);
        token = token.trim();
        if (!token || /\s/.test(token)) throw new Error('Enter a bearer token without the “Bearer” prefix or whitespace.');
        const redact = text => String(text).split(token).join('[redacted]');
        return {
            base,
            async request(path, body) {
                if (!/^\/(users\/me|(?:content-import\/)?(?:articles|questions(?:\/\d+\/answers)?))$/.test(path)) throw new Error('Unsupported v3 endpoint.');
                const method = body === undefined ? 'GET' : 'POST';
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetcher(base + path, {
                        method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
                        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                        credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal
                    });
                    const raw = await response.text();
                    let data;
                    try { data = JSON.parse(raw); } catch { data = null; }
                    if (!response.ok) {
                        const details = [data?.title, data?.detail, ...Object.values(data?.errors || {}).flat()].filter(x => typeof x === 'string').join(' ');
                        const retryAfter = response.headers.get('Retry-After') || '';
                        const hint = response.status === 429 ? ` Rate limited.${retryAfter ? ` Retry-After: ${retryAfter}.` : ''} Wait before continuing.` : '';
                        throw new ApiError(redact(`HTTP ${response.status}. ${details || 'The API rejected the request.'}${hint}`).slice(0, 1500), {
                            status: response.status, retryAfter,
                            uncertain: method === 'POST' && (response.status >= 500 || response.status === 408)
                        });
                    }
                    if (data === null || typeof data !== 'object') throw new ApiError('The API returned an unreadable response. Check the destination before retrying.', { uncertain: method === 'POST' });
                    return data;
                } catch (error) {
                    if (error instanceof ApiError) throw error;
                    throw new ApiError('No readable API response. Check the URL, network, HTTPS certificate, and API CORS policy. A local file uses origin “null”; localhost hosting alone does not fix API CORS. ' + (method === 'POST' ? 'The post may have been created. Check the destination before retrying.' : ''), { uncertain: method === 'POST' });
                } finally { clearTimeout(timer); }
            }
        };
    }

    async function runImport(items, options, client, { onUpdate = () => {}, shouldStop = () => false } = {}) {
        const prefix = options.attributed ? '/content-import' : '';
        const entity = options.kind === 'questions' ? 'question' : 'article';
        for (const item of items) {
            if (shouldStop()) return 'stopped';
            if (item.status === 'complete') continue;
            if (item.status === 'uncertain') return 'blocked';
            item.status = 'running'; item.message = ''; onUpdate(item);
            try {
                if (!item.postId) {
                    item.stage = entity; onUpdate(item);
                    const result = await client.request(`${prefix}/${options.kind}`, item.body);
                    const post = options.attributed ? result[entity] : result;
                    if (!validId(post?.id)) throw new ApiError('The create response did not contain a valid post ID. Check the destination before retrying.', { uncertain: true });
                    item.postId = post.id;
                    item.importId = result.importId ?? null;
                    item.webUrl = typeof post.webUrl === 'string' ? post.webUrl : '';
                    onUpdate(item);
                }
                if (item.answer && !item.answerId) {
                    if (shouldStop()) { item.status = 'partial'; item.message = 'Question created; answer not sent.'; onUpdate(item); return 'stopped'; }
                    item.stage = 'answer'; onUpdate(item);
                    const result = await client.request(`${prefix}/questions/${item.postId}/answers`, item.answer);
                    const answer = options.attributed ? result.answer : result;
                    if (!validId(answer?.id)) throw new ApiError('The create response did not contain a valid answer ID. Check the destination before retrying.', { uncertain: true });
                    item.answerId = answer.id;
                    item.answerImportId = result.importId ?? null;
                }
                item.status = 'complete'; item.message = item.answer ? 'Question and answer created.' : `${entity === 'article' ? 'Article' : 'Question'} created.`;
                onUpdate(item);
            } catch (error) {
                item.status = error.uncertain ? 'uncertain' : (item.postId ? 'partial' : 'failed');
                item.message = error.message;
                onUpdate(item);
                return 'failed';
            }
        }
        return 'complete';
    }

    function resultsCSV(items) {
        const columns = ['record', 'title', 'status', 'stage', 'postId', 'answerId', 'importId', 'answerImportId', 'message'];
        const quote = value => {
            let text = String(value ?? '');
            // Neutralize spreadsheet formula injection in exported user/API-controlled text.
            if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
        };
        return [columns, ...items.map(item => columns.map(c => c === 'title' ? item.body.title : item[c]))].map(row => row.map(quote).join(',')).join('\r\n');
    }

    function template(options) {
        if (options.kind === 'articles') return options.attributed
            ? 'title,author_user_id,body,type,tags,expiration_date\r\n'
            : 'title,body,type,tags,expiration_date\r\n';
        return options.attributed ? 'title,asker_user_id,body,tags,answer,answerer_user_id\r\n' : 'title,body,tags,answer\r\n';
    }
    return { MAX_BYTES, MAX_ROWS, parseCSV, prepareCSV, normalizeBase, validId, createClient, ApiError, runImport, resultsCSV, template };
});
