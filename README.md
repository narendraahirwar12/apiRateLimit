# 🛡️ API Rate Limiting & Abuse Prevention System — MVC Branch

A production-ready Node.js API with **Sliding Window** rate limiting, JWT authentication, **Redis-based state storage**, and progressive abuse prevention — structured using the **MVC (Model-View-Controller)** pattern.

---

## 📋 Tech Stack

| Layer       | Technology             |
|-------------|------------------------|
| Runtime     | Node.js                |
| Framework   | Express.js             |
| Database    | MongoDB (via Mongoose) |
| Cache/State | **Redis (ioredis)**    |
| Auth        | JWT (jsonwebtoken)     |
| Password    | bcryptjs               |
| Logging     | Winston                |

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- **Redis** (local — `sudo apt install redis-server`)

### 2. Clone & Switch Branch

```bash
git clone <repo-url>
cd apiRateLimit
git checkout mvc
```

### 3. Install

```bash
npm install
```

### 4. Configure Environment

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

### 5. Start Services

```bash
# Start MongoDB
sudo systemctl start mongod

# Start Redis
sudo systemctl start redis

# Verify Redis
redis-cli ping   # Should return: PONG
```

### 6. Seed Test Users

```bash
node migrations/0001_seed.js
```

Creates 4 test users:

| Username    | Email                 | Password    | Role  |
|-------------|-----------------------|-------------|-------|
| admin_user  | admin@example.com     | Admin@123   | admin |
| paid_user   | paid@example.com      | Paid@1234   | paid  |
| free_user   | free@example.com      | Free@1234   | free  |
| tenant_user | tenant@example.com    | Tenant@123  | paid  |

### 7. Run

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

Tracks exact timestamps of requests within a rolling time window (default: 60 seconds) using **Redis Sorted Sets**. More accurate than fixed-window — prevents burst exploitation at window boundaries.

### Per-User Limits

| Role  | Limit         |
|-------|---------------|
| free  | 100 req/min   |
| paid  | 1,000 req/min |
| admin | **Unlimited** |

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

| Block # | Duration          |
|---------|-------------------|
| 1st     | 5 minutes  (300s) |
| 2nd+    | 15 minutes (900s) |

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

| Method | Endpoint             | Description                   |
|--------|----------------------|-------------------------------|
| GET    | `/`                  | API info & rate limit summary |
| GET    | `/health`            | Health check                  |
| POST   | `/api/auth/register` | Register new user             |
| POST   | `/api/auth/login`    | Login (10 req/min)            |

### Protected (requires Bearer JWT)

| Method | Endpoint        | Description                         |
|--------|-----------------|-------------------------------------|
| GET    | `/api/profile`  | Get current user profile            |
| GET    | `/api/reports`  | Reports (20 req/min endpoint limit) |
| GET    | `/api/data`     | Generic protected data              |
| POST   | `/api/data`     | Create data                         |

### Admin Only

| Method | Endpoint                 | Description                |
|--------|--------------------------|----------------------------|
| GET    | `/api/admin/audit-logs`  | View all audit logs        |
| GET    | `/api/admin/rate-limits` | View rate limit state      |
| DELETE | `/api/admin/block/:key`  | Unblock a user/IP          |
| POST   | `/api/admin/blacklist`   | Blacklist an IP at runtime |

---

## 🧪 Testing

### Step 1 — Get All Tokens

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

echo "FREE:  $FREE_TOKEN"
echo "PAID:  $PAID_TOKEN"
echo "ADMIN: $ADMIN_TOKEN"
```

---

### Step 2 — Auth Tests

**Register a new user:**
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test@1234"}'
# Expected (201): { "message": "User registered successfully", "token": "eyJ...", "user": {...} }
```

**Register with paid role:**
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"paiduser2","email":"paid2@example.com","password":"Paid@1234","role":"paid"}'
```

**Duplicate email — conflict test:**
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test@1234"}'
# Expected (409): { "error": "Username or email already exists" }
```

**Missing fields — validation test:**
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"nopassword@example.com"}'
# Expected (400): { "error": "username, email, and password are required" }
```

**Wrong password:**
```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"WrongPassword"}'
# Expected (401): { "error": "Invalid email or password" }
```

---

### Step 3 — Free User Tests

**Get profile:**
```bash
curl -s http://localhost:3000/api/profile \
  -H "Authorization: Bearer $FREE_TOKEN"
# Expected (200): { "message": "User profile", "user": { "role": "free", ... } }
```

**Get data:**
```bash
curl -s http://localhost:3000/api/data \
  -H "Authorization: Bearer $FREE_TOKEN"
# Expected (200): { "message": "Protected data", ... }
```

**Post data:**
```bash
curl -s -X POST http://localhost:3000/api/data \
  -H "Authorization: Bearer $FREE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Free User Record","value":10}'
# Expected (201): { "message": "Data created", "payload": {...}, "createdBy": { "role": "free", ... } }
```

**Get reports:**
```bash
curl -s http://localhost:3000/api/reports \
  -H "Authorization: Bearer $FREE_TOKEN"
# Expected (200): { "message": "Reports data", "data": [...] }
```

**Check rate limit headers (limit should be 100):**
```bash
curl -s -I http://localhost:3000/api/data \
  -H "Authorization: Bearer $FREE_TOKEN" | grep -i "x-ratelimit"
# Expected:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
# X-RateLimit-Reset: ...
```

**Free user cannot access admin routes:**
```bash
curl -s http://localhost:3000/api/admin/audit-logs \
  -H "Authorization: Bearer $FREE_TOKEN"
# Expected (403): { "error": "Admin access required" }
```

**Free user rate limit test (100 req/min):**
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

---

### Step 4 — Paid User Tests

**Get profile (verify role is "paid"):**
```bash
curl -s http://localhost:3000/api/profile \
  -H "Authorization: Bearer $PAID_TOKEN"
# Expected (200): { "message": "User profile", "user": { "role": "paid", ... } }
```

**Get data:**
```bash
curl -s http://localhost:3000/api/data \
  -H "Authorization: Bearer $PAID_TOKEN"
# Expected (200): { "message": "Protected data", "user": { "role": "paid", ... } }
```

**Post data:**
```bash
curl -s -X POST http://localhost:3000/api/data \
  -H "Authorization: Bearer $PAID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Paid User Record","value":999}'
# Expected (201): { "message": "Data created", "payload": {...}, "createdBy": { "role": "paid", ... } }
```

**Get reports:**
```bash
curl -s http://localhost:3000/api/reports \
  -H "Authorization: Bearer $PAID_TOKEN"
# Expected (200): { "message": "Reports data", "data": [...] }
```

**Check rate limit headers (limit should be 1000):**
```bash
curl -s -I http://localhost:3000/api/data \
  -H "Authorization: Bearer $PAID_TOKEN" | grep -i "x-ratelimit"
# Expected:
# X-RateLimit-Limit: 1000
# X-RateLimit-Remaining: 999
# X-RateLimit-Reset: ...
```

**Paid user cannot access admin routes:**
```bash
curl -s http://localhost:3000/api/admin/audit-logs \
  -H "Authorization: Bearer $PAID_TOKEN"
# Expected (403): { "error": "Admin access required" }
```

**Paid user rate limit test (1000 req/min):**
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

---

### Step 5 — Admin User Tests

**Get profile (verify role is "admin"):**
```bash
curl -s http://localhost:3000/api/profile \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected (200): { "message": "User profile", "user": { "role": "admin", ... } }
```

**Get data:**
```bash
curl -s http://localhost:3000/api/data \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected (200): { "message": "Protected data", "user": { "role": "admin", ... } }
```

**Post data:**
```bash
curl -s -X POST http://localhost:3000/api/data \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Admin Record","value":1}'
# Expected (201): { "message": "Data created", "payload": {...}, "createdBy": { "role": "admin", ... } }
```

**View audit logs:**
```bash
curl -s http://localhost:3000/api/admin/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print('Total logs:', data['total'])"
# Expected: Total logs: <number>
```

**Audit logs with pagination:**
```bash
curl -s "http://localhost:3000/api/admin/audit-logs?limit=5&page=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Filter audit logs by IP:**
```bash
curl -s "http://localhost:3000/api/admin/audit-logs?ip=::1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**View rate limit state:**
```bash
curl -s http://localhost:3000/api/admin/rate-limits \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected (200): { "count": <n>, "records": [...] }
```

**Blacklist an IP:**
```bash
curl -s -X POST http://localhost:3000/api/admin/blacklist \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip":"10.0.0.5"}'
# Expected (200): { "message": "IP 10.0.0.5 blacklisted", "blacklist": ["10.0.0.5"] }
```

**Unblock a user or IP:**
```bash
# By IP key
curl -s -X DELETE "http://localhost:3000/api/admin/block/ip%3A10.0.0.5" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected (200): { "message": "Block removed for key: ip:10.0.0.5" }

# By user ID key (replace <userId> with actual MongoDB ObjectId)
curl -s -X DELETE "http://localhost:3000/api/admin/block/user%3A<userId>" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected (200): { "message": "Block removed for key: user:<userId>" }
```

**Admin rate limit stress test (unlimited — no 429):**
```bash
redis-cli flushdb
for i in $(seq 1 20); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/data \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  echo "Request $i: $STATUS"
done
# Expected: all 20 requests return HTTP 200
```

---

### Step 6 — IP Rate Limit Test (200 req/min) — Use Admin Token

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

---

### Step 7 — Login Endpoint Limit (10 req/min)

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

---

### Step 8 — Reports Endpoint Limit (20 req/min)

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

---

### Step 9 — Progressive Blocking Test

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
# Expected: after violation 3 → {"error":"You are temporarily blocked...","retryAfter":300}
```

---

### Step 10 — Blacklist IP Test

```bash
# Blacklist localhost IP
curl -s -X POST http://localhost:3000/api/admin/blacklist \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip":"::1"}'

# Verify — should get 403
curl -s http://localhost:3000/health
# Expected: { "error": "Access denied" }

# To unblacklist: restart the server (runtime-only blacklist)
```

---

### Step 11 — Compare All Three Roles Side by Side

```bash
echo "--- Free User (limit: 100) ---"
curl -s -I http://localhost:3000/api/data \
  -H "Authorization: Bearer $FREE_TOKEN" | grep -i "x-ratelimit-limit"

echo "--- Paid User (limit: 1000) ---"
curl -s -I http://localhost:3000/api/data \
  -H "Authorization: Bearer $PAID_TOKEN" | grep -i "x-ratelimit-limit"

echo "--- Admin User (unlimited) ---"
curl -s -I http://localhost:3000/api/data \
  -H "Authorization: Bearer $ADMIN_TOKEN" | grep -i "x-ratelimit-limit"

# Expected Output:
# --- Free User (limit: 100) ---
# X-RateLimit-Limit: 100
# --- Paid User (limit: 1000) ---
# X-RateLimit-Limit: 1000
# --- Admin User (unlimited) ---
# (no rate limit header — admin bypasses limiter)
```

---

### Step 12 — Audit Logs After All Tests

```bash
curl -s http://localhost:3000/api/admin/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print('Total logs:', data['total'])"
# Expected: large number of logs from all tests above
```

---

### Step 13 — Unauthorized & Edge Case Tests

**No token:**
```bash
curl -s http://localhost:3000/api/profile
# Expected (401): { "error": "No token provided" }
```

**Invalid token:**
```bash
curl -s http://localhost:3000/api/profile \
  -H "Authorization: Bearer invalidtokenhere"
# Expected (401): { "error": "Invalid token" }
```

**404 route:**
```bash
curl -s http://localhost:3000/api/nonexistent
# Expected (404): { "error": "Route GET /api/nonexistent not found" }
```

**Health check:**
```bash
curl -s http://localhost:3000/health
# Expected (200): { "status": "ok", "timestamp": "...", "service": "API Rate Limiter" }
```

**Root endpoint:**
```bash
curl -s http://localhost:3000/
# Expected (200): { "message": "API Rate Limiting & Abuse Prevention System", "endpoints": {...}, "rateLimits": {...} }
```

---

### ✅ Test Results Summary

| Test                   | Expected             | Status  |
|------------------------|----------------------|---------|
| Free User Limit        | Block at req 101     | ✅ Pass |
| Paid User Limit        | Block at req 1001    | ✅ Pass |
| Admin Unlimited        | No block             | ✅ Pass |
| IP Rate Limit          | Block at req 201     | ✅ Pass |
| Login Endpoint         | Block at attempt 11  | ✅ Pass |
| Reports Endpoint       | Block at req 21      | ✅ Pass |
| Progressive Block      | retryAfter: 300      | ✅ Pass |
| Blacklist IP           | 403 Access denied    | ✅ Pass |
| Audit Logs             | Logs stored in DB    | ✅ Pass |
| Redis Storage          | Block state in Redis | ✅ Pass |
| X-RateLimit Headers    | Headers present      | ✅ Pass |

---

## 🏗️ Architecture

```
src/
├── app.js                    # Express entry point
├── config/
│   └── database.js           # MongoDB connection
├── controllers/
│   ├── authController.js     # Register / Login logic
│   ├── apiController.js      # Profile, Data, Reports
│   └── adminController.js    # Admin panel logic
├── middleware/
│   ├── auth.js               # JWT authentication middleware
│   └── rateLimiter.js        # Sliding window (Redis) + blocking logic
├── models/
│   ├── User.js               # User schema
│   ├── AuditLog.js           # Audit log schema (auto-expires 30d)
│   └── RateLimit.js          # Rate limit model
├── routes/
│   ├── auth.js               # /api/auth/*
│   └── api.js                # /api/* (protected)
└── utils/
    └── logger.js             # Winston logger
migrations/
└── 0001_seed.js              # Test data seeder
logs/
├── combined.log
└── error.log
```

### Redis Key Structure

| Key Pattern                        | Purpose                                         |
|------------------------------------|-------------------------------------------------|
| `user:<userId>`                    | Sliding window timestamps (Sorted Set)          |
| `ip:<ipAddress>`                   | IP sliding window timestamps (Sorted Set)       |
| `endpoint:<method>:<path>:<ip>`    | Endpoint sliding window (Sorted Set)            |
| `violations:<key>`                 | Violation counter (expires with window)         |
| `blocked:<key>`                    | Block flag with TTL (auto-expires)              |
| `blockcount:<key>`                 | Total block count for progressive penalty       |

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

| Variable                    | Default                                      | Description                       |
|-----------------------------|----------------------------------------------|-----------------------------------|
| `PORT`                      | 3000                                         | Server port                       |
| `MONGODB_URI`               | `mongodb://localhost:27017/rate_limiter_db`  | MongoDB connection                |
| `JWT_SECRET`                | —                                            | JWT signing secret (required)     |
| `JWT_EXPIRES_IN`            | `24h`                                        | Token expiry                      |
| `REDIS_HOST`                | `127.0.0.1`                                  | Redis host                        |
| `REDIS_PORT`                | `6379`                                       | Redis port                        |
| `REDIS_PASSWORD`            | —                                            | Redis password (if any)           |
| `FREE_USER_LIMIT`           | 100                                          | Free user req/min                 |
| `PAID_USER_LIMIT`           | 1000                                         | Paid user req/min                 |
| `IP_LIMIT`                  | 200                                          | Per-IP req/min                    |
| `LOGIN_ENDPOINT_LIMIT`      | 10                                           | Login endpoint req/min            |
| `REPORTS_ENDPOINT_LIMIT`    | 20                                           | Reports endpoint req/min          |
| `MAX_VIOLATIONS_BEFORE_BLOCK` | 3                                          | Violations before blocking        |
| `BLOCK_DURATION_FIRST`      | 300                                          | First block duration (seconds)    |
| `BLOCK_DURATION_SECOND`     | 900                                          | Subsequent block duration (seconds)|
| `WHITELISTED_IPS`           | —                                            | Comma-separated whitelisted IPs   |
| `BLACKLISTED_IPS`           | —                                            | Comma-separated blacklisted IPs   |