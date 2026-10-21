# Stack Internal content import

**Use [index.html](index.html).** This is the supported version of the importer: a standalone browser page that uses **API v3 only** for questions, optional answers, and articles. Download the repository, then open `index.html` in a current browser. No Python, installation, build step, or CDN is required to run it.

The Python scripts and their dependencies are retained in [`legacy/`](legacy/) **for historical reference only**. They depend on API v2, which is being sunset, and should not be used for new imports.

## Getting started

1. [Download and unpack the repository](https://github.com/StackExchange/so4t_api_import/archive/refs/heads/main.zip). Open `index.html` in Chrome, Edge, Firefox, or Safari. You can also distribute just that HTML file; it includes all styles, scripts, and template downloads.
2. Enter your destination and an API v3 bearer access token with `write_access`. Use the raw token, without the `Bearer` prefix. A v2 API key is not used.
3. Click **Test connection**. This reads `/users/me`; it confirms authentication and browser read access, not permission to create every kind of content.
4. Choose **Questions & answers** or **Articles**, and whether to publish as the token owner or preserve authors. Download the matching template, fill it in, and select the CSV.
5. Click **Validate & preview**. Review all rows (use the page controls for larger files), expand content to inspect Markdown, check the destination, and confirm that you want to create the posts.
6. Click **Start import**. Keep the tab open, then **Download results** before closing it.

Imports create new posts. They do not update existing posts, detect duplicate content, or roll back posts that have already been created. Try a small representative file before importing a large collection.

## Destination and browser access

Accepted destinations include:

| Destination | API base used |
| --- | --- |
| `https://your-site.stackenterprise.co` | `https://your-site.stackenterprise.co/api/v3` |
| `https://stackoverflowteams.com/c/your-team` | `https://api.stackoverflowteams.com/v3/teams/your-team` |
| A full HTTPS URL ending in `/api/v3`, optionally `/teams/your-team` | The supplied base URL |
| `https://api.stackoverflowteams.com/v3/teams/your-team` | The supplied base URL |

The destination must support the v3 endpoints in the supplied schema. Endpoint availability, content-import enablement, and permissions can vary by deployment. Obtain the appropriate access token through your instance’s API application/authentication settings.

**Browser access depends on the API’s CORS configuration.** Opening a local HTML file usually gives it the origin `null`. A cross-origin API must allow the page’s origin, the `Authorization` and `Content-Type` headers, GET/POST methods, and the corresponding OPTIONS preflight. Error responses must also have the necessary CORS headers. To display rate-limit delays, the API must expose the `Retry-After` response header.

If your API does not allow local-file access, ask your administrator to serve this same HTML file on the API’s origin or an explicitly approved HTTPS origin. Serving it from localhost alone does **not** grant access to a remote API. Do not disable browser security or certificate validation, or send credentials through a public proxy. See [MDN’s CORS guidance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

The page works offline for validation and preview. Imports need network access. There is no backend or proxy bundled with this tool.

## CSV format

Use UTF-8 CSV with one header row and one content row per question or article. Blank lines are ignored. Commas, newlines, and double quotes inside a field require CSV quoting; escape a literal double quote as `""`. Markdown is sent as entered. Files are limited to 20 MB and 10,000 content rows.

Download empty templates from the page or use the valid examples in [`CSV Templates/`](CSV%20Templates/). These examples contain real sample rows, so replace them before importing. There are no explanatory rows to delete.

| Content | Columns |
| --- | --- |
| Questions | `title,body,tags,answer` |
| Questions with preserved authors | `title,asker_user_id,body,tags,answer,answerer_user_id` |
| Articles | `title,body,type,tags,expiration_date` |
| Articles with preserved authors | `title,author_user_id,body,type,tags,expiration_date` |

- `title` and `body` must be nonempty. The `tags` column is required; separate tag names with spaces. The destination enforces its own tag and content limits.
- `answer` is optional. Omit the column or leave it blank to import a question without an answer. Each row supports at most one answer.
- Article `type` is `knowledgeArticle`, `howToGuide`, `announcement`, or `policy`. Existing `knowledge-article` and `how-to-guide` values are converted to their v3 spellings.
- `expiration_date` is optional, in `YYYY-MM-DD` format, and only applies to announcements. The API evaluates expiration dates in UTC.
- For articles published as the token owner, choose **Article owner only** (default) or **Everyone** for editing permissions. The page sends the required v3 `permissions` object. Selecting individual editors is not supported by this UI.
- Local validation checks required fields, CSV structure, article types, dates, and author ID formats. Server-side rules and authorization are checked when posting; a valid preview is not a server dry run.

## Preserving authors with API v3

Choose **Preserve authors** to use the v3 `/content-import` endpoints. The token needs both `write_access` and `content_import`, the caller needs import permission, and the destination must have content import enabled. Ask your instance administrator if those endpoints are disabled or unavailable.

These endpoints display an **existing site user** as author. Use positive, site-scoped user IDs (the `id` returned by v3 user endpoints), **not account IDs**. Questions use `asker_user_id`; answers additionally require `answerer_user_id`; articles use `author_user_id`.

Legacy `*_account_id` columns are rejected rather than silently reassigned. Resolve the corresponding site user IDs and use a new author template. The HTML version does not exchange impersonation tokens or call API v2.

Author-preserving articles use the content-import route’s editing policy; that request model does not accept a `permissions` override. Content-import responses wrap the created `question`, `answer`, or `article` and include an `importId`. The results file retains those audit IDs alongside post IDs.

## Errors, stopping, and continuing

- Requests run sequentially. The importer stops on the first API error. It never automatically retries a POST.
- **Stop after current request** waits for the in-flight request to finish. Posts already created remain in the destination. If a question completes while stopping, its answer is left pending.
- **Continue remaining import** skips completed rows. If a question was created but its answer failed, it sends only the missing answer using the saved question ID.
- After a definite rejection (such as a readable 400, 401, 403, or 429), inspect the error. For rate limiting, wait for the displayed `Retry-After` delay before continuing; if the header is not exposed by CORS, consult the API’s rate-limit guidance. For expired credentials, replace the token and test the connection again. Destination and CSV settings are locked once an import starts.
- A timeout, network/CORS failure, server error, or unusable success response can leave the creation outcome unknown. The row is marked **Check destination**, and continuing is disabled. Download results and inspect the destination before preparing a new CSV containing only content confirmed not to exist. The API schema provides no idempotency key for these create operations.
- Progress is held only in memory. Reloading or closing the tab loses it. Results exports are for reconciliation, not automatic checkpoint restoration. After downloading results, **Start a new import** clears the token, file, and previous progress.

Credentials are sent in the bearer header only to the selected API. Requests omit cookies and reject redirects. The page stores no token in local storage, URLs, or result files, and includes no analytics or external scripts. Treat result files as private: they include titles and error details.

This tool imports text and Markdown references. It does not upload or migrate images, attachments, embedded files, historical timestamps, votes, or comments. Links to externally hosted assets remain references to those assets.

## Development

The checked-in `index.html` is the deliverable. Source files are in `src/`; `scripts/build.js` embeds the source and pinned, MIT-licensed **Stacks 3.0.2** CSS from `vendor/`. The UI uses Stacks forms, buttons, badges, notices, tables, and atomic layout classes, with a small layout stylesheet. No runtime package downloads occur.

With Node.js 20 or newer:

```sh
npm run build
npm test
```

No npm dependencies are needed for those commands. Tests cover CSV parsing, validation, endpoint/payload agreement with the supplied schema, both response shapes, optional answers, partial recovery, ambiguous outcomes, token redaction, and the generated artifact.

`schema/import-api-v3.json` is a transitive excerpt of the user-supplied API v3 schema: it includes only the operations and referenced models used by this importer. It is a test contract, not a runtime dependency or discovery mechanism.

An optional real-browser smoke suite is in `tests/browser-smoke.cjs`. Install Playwright in your development environment and make Chrome available, then run `node tests/browser-smoke.cjs`. You can set `PLAYWRIGHT_MODULE` to an absolute Playwright module path and `CHROME_PATH` to a Chrome executable. It uses a local HTTPS mock API, synthetic credentials, and a temporary self-signed test certificate generated with OpenSSL. No real community data is written.

The historical Python files and original templates in `legacy/` are deliberately unchanged and are not part of the supported runtime or test suite.
