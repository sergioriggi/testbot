# Testing Guide

## Prerequisites

1. Create a `.env` file based on `.env.example`
2. Set up a Supabase project with the following:
   - Get your SUPABASE_URL and keys
   - Create the profiles table (see README.md for schema)
   - Create a storage bucket named "documents"

## Manual Testing Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

You should see:
```
Server running on port 3000
Environment: development
Super Admin Email: admin@example.com
```

### 3. Test Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "2026-01-17T..."
}
```

### 4. Test User Registration
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword123",
    "fullName": "Test User"
  }'
```

Expected response:
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "profile": {
      "user_id": "uuid-here",
      "email": "test@example.com",
      "full_name": "Test User",
      "role": "user"
    }
  }
}
```

### 5. Get JWT Token

You need to use a Supabase client to login and get a JWT token. Here's a simple Node.js script:

```javascript
// test-login.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function login() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'securepassword123'
  });

  if (error) {
    console.error('Login error:', error);
    return;
  }

  console.log('Access Token:', data.session.access_token);
}

login();
```

Run: `node test-login.js`

### 6. Test Upload Endpoint

Use the JWT token from step 5:

```bash
TOKEN="your-jwt-token-here"

curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test-document.pdf",
    "fileType": "application/pdf"
  }'
```

Expected response:
```json
{
  "message": "Signed upload URL generated",
  "uploadUrl": "https://...",
  "path": "user-id/timestamp-test-document.pdf",
  "token": "...",
  "expiresIn": 60
}
```

### 7. Test Admin Endpoint (Regular User)

Using the same token from step 5:

```bash
curl -X GET http://localhost:3000/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

Expected response (403 Forbidden):
```json
{
  "error": "Forbidden",
  "message": "Admin access required"
}
```

### 8. Test Super Admin Access

1. Register a user with the SUPER_ADMIN_EMAIL:
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "adminpassword123",
    "fullName": "Super Admin"
  }'
```

2. Login as the super admin and get the JWT token
3. Test the admin endpoint:

```bash
ADMIN_TOKEN="admin-jwt-token-here"

curl -X GET http://localhost:3000/api/admin/dashboard \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected response:
```json
{
  "message": "Admin dashboard data",
  "admin": {
    "email": "admin@example.com",
    "role": "admin"
  },
  "stats": {
    "totalUsers": 2,
    "recentUsers": 2
  },
  "users": [...]
}
```

## Testing Checklist

- [ ] Health check returns 200 OK
- [ ] User registration creates both auth user and profile
- [ ] Authentication middleware verifies JWT tokens
- [ ] Upload endpoint generates signed URLs for authenticated users
- [ ] Admin endpoint rejects regular users with 403
- [ ] Super admin (from env var) can access admin endpoint
- [ ] Invalid tokens are rejected with 401
- [ ] Missing authorization header returns 401

## Security Verification

✅ No hardcoded emails or secrets in source code  
✅ SUPER_ADMIN_EMAIL read from environment variable  
✅ JWT verification for all protected routes  
✅ Role-based access control implemented  
✅ Service role key used only for admin operations  
✅ No database triggers created  
✅ No recursive RLS policies
