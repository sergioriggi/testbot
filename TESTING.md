# Testing Guide

## Prerequisites

1. Create a `.env` file based on `.env.example`
2. Set up a Supabase project with the following:
   - Get your SUPABASE_URL and keys
   - Create the profiles table (see README.md for schema)
   - Create a storage bucket named "documents"
   - Configure Google OAuth provider in Supabase Dashboard
   - Configure Microsoft OAuth provider in Supabase Dashboard

## OAuth Provider Configuration

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. In Supabase Dashboard: Authentication > Providers > Enable Google
5. Add Client ID and Client Secret

### Microsoft OAuth
1. Go to [Microsoft Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. In Supabase Dashboard: Authentication > Providers > Enable Azure
5. Add Application (client) ID and Client Secret

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

### 4. Test Google OAuth Authentication

Use the test script:

```bash
node test-login.js google
```

The script will:
1. Start a local callback server on port 8080
2. Display an OAuth URL
3. Wait for you to authenticate in your browser

Expected output:
```
🔐 Testing google OAuth flow...

Step 1: Getting OAuth URL from backend...

📋 OAuth URL generated:
https://accounts.google.com/o/oauth2/v2/auth?...

🌐 Please open this URL in your browser to authenticate.
⏳ Waiting for authentication...

🔄 Callback server started on http://localhost:8080
✅ Authentication successful!
📤 Sending tokens to backend...

✅ Profile created/updated successfully!

👤 User Info:
  ID: uuid-here
  Email: user@gmail.com
  Role: user

🔑 Access Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

📋 Use this token in your API calls:
Authorization: Bearer <token>
```

### 5. Test Microsoft OAuth Authentication

```bash
node test-login.js microsoft
```

Expected output is similar to Google OAuth test.

### 6. Test Upload Endpoint

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

Using the token from the OAuth test:

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

1. Set `SUPER_ADMIN_EMAIL` in `.env` to an email you can authenticate with (e.g., your Google or Microsoft account email)

2. Authenticate using OAuth with that email:
```bash
node test-login.js google
# or
node test-login.js microsoft
```

3. Use the returned token to test the admin endpoint:

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
    "totalUsers": 1,
    "recentUsers": 1
  },
  "users": [...]
}
```

## Testing Checklist

- [ ] Health check returns 200 OK
- [ ] Google OAuth flow generates valid OAuth URL
- [ ] Microsoft OAuth flow generates valid OAuth URL
- [ ] OAuth callback creates profile for new users
- [ ] OAuth callback returns existing profile for returning users
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
✅ OAuth providers configured in Supabase  
✅ No password storage or management  
✅ Automatic profile creation for OAuth users
