# 🛡️ API Rate Limiting & Abuse Prevention System

A production-ready Node.js API with **Sliding Window** rate limiting, JWT authentication, **Redis-based state storage**, and progressive abuse prevention.

---

## 📋 Tech Stack

| Layer        | Technology              |
|--------------|-------------------------|
| Runtime      | Node.js                 |
| Framework    | Express.js              |
| Database     | MongoDB (via Mongoose)  |
| Cache/State  | **Redis (ioredis)**     |
| Auth         | JWT (jsonwebtoken)      |
| Password     | bcryptjs                |
| Logging      | Winston                 |

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- **Redis** (local — `sudo apt install redis-server`)

### 2. Install

```bash
npm install
```

### 3. Configure Environment

Edit `.env`:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/rate_limiter_db
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=24h

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Rate Limits
FREE_USER_LIMIT=100
PAID_USER_LIMIT=1000
IP_LIMIT=200
LOGIN_ENDPOINT_LIMIT=10
REPORTS_ENDPOINT_LIMIT=20

# Abuse Prevention
MAX_VIOLATIONS_BEFORE_BLOCK=3
BLOCK_DURATION_FIRST=300
BLOCK_DURATION_SECOND=900

# Whitelisted IPs (comma-separated) — leave empty for local testing
WHITELISTED_IPS=

# Blacklisted IPs (comma-separated)
BLACKLISTED_IPS=
```

### 4. Start Services

```bash
# Start MongoDB
sudo systemctl start mongod

# Start Redis
sudo systemctl start redis

# Verify Redis
redis-cli ping   # Should return: PONG
```

### 5. Seed Test Users

```bash
node seed.js
```

Creates 4 test users:

| Username | Email | Password | Role |
|----------|-------|----------|------|
| admin_user | admin@example.com | Admin@123 | admin |
| paid_user | paid@example.com | Paid@1234 | paid |
| free_user | free@example.com | Free@1234 | free |
| tenant_user | tenant@example.com | Tenant@123 | paid |

### 6. Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3000`

Expected startup output:
```
✅ Redis connected
🚀 Server running on http://localhost:3000
📋 Rate limiting algorithm: Sliding Window
🔐 JWT Authentication enabled
🛡️  Abuse prevention: Progressive blocking enabled
✅ MongoDB Connected: localhost
```

---

## 🔐 Authentication

All protected routes require a **Bearer JWT** in the Authorization header:

```
Authorization: Bearer <token>
```

Get a token via `POST /api/auth/login`.

JWT payload contains:
- `userId`
- `role` (free | paid | admin)
- `tenantId` (optional)

---

## ⚡ Rate Limiting Rules

### Algorithm: Sliding Window (Redis Sorted Sets)

Tracks exact timestamps of requests within a rolling time window (default: 60 seconds) using **Redis Sorted Sets**. More accurate than fixed-window — prevents burst exploitation at window boundaries. Redis provides in-memory speed for high-throughput rate limiting.

### Per-User Limits

| Role      | Limit           |
|-----------|-----------------|
| free      | 100 req/min     |
| paid      | 1,000 req/min   |
| admin     | **Unlimited**   |

### Per-IP Limit
- **200 requests/minute** per IP address
- Applies even if the user is authenticated

### Per-Endpoint Limits

| Endpoint             | Limit      |
|----------------------|------------|
| POST /api/auth/login | 10 req/min |
| GET /api/reports     | 20 req/min |

---

## 🚨 Abuse Prevention

### Temporary Blocking (Progressive) — Stored in Redis

When a user/IP exceeds the limit **3 times**:

| Block #  | Duration           |
|----------|--------------------|
| 1st      | 5 minutes  (300s)  |
| 2nd+     | 15 minutes (900s)  |

Block state is stored in Redis with TTL — auto-expires when block duration ends.

### Whitelisting
- Admin users bypass per-user rate limits
- IPs in `WHITELISTED_IPS` (env) skip all rate limits

### Blacklisting
- IPs in `BLACKLISTED_IPS` (env) receive `403 Forbidden`
- Admins can add IPs at runtime via `POST /api/admin/blacklist`

---

## 📡 Response Headers

Every rate-limited response includes:

```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 94
X-RateLimit-Reset:     1735000060
```

When limit exceeded (`429 Too Many Requests`):

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 30
}
```

When blocked:
```json
{
  "error": "You are temporarily blocked due to repeated violations",
  "retryAfter": 300
}
```

---

## 📚 API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/`      | API info & rate limit summary |
| GET    | `/health`| Health check |
| POST   | `/api/auth/register` | Register new user |
| POST   | `/api/auth/login`    | Login (10 req/min) |

### Protected (requires Bearer JWT)

| Method | Endpoint        | Description                        |
|--------|-----------------|------------------------------------|
| GET    | `/api/profile`  | Get current user profile           |
| GET    | `/api/reports`  | Reports (20 req/min endpoint limit)|
| GET    | `/api/data`     | Generic protected data             |
| POST   | `/api/data`     | Create data                        |

### Admin only

| Method | Endpoint                   | Description              |
|--------|----------------------------|--------------------------|
| GET    | `/api/admin/audit-logs`    | View all audit logs      |
| GET    | `/api/admin/rate-limits`   | View rate limit state    |
| DELETE | `/api/admin/block/:key`    | Unblock a user/IP        |
| POST   | `/api/admin/blacklist`     | Blacklist an IP at runtime |

---

## 🧪 Testing

### Step 1 — Get Tokens

```bash
# Free user token
FREE_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"free@example.com","password":"Free@1234"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Paid user token
PAID_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"paid@example.com","password":"Paid@1234"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Admin token
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### Step 2 — Free User Rate Limit (100 req/min)

```bash
redis-cli flushdb
for i in $(seq 1 110); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/data \
    -H "Authorization: Bearer $FREE_TOKEN")
  echo "Request $i: $STATUS"
  [ "$STATUS" == "429" ] && echo "❌ BLOCKED at $i!" && break
done
# Expected: blocked at request 101
```

### Step 3 — Paid User Rate Limit (1000 req/min)

```bash
redis-cli flushdb
for i in $(seq 1 1010); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/data \
    -H "Authorization: Bearer $PAID_TOKEN")
  echo "Request $i: $STATUS"
  [ "$STATUS" == "429" ] && echo "❌ BLOCKED at $i!" && break
done
# Expected: blocked at request 1001
```

### Step 4 — IP Rate Limit (200 req/min) — Use Admin token

```bash
redis-cli flushdb
for i in $(seq 1 210); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/data \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  echo "Request $i: $STATUS"
  [ "$STATUS" == "429" ] && echo "❌ IP BLOCKED at $i!" && break
done
# Expected: blocked at request 201
```

### Step 5 — Login Endpoint Limit (10 req/min)

```bash
redis-cli flushdb
for i in $(seq 1 13); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"free@example.com","password":"Free@1234"}')
  echo "Attempt $i: $STATUS"
  [ "$STATUS" == "429" ] && echo "❌ BLOCKED at $i!" && break
done
# Expected: blocked at attempt 11
```

### Step 6 — Reports Endpoint Limit (20 req/min)

```bash
redis-cli flushdb
for i in $(seq 1 23); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/reports \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  echo "Request $i: $STATUS"
  [ "$STATUS" == "429" ] && echo "❌ BLOCKED at $i!" && break
done
# Expected: blocked at request 21
```

### Step 7 — Progressive Blocking Test

```bash
redis-cli flushdb
# After 3 violations, user gets blocked for 5 minutes (retryAfter: 300)
for violation in 1 2 3; do
  echo "--- Violation $violation ---"
  sleep 62
  for i in $(seq 1 110); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/data \
      -H "Authorization: Bearer $FREE_TOKEN")
    if [ "$STATUS" == "429" ]; then
      curl -s http://localhost:3000/api/data -H "Authorization: Bearer $FREE_TOKEN"
      break
    fi
  done
done
# Expected: after violation 1 → {"error":"You are temporarily blocked...","retryAfter":300}
```

### Step 8 — Blacklist IP

```bash
# Blacklist an IP
curl -s -X POST http://localhost:3000/api/admin/blacklist \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip":"::1"}'

# Verify — should get 403
curl -s http://localhost:3000/health
# Expected: {"error":"Access denied"}

# To unblacklist: restart the server (runtime-only blacklist)
```

### Step 9 — Audit Logs

```bash
curl -s http://localhost:3000/api/admin/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print('Total logs:', data['total'])"
# Expected: thousands of logs from all tests
```

### ✅ Test Results Summary

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Free User Limit | 100 pe block | 101 pe block | ✅ Pass |
| Paid User Limit | 1000 pe block | 1001 pe block | ✅ Pass |
| IP Rate Limit | 200 pe block | 201 pe block | ✅ Pass |
| Login Endpoint | 10 pe block | 11 pe block | ✅ Pass |
| Reports Endpoint | 20 pe block | 21 pe block | ✅ Pass |
| Progressive Block | retryAfter:300 | retryAfter:300 | ✅ Pass |
| Blacklist IP | 403 Access denied | 403 Access denied | ✅ Pass |
| Audit Logs | Logs stored | 4185+ logs | ✅ Pass |
| Redis Storage | Block in Redis | Confirmed | ✅ Pass |
| X-RateLimit Headers | Headers present | Headers present | ✅ Pass |

---

## 🏗️ Architecture

```
src/
├── app.js                    # Express entry point
├── config/
│   └── database.js           # MongoDB connection
├── middleware/
│   ├── auth.js               # JWT authentication middleware
│   └── rateLimiter.js        # Sliding window (Redis) + blocking logic
├── models/
│   ├── User.js               # User schema
│   ├── AuditLog.js           # Audit log schema (auto-expires 30d)
│   └── RateLimit.js          # Rate limit model (legacy - not used for state)
├── routes/
│   ├── auth.js               # /api/auth/*
│   └── api.js                # /api/* (protected)
└── utils/
    └── logger.js             # Winston logger
logs/
├── combined.log
└── error.log
seed.js                       # Test data seeder
```

### Redis Key Structure

| Key Pattern | Purpose |
|-------------|---------|
| `user:<userId>` | Sliding window timestamps (Sorted Set) |
| `ip:<ipAddress>` | IP sliding window timestamps (Sorted Set) |
| `endpoint:<method>:<path>:<ip>` | Endpoint sliding window (Sorted Set) |
| `violations:<key>` | Violation counter (expires with window) |
| `blocked:<key>` | Block flag with TTL (auto-expires) |
| `blockcount:<key>` | Total block count for progressive penalty |

---

## 📊 Audit Logging

Every request is logged to MongoDB (`AuditLog` collection) with:
- `userId` — authenticated user (if any)
- `ip` — client IP
- `endpoint` — request path
- `method` — HTTP method
- `statusCode` — response status
- `limitExceededReason` — why the request was blocked (if applicable)
- `timestamp` — request time

Logs auto-expire after **30 days** via MongoDB TTL index.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/rate_limiter_db` | MongoDB connection |
| `JWT_SECRET` | — | JWT signing secret (required) |
| `JWT_EXPIRES_IN` | `24h` | Token expiry |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password (if any) |
| `FREE_USER_LIMIT` | 100 | Free user req/min |
| `PAID_USER_LIMIT` | 1000 | Paid user req/min |
| `IP_LIMIT` | 200 | Per-IP req/min |
| `LOGIN_ENDPOINT_LIMIT` | 10 | Login endpoint req/min |
| `REPORTS_ENDPOINT_LIMIT` | 20 | Reports endpoint req/min |
| `MAX_VIOLATIONS_BEFORE_BLOCK` | 3 | Violations before blocking |
| `BLOCK_DURATION_FIRST` | 300 | First block duration (seconds) |
| `BLOCK_DURATION_SECOND` | 900 | Subsequent block duration (seconds) |
| `WHITELISTED_IPS` | — | Comma-separated whitelisted IPs |
| `BLACKLISTED_IPS` | — | Comma-separated blacklisted IPs |