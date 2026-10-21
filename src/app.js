(function () {
    'use strict';
    const I = globalThis.ImportTool;
    const $ = id => document.getElementById(id);
    const state = { items: [], issues: [], client: null, options: null, busy: false, started: false, stop: false, page: 0 };
    const pageSize = 25;
    const options = () => ({ kind: $('kind').value, attributed: $('authorship').value === 'attributed', editableBy: $('editable-by').value });
    const node = (tag, text, className = '') => {
        const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
    };
    function notice(id, text, tone = 'info') {
        const el = $(id); el.textContent = text; el.className = `s-notice s-notice__${tone} d-block p12 mt16`; el.hidden = !text;
    }
    function updateControls() {
        const uncertain = state.items.some(i => i.status === 'uncertain');
        const complete = state.items.length && state.items.every(i => i.status === 'complete');
        $('connection-fields').disabled = state.busy;
        $('site-url').disabled = state.started;
        $('source-fields').disabled = state.busy || state.started;
        $('confirm').disabled = state.busy || !state.client || !!state.issues.length || !!complete || uncertain;
        $('start').disabled = state.busy || !state.client || !state.items.length || !!state.issues.length || !$('confirm').checked || !!complete || uncertain;
        $('start').textContent = state.started ? 'Continue remaining import' : 'Start import';
        $('stop').hidden = !state.busy || !state.started;
        $('stop').disabled = state.stop;
        $('reset').hidden = !state.started;
        $('reset').disabled = state.busy;
        $('download-results').disabled = !state.started;
        $('destination').textContent = state.client ? `Destination: ${state.client.base} · ${state.options?.attributed ? 'Preserve authors' : 'Token owner'}` : 'Test your connection before starting the import.';
    }
    function clearPreview() {
        state.items = []; state.issues = []; state.options = null; state.page = 0;
        $('review').hidden = true; $('empty-state').hidden = false; $('validation').hidden = true;
        $('run-status').hidden = true; $('confirm').checked = false;
        $('review-subtitle').textContent = 'Your content preview will appear here.';
        updateControls();
    }
    function render() {
        $('empty-state').hidden = true; $('review').hidden = false;
        $('row-count').textContent = state.items.length.toLocaleString();
        $('answer-count').textContent = state.items.filter(i => i.answer).length.toLocaleString();
        const completed = state.items.filter(i => i.status === 'complete').length;
        $('complete-count').textContent = completed.toLocaleString();
        $('progress').max = Math.max(1, state.items.length); $('progress').value = completed;
        const tbody = $('preview-rows'); tbody.replaceChildren();
        for (const item of state.items.slice(state.page * pageSize, (state.page + 1) * pageSize)) {
            const tr = document.createElement('tr'); tr.append(node('td', item.record));
            const content = document.createElement('td');
            content.append(node('div', item.body.title, 'fw-bold mb4'));
            content.append(node('div', item.body.tags.join(' · ') || 'No tags', 's-description mb8'));
            const details = document.createElement('details'); details.append(node('summary', 'View content', 's-description'));
            details.append(node('pre', item.body.body));
            if (item.answer) { details.append(node('strong', 'Answer')); details.append(node('pre', item.answer.body)); }
            if (item.body.authorId) details.append(node('p', `Author user ID: ${item.body.authorId}${item.answer ? ` · Answer author: ${item.answer.authorId}` : ''}`, 's-description'));
            if (item.body.type) details.append(node('p', `Type: ${item.body.type}${item.body.expirationDate ? ` · Expires: ${item.body.expirationDate}` : ''}`, 's-description'));
            content.append(details); tr.append(content);
            const result = document.createElement('td');
            const labels = { pending: 'Ready', running: 'Importing', complete: 'Complete', partial: 'Partial', failed: 'Failed', uncertain: 'Check destination' };
            result.append(node('span', labels[item.status], `s-badge ${item.status === 'complete' ? 's-badge__success' : ['failed', 'partial', 'uncertain'].includes(item.status) ? 's-badge__warning' : ''}`));
            if (item.postId) result.append(node('div', `Post #${item.postId}`, 's-description mt8'));
            if (item.answerId) result.append(node('div', `Answer #${item.answerId}`, 's-description'));
            if (item.message) result.append(node('p', item.message, 's-description mt8 mb0'));
            tr.append(result); tbody.append(tr);
        }
        const pages = Math.ceil(state.items.length / pageSize);
        $('page-label').textContent = `Page ${state.page + 1} of ${pages}`;
        $('previous').disabled = state.page === 0; $('next').disabled = state.page + 1 >= pages;
        updateControls();
    }
    function download(name, content) {
        const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function configurationChanged() {
        $('author-help').hidden = !options().attributed;
        $('article-permissions').hidden = options().kind !== 'articles' || options().attributed;
        $('import-permissions-help').hidden = options().kind !== 'articles' || !options().attributed;
        clearPreview();
    }
    ['kind', 'authorship', 'editable-by'].forEach(id => $(id).addEventListener('change', configurationChanged));
    $('csv-file').addEventListener('change', clearPreview);
    ['site-url', 'token'].forEach(id => $(id).addEventListener('input', () => {
        state.client = null; $('confirm').checked = false; $('connection-status').hidden = true; updateControls();
    }));
    $('connection-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (state.busy) return;
        state.busy = true; state.client = null; updateControls();
        notice('connection-status', 'Checking your API v3 connection…');
        try {
            const client = I.createClient($('site-url').value, $('token').value);
            const user = await client.request('/users/me');
            // User response IDs have no positive-only restriction in the schema;
            // a service token can represent the Community user.
            if (!Number.isInteger(user.id)) throw new Error('The URL did not return an API v3 user. Check the API base URL.');
            state.client = client;
            notice('connection-status', `Connected${user.name ? ` as ${String(user.name).split($('token').value.trim()).join('[redacted]')}` : ''}. Read access confirmed; import permissions are checked when posting.`, 'success');
        } catch (error) { notice('connection-status', error.message, 'danger'); }
        finally { state.busy = false; updateControls(); }
    });
    $('template').addEventListener('click', () => download(`${options().attributed ? 'authored_' : ''}${options().kind}.csv`, I.template(options())));
    $('preview').addEventListener('click', async () => {
        if (state.busy || state.started) return;
        clearPreview();
        const file = $('csv-file').files[0];
        if (!file) { notice('validation', 'Choose a CSV file first.', 'danger'); return; }
        if (file.size > I.MAX_BYTES) { notice('validation', 'The file exceeds 20 MB. Split it into smaller files.', 'danger'); return; }
        state.busy = true; updateControls();
        try {
            let text;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
            catch { throw new Error('The file is not valid UTF-8. Save it as CSV UTF-8 and try again.'); }
            const prepared = I.prepareCSV(text, options());
            state.items = prepared.items; state.issues = prepared.issues; state.options = options();
            $('review-subtitle').textContent = file.name;
            render();
            if (state.issues.length) {
                notice('validation', `${state.issues.length} validation issue(s). Fix the CSV and validate again.`, 'danger');
                const list = document.createElement('ul'); list.className = 'mt8 mb0';
                for (const issue of state.issues.slice(0, 100)) list.append(node('li', `Record ${issue.record}: ${issue.message}`));
                $('validation').append(list);
                if (state.issues.length > 100) $('validation').append(node('p', 'Showing the first 100 issues.'));
            } else notice('validation', 'CSV validated. Review the content and destination below.', 'success');
        } catch (error) { notice('validation', error.message, 'danger'); }
        finally { state.busy = false; updateControls(); }
    });
    $('confirm').addEventListener('change', updateControls);
    $('start').addEventListener('click', async () => {
        if ($('start').disabled) return;
        state.started = true; state.busy = true; state.stop = false; updateControls();
        notice('run-status', 'Importing. Keep this tab open.');
        try {
            const outcome = await I.runImport(state.items, state.options, state.client, {
                shouldStop: () => state.stop,
                onUpdate: item => {
                    state.page = Math.floor(state.items.indexOf(item) / pageSize); render();
                    notice('run-status', `Record ${item.record}: ${item.status === 'running' ? `creating ${item.stage || 'content'}…` : item.message}`);
                }
            });
            if (outcome === 'complete') notice('run-status', 'Import complete. Download your results before closing this tab.', 'success');
            else if (state.items.some(i => i.status === 'uncertain')) notice('run-status', 'Stopped: a request has an unknown outcome. Download the results and check the destination. Continuing is disabled to avoid duplicates. Start a new import only with content you have confirmed was not created.', 'warning');
            else notice('run-status', 'Import stopped. Review the row status and any retry delay. You can continue here; completed posts will be skipped and partial questions will receive only their missing answer. Download results before leaving this tab.', 'warning');
        } catch (error) { notice('run-status', error.message, 'danger'); }
        finally { state.busy = false; $('confirm').checked = false; render(); }
    });
    $('stop').addEventListener('click', () => { state.stop = true; updateControls(); notice('run-status', 'Stopping after the current request finishes. Completed posts are kept.'); });
    $('download-results').addEventListener('click', () => download('import-results.csv', I.resultsCSV(state.items)));
    $('previous').addEventListener('click', () => { state.page--; render(); });
    $('next').addEventListener('click', () => { state.page++; render(); });
    $('reset').addEventListener('click', () => {
        if (state.busy) return;
        if (!window.confirm('Have you downloaded the results? This clears progress. Importing the same CSV again will create duplicate posts.')) return;
        state.started = false; state.client = null; state.stop = false;
        $('token').value = ''; $('csv-file').value = ''; $('connection-status').hidden = true; clearPreview();
    });
    window.addEventListener('beforeunload', event => {
        if (state.started) { event.preventDefault(); event.returnValue = ''; }
    });
    configurationChanged();
})();
