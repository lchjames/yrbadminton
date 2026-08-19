# YR Badminton — D1 + Monday automation

Fresh D1-only rebuild.

## Weekly automation

Cloudflare Cron runs at `14:05 UTC every Sunday`, which is `00:05 Monday` in Brisbane.

On each run it:
1. closes past/open sessions;
2. finds the next Sunday;
3. if that Sunday already exists, opens it;
4. otherwise creates it using settings defaults and opens it;
5. closes all other currently-open sessions.

The DB has a unique index on `(event_date, start_time, venue)` so duplicate court/session creation is prevented.

## Setup

```bash
npm install
npm run db:init:remote
npx wrangler secret put ADMIN_KEY
npm run deploy
```

Health check:

```text
https://YOUR-WORKER-DOMAIN/api/?action=health
```

Expected:

```json
{"ok":true,"database":"connected"}
```

## D1 binding

- binding: `DB`
- name: `yr-badminton`
- id: `4d0995bf-8b3e-4e7b-8c8d-ac9dbcc2745d`

## Current rules

- Sunday only
- Default 17:00–19:00
- Goodminton
- Capacity 26
- YES / NO only in DB
- MAYBE is UI-only
- No waitlist
- Same name + same session updates the booking
- Session deletion cascades to bookings
- History stays in D1
