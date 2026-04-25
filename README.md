# SharePass

SharePass is a Next.js emotional support experience built around anonymous posting, gentle AI reflection, and a calm interface for difficult feelings.

## What Is Ready Now

- Responsive Next.js frontend with home feed, guided expression flow, AI chat, circles view, profile/privacy UI, and admin-aware layout
- Safer server-side AI integration through `/api/ai` instead of calling Anthropic directly from the browser
- Post publishing route at `/api/posts` with in-memory fallback and MongoDB-ready support
- Shared circle, user, and feedback APIs with MongoDB support and in-memory fallback
- Admin dashboard for approved email accounts to manage circles, users, and feedback
- Real Google OAuth route scaffolding with callback handling and session creation
- Local persistence for theme, privacy settings, and anonymous identity
- Git-ready repo hygiene with `.gitignore`, ESLint config, and env templates

## Local Setup

1. Install project dependencies:

```bash
npm install
```

2. Fill your local env file:

```bash
cp .env.example .env.local
```

3. Start development:

```bash
npm run dev
```

4. Validate before pushing:

```bash
npm run lint
npm run build
```

## Environment Variables

`AI_PROVIDER`
Set to `groq` now, or switch to `anthropic` later.

`GROQ_API_KEY`
Your Groq API key for live assistant and reflection responses.

`GROQ_MODEL`
The Groq model name used by SharePass. Example: `llama-3.1-8b-instant`.

`ANTHROPIC_API_KEY`
Optional for later. Your Anthropic API key if you switch providers.

`ANTHROPIC_MODEL`
Optional for later. The Anthropic model name you want to use.

`MONGODB_URI`
Your MongoDB connection string.

`MONGODB_DB`
The database name used by SharePass.

`MONGODB_COLLECTION_POSTS`
Optional override for the posts collection name. Default: `posts`.

`MONGODB_COLLECTION_CIRCLES`
Optional override for the circles collection name. Default: `circles`.

`MONGODB_COLLECTION_USERS`
Optional override for the users collection name. Default: `users`.

`MONGODB_COLLECTION_FEEDBACK`
Optional override for the feedback collection name. Default: `feedback`.

`NEXT_PUBLIC_SUPER_ADMIN_EMAILS`
Comma-separated admin email allowlist used for admin dashboard access.

`APP_URL`
Base app URL used to build the Google OAuth callback on the server.

`NEXT_PUBLIC_APP_URL`
Optional public app URL override used when resolving redirects.

`GOOGLE_CLIENT_ID`
Google OAuth web client ID used by the server-side auth flow.

`GOOGLE_CLIENT_SECRET`
Google OAuth web client secret used during code exchange.

`NEXT_PUBLIC_GOOGLE_CLIENT_ID`
Client-visible Google OAuth ID used to show the real Google sign-in option in the UI.

## Real-World Notes

- If Anthropic env vars are missing, SharePass switches to safe fallback responses instead of crashing.
- If MongoDB is not configured, posts, circles, users, and feedback still work in demo mode but are stored only in server memory.
- Real Google sign-in needs a Google OAuth web app with the callback URL set to `/auth/google/callback`.
- Admin access is currently email-allowlist based. For production, pair this with a trusted server session once your auth rollout is finalized.
- This repo is ready for GitHub, but secrets should stay only in `.env.local`.

## What To Add Next

- Harden server-side auth/session enforcement across all protected routes
- Real moderation workflows with rate limiting, abuse protection, and audit logs
- Crisis escalation flows with region-aware hotlines and clearer support pathways
- Persistent reactions, richer profile analytics, and broader cross-device sync
- Tests for API routes and critical UI flows
- SEO, Open Graph metadata, and deployment setup for Vercel or your preferred host
- Privacy policy, terms, and contributor docs before public launch
# sharepass-companion
