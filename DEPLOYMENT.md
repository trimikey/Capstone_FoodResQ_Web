# FoodResQ Production Deployment

This repo deploys as two public services:

- `apps/web`: Next.js web app on Vercel.
- `apps/api`: NestJS API on Render.

Do not use `localhost` or LAN IPs in production environment variables.

## 1. API on Render

1. Push the repo to GitHub.
2. In Render, create a Blueprint from this repo.
3. Render reads `render.yaml` and creates the `foodresq-api` web service.
4. Fill the environment variables listed in `apps/api/.env.production.example`.
5. Deploy the service.
6. Verify:

```text
https://<api-service-domain>/api/v1/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "foodresq-api"
  }
}
```

Run database migrations against Supabase before the first production deploy, or whenever migrations change:

```bash
pnpm --filter @foodresq/api exec prisma migrate deploy
```

Use `DIRECT_URL` for migrations. Use the pooled `DATABASE_URL` for runtime.

## 2. Web on Vercel

1. Import the same GitHub repo into Vercel.
2. Set the Vercel project Root Directory to:

```text
apps/web
```

3. Vercel reads `apps/web/vercel.json`.
4. Fill the environment variables listed in `apps/web/.env.production.example`.
5. Set:

```env
NEXT_PUBLIC_API_URL=https://<api-service-domain>/api/v1
NEXTAUTH_URL=https://<web-service-domain>
```

6. Deploy.

## 3. Connect API CORS to Web

After Vercel gives you the final web URL, update Render:

```env
ALLOWED_ORIGINS=https://<web-service-domain>
```

If you use preview deployments, add those preview origins explicitly. Do not use `*` in production.

## 4. Production Notes

- Redis must be reachable from Render. Use Upstash `rediss://...:6379`.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `NEXTAUTH_SECRET` must be strong random values.
- Uploaded images are currently stored on the API filesystem under `/uploads`. For durable production uploads, move storage to S3 or Cloudflare R2.
- The API must be deployed before the web build uses the final `NEXT_PUBLIC_API_URL`.
