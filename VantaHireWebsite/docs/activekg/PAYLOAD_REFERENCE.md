# ActiveKG Payload Reference

Exact JSON payloads Vanta sends to each ActiveKG API endpoint, with response shapes.

All requests include:
- `Authorization: Bearer <RS256_JWT>` header
- `Content-Type: application/json` header
- Optional `X-Request-ID` header for tracing

---

## JWT Structure

Every outbound request carries a JWT signed with `VANTAHIRE_JWT_PRIVATE_KEY` (RS256).

### JWT Header

```json
{
  "alg": "RS256",
  "kid": "v1"
}
```

### JWT Payload (claims)

```json
{
  "tenant_id": "default",
  "scopes": "kg:write",
  "actor_type": "service",
  "iss": "vantahire",
  "sub": "vantahire-backend",
  "aud": "activekg",
  "iat": 1771472826,
  "exp": 1771473126,
  "jti": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Scopes change per endpoint:**

| Endpoint | Scope in JWT |
|---|---|
| `POST /nodes` | `kg:write` |
| `POST /edges` | `kg:write` |
| `GET /nodes/by-external-id` | `kg:write` |
| `POST /search` | `search:read` |
| `POST /ask` | `ask:read` |

---

## 1. Create Parent Node — `POST /nodes`

Creates the parent document node representing the full resume.

### Request

```json
{
  "classes": ["Document", "Resume"],
  "props": {
    "title": "Application Resume 42",
    "external_id": "vantahire:org_1:application:42:resume",
    "is_parent": true,
    "has_chunks": true,
    "resume_text": "John Doe\nSenior Software Engineer\n\nExperience:\n- 5 years at Acme Corp...\n[full extracted resume text]",
    "application_id": 42,
    "job_id": 7,
    "org_id": 1,
    "effective_recruiter_id": 3,
    "resume_source": "application"
  },
  "metadata": {
    "source": "vantahire",
    "org_id": 1,
    "job_id": 7,
    "application_id": 42,
    "resume_source": "application",
    "effective_recruiter_id": 3,
    "submitted_by_recruiter": false
  },
  "tenant_id": "default"
}
```

### Response (`201 Created`)

```json
{
  "id": "d4f7a8b2-1234-5678-9abc-def012345678",
  "status": "created",
  "external_id": "vantahire:org_1:application:42:resume"
}
```

### What each field means

| Field | Location | Purpose |
|---|---|---|
| `classes` | top-level | Node types — `Document` + `Resume` for parent |
| `external_id` | props | Deterministic ID for idempotent upserts: `vantahire:org_<orgId>:application:<appId>:resume` |
| `resume_text` | props | Full extracted resume text (what gets embedded by ActiveKG) |
| `is_parent` | props | Flags this as the parent node (not a chunk) |
| `has_chunks` | props | Indicates child chunk nodes will follow |
| `application_id` | props + metadata | Links back to Vanta application ID |
| `job_id` | props + metadata | Links back to Vanta job ID |
| `org_id` | props + metadata | Organization ID — used for search isolation with `metadata_filters` |
| `effective_recruiter_id` | props + metadata | Who the sync is attributed to |
| `source` | metadata | Always `"vantahire"` — distinguishes from other data sources in ActiveKG |
| `submitted_by_recruiter` | metadata | `true` if recruiter-add flow, `false` if candidate self-apply |
| `tenant_id` | top-level | ActiveKG tenant — `"default"` (shared) or `"org_<id>"` (org-scoped) |

**What is NOT sent:**
- No `gcs_path` or `resumeUrl` — only the extracted text
- No `resumeFilePath` or any file storage references
- No candidate PII beyond what's in the resume text itself

---

## 2. Create Chunk Node — `POST /nodes`

Each resume is split into ~8KB chunks (sentence-aware, with 500-char overlap). Each chunk becomes its own node.

### Request

```json
{
  "classes": ["Chunk", "Resume"],
  "props": {
    "text": "Experience:\n- Senior Software Engineer at Acme Corp (2021-2024)\n  Led team of 8 building distributed systems...\n[chunk text, ~8000 chars max]",
    "chunk_index": 0,
    "total_chunks": 3,
    "parent_id": "vantahire:org_1:application:42:resume",
    "parent_title": "Application Resume 42",
    "external_id": "vantahire:org_1:application:42:resume#chunk0",
    "application_id": 42,
    "job_id": 7,
    "org_id": 1,
    "effective_recruiter_id": 3
  },
  "metadata": {
    "source": "vantahire",
    "org_id": 1,
    "job_id": 7,
    "application_id": 42,
    "resume_source": "application",
    "effective_recruiter_id": 3,
    "submitted_by_recruiter": false
  },
  "tenant_id": "default"
}
```

### Response (`201 Created`)

```json
{
  "id": "a1b2c3d4-5678-9012-3456-789012345678"
}
```

### Chunk external_id format

```
Parent:  vantahire:org_1:application:42:resume
Chunk 0: vantahire:org_1:application:42:resume#chunk0
Chunk 1: vantahire:org_1:application:42:resume#chunk1
Chunk 2: vantahire:org_1:application:42:resume#chunk2
```

### Chunking parameters

| Env var | Default | Description |
|---|---|---|
| `ACTIVEKG_CHUNK_MAX_CHARS` | `8000` | Max characters per chunk |
| `ACTIVEKG_CHUNK_OVERLAP_CHARS` | `500` | Overlap between consecutive chunks |

The chunker prefers splitting at sentence boundaries (`.` `!` `?` followed by whitespace), then newlines, then spaces. Hard cuts only as a last resort.

---

## 3. Create Edge — `POST /edges`

Links each chunk back to its parent with a `DERIVED_FROM` relationship.

### Request

```json
{
  "src": "a1b2c3d4-5678-9012-3456-789012345678",
  "dst": "d4f7a8b2-1234-5678-9abc-def012345678",
  "rel": "DERIVED_FROM",
  "props": {
    "chunk_index": 0,
    "total_chunks": 3
  },
  "tenant_id": "default"
}
```

- `src` = chunk node UUID (from createNode response)
- `dst` = parent node UUID (from createNode response)
- `rel` = always `"DERIVED_FROM"`

### Response (`201 Created`)

```json
{
  "id": "e5f6a7b8-9012-3456-7890-123456789012",
  "src": "a1b2c3d4-5678-9012-3456-789012345678",
  "dst": "d4f7a8b2-1234-5678-9abc-def012345678",
  "rel": "DERIVED_FROM"
}
```

Duplicate edges return `409 Conflict` — the processor silently skips this (idempotent).

---

## 4. Get Node by External ID — `GET /nodes/by-external-id`

Idempotency check — looks up an existing node before creating a new one.

### Request

```
GET /nodes/by-external-id?external_id=vantahire:org_1:application:42:resume
Authorization: Bearer <JWT with scope kg:write>
```

### Response — Node exists (`200 OK`)

```json
{
  "id": "d4f7a8b2-1234-5678-9abc-def012345678",
  "external_id": "vantahire:org_1:application:42:resume",
  "classes": ["Document", "Resume"],
  "props": {
    "title": "Application Resume 42",
    "resume_text": "...",
    "application_id": 42,
    "job_id": 7,
    "org_id": 1
  },
  "metadata": {
    "source": "vantahire",
    "org_id": 1
  }
}
```

### Response — Node not found (`404`)

Empty/error body — the client returns `null`.

---

## 5. Search — `POST /search`

Semantic search over indexed nodes. Not used by the sync processor — available for future recruiter-facing features.

### Request

```json
{
  "query": "senior backend engineer with Kubernetes experience",
  "top_k": 20,
  "use_hybrid": true,
  "use_reranker": true,
  "metadata_filters": {
    "source": "vantahire",
    "org_id": 1
  }
}
```

JWT scope: `search:read`

### Response (`200 OK`)

```json
{
  "results": [
    {
      "id": "a1b2c3d4-5678-9012-3456-789012345678",
      "classes": ["Chunk", "Resume"],
      "props": {
        "text": "Senior Backend Engineer at CloudCo...",
        "external_id": "vantahire:org_1:application:42:resume#chunk0",
        "application_id": 42,
        "org_id": 1
      },
      "similarity": 0.89,
      "metadata": {
        "source": "vantahire",
        "org_id": 1
      }
    }
  ],
  "count": 1,
  "query": "senior backend engineer with Kubernetes experience",
  "search_mode": "hybrid"
}
```

### Important: org isolation

With `shared` tenant strategy, all orgs share the `"default"` tenant. Isolation at query time via `metadata_filters.org_id`:

```json
{
  "metadata_filters": { "org_id": 1 }
}
```

With `org_scoped` strategy, each org gets its own tenant (`"org_1"`, `"org_2"`, ...) — no metadata filter needed.

---

## 6. Ask — `POST /ask`

RAG-style question answering over the knowledge graph. Not used by the sync processor — available for future features.

### Request

```json
{
  "question": "What candidates have experience with distributed systems?",
  "max_results": 5,
  "tenant_id": "default"
}
```

JWT scope: `ask:read`

### Response (`200 OK`)

```json
{
  "answer": "Based on the indexed resumes, the following candidates have distributed systems experience...",
  "confidence": 0.85,
  "citations": [
    {
      "node_id": "a1b2c3d4-5678-9012-3456-789012345678",
      "text": "Led team of 8 building distributed systems...",
      "similarity": 0.92
    }
  ]
}
```

---

## Complete Sync Sequence (for one application)

Here's the full sequence of API calls for a single resume sync:

```
1. GET  /nodes/by-external-id?external_id=vantahire:org_1:application:42:resume
   → 404 (not found, proceed to create)

2. POST /nodes  (parent: Document+Resume, with full resume_text)
   → 201, id = "parent-uuid"

3. GET  /nodes/by-external-id?external_id=vantahire:org_1:application:42:resume#chunk0
   → 404

4. POST /nodes  (chunk 0: Chunk+Resume, with chunk text)
   → 201, id = "chunk0-uuid"

5. POST /edges  (chunk0-uuid → parent-uuid, DERIVED_FROM)
   → 201

6. GET  /nodes/by-external-id?external_id=vantahire:org_1:application:42:resume#chunk1
   → 404

7. POST /nodes  (chunk 1: Chunk+Resume)
   → 201, id = "chunk1-uuid"

8. POST /edges  (chunk1-uuid → parent-uuid, DERIVED_FROM)
   → 201

... repeat for each chunk ...
```

If any step 404s → create. If any step finds existing → skip create. This makes the entire flow **idempotent** — safe to retry.
