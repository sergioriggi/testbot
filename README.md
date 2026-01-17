# Supabase Security Middleware Solution with OAuth

A Node.js/Express middleware solution that provides secure authentication using Supabase Auth with Google and Microsoft OAuth providers.

## Overview

This solution provides:
- **OAuth Authentication**: Google and Microsoft sign-in via Supabase Auth
- **JWT Authentication Middleware**: Verifies Supabase JWT tokens
- **Role-Based Access Control**: Checks user roles from database OR environment variable fail-safe
- **Secure File Upload**: Generates signed URLs for document uploads
- **Admin-Protected Endpoints**: Admin-only access control
- **Automatic Profile Creation**: Profiles are created automatically for OAuth users
- **No Password Management**: Eliminates the need for managing user passwords

## Features

### 1. OAuth Authentication
- **POST /api/auth/google** - Initiate Google OAuth flow
- **POST /api/auth/microsoft** - Initiate Microsoft OAuth flow
- **POST /api/auth/callback** - Handle OAuth callback and create/update user profile
- Automatic profile creation for new OAuth users
- Supports Google and Microsoft as authentication providers

### 2. Secure Authentication Middleware
- Verifies Supabase JWT tokens
- Checks user role against database
- Falls back to environment variable for super admin

### 3. File Upload Endpoint
- **POST /api/documents/upload**
- Generates signed URLs for secure uploads
- User-specific file paths
- Requires authentication

### 4. Admin Dashboard
- **GET /api/admin/dashboard**
- Protected by admin role check
- Displays user statistics and data
- Only accessible to admins

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure OAuth Providers in Supabase

Before setting up the environment variables, you need to configure OAuth providers in your Supabase project:

#### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client ID"
5. Configure the OAuth consent screen if needed
6. For Application type, select "Web application"
7. Add authorized redirect URIs:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
8. Copy the Client ID and Client Secret
9. In your Supabase Dashboard:
   - Go to Authentication > Providers
   - Enable Google
   - Paste the Client ID and Client Secret
   - Save the configuration

#### Microsoft OAuth Setup
1. Go to [Microsoft Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Enter a name for your application
5. For "Supported account types", select the appropriate option
6. Add redirect URI:
   - Platform: Web
   - URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
7. Click "Register"
8. Copy the "Application (client) ID"
9. Go to "Certificates & secrets" > "New client secret"
10. Copy the secret value
11. In your Supabase Dashboard:
    - Go to Authentication > Providers
    - Enable Azure (Microsoft)
    - Paste the Application (client) ID and Client Secret
    - Save the configuration

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Server Configuration
PORT=3000
NODE_ENV=development
SERVER_URL=http://localhost:3000

# OAuth Configuration
# Default redirect URL for OAuth callbacks
OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback

# Security Configuration
# Define the fail-safe admin email - this user will always have admin role
SUPER_ADMIN_EMAIL=admin@example.com
```

### 4. Database Schema

Create the following table in your Supabase database:

```sql
-- Create profiles table
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create storage bucket for documents (if not exists)
-- This can be done via Supabase Dashboard -> Storage
```

**Important**: Since we're using OAuth and application-layer security, you can either:
1. Remove RLS policies entirely, OR
2. Keep very simple, non-recursive policies

### 5. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Health Check
```http
GET /health
```

### Google OAuth Authentication
```http
POST /api/auth/google
Content-Type: application/json

{
  "redirectTo": "http://localhost:8080/auth/callback"  // Optional
}
```

Response:
```json
{
  "message": "OAuth URL generated",
  "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### Microsoft OAuth Authentication
```http
POST /api/auth/microsoft
Content-Type: application/json

{
  "redirectTo": "http://localhost:8080/auth/callback"  // Optional
}
```

Response:
```json
{
  "message": "OAuth URL generated",
  "url": "https://login.microsoftonline.com/..."
}
```

### OAuth Callback Handler
```http
POST /api/auth/callback
Content-Type: application/json

{
  "access_token": "supabase-jwt-token",
  "refresh_token": "refresh-token"  // Optional
}
```

Response (new user):
```json
{
  "message": "User profile created successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "profile": {
      "user_id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "user"
    }
  },
  "session": {
    "access_token": "...",
    "refresh_token": "..."
  }
}
```

### Generate Upload URL
```http
POST /api/documents/upload
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json

{
  "fileName": "document.pdf",
  "fileType": "application/pdf",
  "bucket": "documents"
}
```

### Admin Dashboard
```http
GET /api/admin/dashboard
Authorization: Bearer <supabase-jwt-token>
```

## Security Model

### How It Works

1. **OAuth Authentication**: Users authenticate via Google or Microsoft OAuth providers configured in Supabase.

2. **Automatic Profile Creation**: When a user authenticates via OAuth for the first time, a profile is automatically created in the `/api/auth/callback` endpoint.

3. **No Password Management**: All authentication is handled by OAuth providers - no passwords to store or manage.

4. **Super Admin Fail-Safe**: 
   - Uses `process.env.SUPER_ADMIN_EMAIL` from environment variables
   - No hardcoded emails or secrets in source code
   - Checked before database role lookup for performance
   - Logic: `if (user.email === process.env.SUPER_ADMIN_EMAIL) role = 'admin'`

5. **JWT Verification**: 
   - All protected routes verify the Supabase JWT
   - Uses `supabase.auth.getUser(token)` for validation

6. **Role-Based Access**:
   - Middleware checks user role from database
   - Falls back to super admin check
   - Admin routes use `requireAdmin` middleware

## Architecture

```
Client Request
    ↓
POST /api/auth/google or /api/auth/microsoft
    ↓
Generate OAuth URL
    ↓
User authenticates with OAuth provider
    ↓
OAuth provider redirects to callback URL with tokens
    ↓
POST /api/auth/callback
    ↓
Verify JWT and create/update profile
    ↓
Return user info and session tokens
    ↓
Authenticated Requests
    ↓
authMiddleware (JWT verification)
    ↓
Check: user.email === SUPER_ADMIN_EMAIL?
    ↓ Yes → role = 'admin'
    ↓ No → Query database for role
    ↓
requireAdmin (for admin routes)
    ↓
Route Handler
    ↓
Supabase (with service role for admin operations)
```

## Key Design Decisions

1. **OAuth-First Authentication**: All authentication flows use OAuth providers
2. **No Password Storage**: Eliminates password-related security concerns
3. **Service Role Client**: Used for admin operations to bypass RLS
4. **Anon Key Client**: Used for JWT verification
5. **Middleware Pattern**: Clean separation of concerns
6. **Environment Variables**: All secrets externalized
7. **Error Handling**: Comprehensive error messages and status codes
8. **Automatic Profile Management**: Profiles created/updated automatically via OAuth callback

## Testing

### Test OAuth Authentication

Use the included `test-login.js` script to test OAuth flows:

```bash
# Test Google OAuth
node test-login.js google

# Test Microsoft OAuth
node test-login.js microsoft
```

The script will:
1. Start a local callback server on port 8080
2. Request an OAuth URL from your backend
3. Display the URL for you to open in your browser
4. Wait for the OAuth callback
5. Send the tokens to your backend's callback endpoint
6. Display the access token for testing API calls

### Test Upload Endpoint
```bash
TOKEN="your-jwt-token-from-oauth"

curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.pdf"}'
```

### Test Admin Endpoint
```bash
# Must use super admin email or admin user token
curl -X GET http://localhost:3000/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

### Common Issues

1. **"Unauthorized" error**: Check that your JWT token is valid and not expired
2. **"Admin access required"**: Verify SUPER_ADMIN_EMAIL in .env or user role in database
3. **Supabase connection error**: Verify SUPABASE_URL and keys in .env
4. **OAuth provider not enabled**: Check that Google/Microsoft OAuth is enabled in Supabase Dashboard > Authentication > Providers
5. **OAuth redirect fails**: Verify redirect URIs are correctly configured in both OAuth provider console and Supabase
6. **Profile creation fails**: Check that profiles table exists and is accessible

## License

ISC
