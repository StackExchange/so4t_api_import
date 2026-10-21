# API v3 import contract

`import-api-v3.json` is an excerpt of the supplied `swagger.json` (Stack Internal Community API v3), captured for this migration on 2026-10-21. It contains the GET `/users/me` operation, the six POST operations used for normal and author-preserving imports, their team-prefixed equivalents, and all transitively referenced schemas.

Endpoint request models, enums, security requirements, and response envelopes are unchanged from the supplied schema. Unused endpoints and the environment-specific server base were omitted. The authentication URLs describe the schema's originating instance; the application takes its destination and bearer token from the user and does not implement OAuth authorization itself.

Tests validate generated payloads against this excerpt. Runtime deployment availability, permissions, and CORS still need to be checked on the target community.
