---
name: start-dev
description: Start the Accelerate Robotics dev server with log tailing
---

# /start-dev

Starts the Express app in watch mode so it auto-restarts on `src/` changes.

## Command

```bash
npm run dev
```

## Expected output

```
[db] Seeded admin user: admin@acceleraterobotics.ai
[db] Added admin as notification recipient
[server] Accelerate Robotics running at http://localhost:3000
```

## If it doesn't start

- **Port in use** — `lsof -i :3000` to find the offender, or set `PORT=3001` in `.env`
- **Missing `.env`** — `cp .env.example .env` and fill it in
- **Database locked** — kill any other processes using `data/accelerate.db`
- **Missing module** — `npm install`
