# SharePass

SharePass is a Next.js emotional support experience built around anonymous posting, gentle AI reflection, and a calm interface for difficult feelings.

## What Is Ready Now

- Responsive Next.js frontend with home feed, guided expression flow, AI chat, circles view, and profile/privacy UI
- Safer server-side AI integration through `/api/ai` instead of calling Anthropic directly from the browser
- Post publishing route at `/api/posts` with in-memory fallback and MongoDB-ready support
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

`ANTHROPIC_API_KEY`
Your Anthropic API key for live assistant and reflection responses.

`ANTHROPIC_MODEL`
The Anthropic model name you want to use.

`MONGODB_URI`
Your MongoDB connection string.

`MONGODB_DB`
The database name used by SharePass.

`MONGODB_COLLECTION_POSTS`
Optional override for the posts collection name. Default: `posts`.

## Real-World Notes

- If Anthropic env vars are missing, SharePass switches to safe fallback responses instead of crashing.
- If MongoDB is not configured, posts still work in demo mode but are stored only in server memory.
- This repo is ready for GitHub, but secrets should stay only in `.env.local`.

## What To Add Next

- Authentication or session-based anonymous identities so posts and privacy settings survive across devices
- Real moderation workflows with review queues, rate limiting, abuse protection, and audit logs
- Crisis escalation flows with region-aware hotlines and clearer support pathways
- Persistent reactions, circle membership, and profile analytics backed by the database
- Tests for API routes and critical UI flows
- SEO, Open Graph metadata, and deployment setup for Vercel or your preferred host
- Privacy policy, terms, and contributor docs before public launch
# sharepass-companion
