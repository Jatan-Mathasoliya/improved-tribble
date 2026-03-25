# Vanta Repository

This repo currently ships one deployable service:
- `VantaHireWebsite/`: Node.js (Express API + Vite/React UI) backed by Postgres; optional Redis + GCS + SMTP.

## Run Locally (VantaHireWebsite)

```bash
npm install
createdb vantahire
npm --prefix VantaHireWebsite run db:push
npm run dev
```

## Deploy to Railway (VantaHireWebsite)

Recommended Railway setup:
- Service: `vantahire-web` (root directory: repo root or `VantaHireWebsite/`)
- Add-ons: Railway Postgres (required), Railway Redis (recommended)
- Start: `npm run start:web`
- Migrations (manual, safe to rerun): `npm run db:migrate`
- Health check: `GET /healthz`

### Deploy Button (template)

```md
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=YOUR_TEMPLATE_ID)
```

Create a Railway Template from this repo, then replace `YOUR_TEMPLATE_ID`.
