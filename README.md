# Supabase Security Middleware Solution

A Node.js/Express middleware solution that moves security logic out of the database to avoid PostgreSQL Row Level Security (RLS) infinite recursion issues.

## Overview

This solution provides:
- **JWT Authentication Middleware**: Verifies Supabase JWT tokens
- **Role-Based Access Control**: Checks user roles from database OR environment variable fail-safe
- **Secure File Upload**: Generates signed URLs for document uploads
- **Admin-Protected Endpoints**: Admin-only access control
- **No Database Triggers**: Profile creation happens in the `/api/register` endpoint
- **No Recursive Policies**: Security logic is handled at the application layer

## Features

### 1. Secure Authentication Middleware
- Verifies Supabase JWT tokens
- Checks user role against database
- Falls back to environment variable for super admin

### 2. File Upload Endpoint
- **POST /api/documents/upload**
- Generates signed URLs for secure uploads
- User-specific file paths
- Requires authentication

### 3. Admin Dashboard
- **GET /api/admin/dashboard**
- Protected by admin role check
- Displays user statistics and data
- Only accessible to admins

### 4. User Registration
- **POST /api/register**
- Creates auth user and profile in one transaction
- No database triggers required
- Automatic rollback on failure

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

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

# Security Configuration
# Define the fail-safe admin email - this user will always have admin role
SUPER_ADMIN_EMAIL=admin@example.com
```

### 3. Database Schema

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

**Important**: Since we're moving security to the application layer, you can either:
1. Remove RLS policies entirely, OR
2. Keep very simple, non-recursive policies

### 4. Start the Server

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

### User Registration
```http
POST /api/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "fullName": "John Doe"
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

1. **No Database Triggers**: Profile creation happens in the `/api/register` endpoint, not via database triggers.

2. **No Recursive Policies**: All security checks are done in the middleware, not in RLS policies.

3. **Super Admin Fail-Safe**: 
   - Uses `process.env.SUPER_ADMIN_EMAIL` from environment variables
   - No hardcoded emails or secrets in source code
   - Checked before database role lookup for performance
   - Logic: `if (user.email === process.env.SUPER_ADMIN_EMAIL) role = 'admin'`

4. **JWT Verification**: 
   - All protected routes verify the Supabase JWT
   - Uses `supabase.auth.getUser(token)` for validation

5. **Role-Based Access**:
   - Middleware checks user role from database
   - Falls back to super admin check
   - Admin routes use `requireAdmin` middleware

## Architecture

```
Client Request
    ↓
Express Server
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

1. **Service Role Client**: Used for admin operations to bypass RLS
2. **Anon Key Client**: Used for JWT verification
3. **Middleware Pattern**: Clean separation of concerns
4. **Environment Variables**: All secrets externalized
5. **Error Handling**: Comprehensive error messages and status codes

## Testing

### Test Authentication
```bash
# Register a new user
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","fullName":"Test User"}'

# Login via Supabase client to get JWT token
# Then test authenticated endpoints
```

### Test Upload Endpoint
```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.pdf"}'
```

### Test Admin Endpoint
```bash
# Must use super admin email or admin user token
curl -X GET http://localhost:3000/api/admin/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

### Common Issues

1. **"Unauthorized" error**: Check that your JWT token is valid and not expired
2. **"Admin access required"**: Verify SUPER_ADMIN_EMAIL in .env or user role in database
3. **Supabase connection error**: Verify SUPABASE_URL and keys in .env
4. **Profile creation fails**: Check that auth.users table exists and is accessible

## License

ISC
