# VantaHire Deployment Guide

## Railway Deployment

### Prerequisites
- Railway account
- PostgreSQL database provisioned on Railway
- Redis service (optional, for async AI fit scoring queue)

### Steps

1. **Connect Repository**
   - Go to Railway dashboard
   - Click "New Project" → "Deploy from GitHub repo"
   - Select this repository

2. **Add PostgreSQL Database**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will automatically set `DATABASE_URL` environment variable

3. **Set Environment Variables**
   Required variables:
   ```
   DATABASE_URL=<automatically set by Railway>
   SESSION_SECRET=<generate a strong random string>
   NODE_ENV=production
   ```

   Optional variables (see `.env.example` for full list):
   ```
   CLOUDINARY_CLOUD_NAME=<your-value>
   CLOUDINARY_API_KEY=<your-value>
   CLOUDINARY_API_SECRET=<your-value>
   GROQ_API_KEY=<your-value>
   AI_QUEUE_ENABLED=true
   REDIS_URL=<your-redis-url>
   AI_WORKER_INTERACTIVE_CONCURRENCY=2
   AI_WORKER_BATCH_CONCURRENCY=1
   GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account-json>
   ```

4. **Deploy**
   - Railway will automatically build and deploy
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`

5. **Run Database Migrations**
   - After first deployment, run: `npm run db:push`
   - This creates the database tables

6. **Enable AI Queue Worker (Optional)**
   - Add a Redis service and set `REDIS_URL`
   - Create a separate Railway service for the worker
   - Start command: `npm run start:ai-worker`
   - Set `AI_QUEUE_ENABLED=true` on both web and worker services
   - Set `GROQ_API_KEY` and `GOOGLE_APPLICATION_CREDENTIALS` on the worker

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway) |
| `SESSION_SECRET` | Yes | Secret key for session encryption |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Auto-set by Railway (defaults to 5000) |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name for file uploads |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `GROQ_API_KEY` | No | Groq API key for AI job analysis (get free at https://console.groq.com) |
| `AI_QUEUE_ENABLED` | No | Enables async AI fit scoring queue |
| `REDIS_URL` | No | Redis connection string for AI queue |
| `AI_WORKER_INTERACTIVE_CONCURRENCY` | No | Worker concurrency for single-item jobs (default 2) |
| `AI_WORKER_BATCH_CONCURRENCY` | No | Worker concurrency for batch jobs (default 1) |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Service account JSON path for resume downloads in the worker |
| `NOTIFICATION_EMAIL` | No | Email for system notifications |

## Verifying Deployment

Once deployed:
1. Visit your Railway-provided URL
2. Check that the homepage loads
3. Try registering a new account
4. Verify database connection is working

## Local Async Queue Test (Optional)

Prereqs: Redis running locally.

```bash
REDIS_URL=redis://localhost:6379 \
AI_QUEUE_ENABLED=true \
npm --prefix VantaHireWebsite test -- test/integration/asyncQueue.test.ts
```

## Troubleshooting

### Build fails
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility

### App crashes on startup
- Check Railway logs: `railway logs`
- Verify `DATABASE_URL` is set correctly
- Ensure `SESSION_SECRET` is set

### Database connection errors
- Verify PostgreSQL service is running
- Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
