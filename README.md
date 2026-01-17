# Supabase Security Middleware Solution

A Node.js/Express application that moves security logic from database RLS policies to application middleware, preventing infinite recursion errors (Error 42P17).

## 🎯 Problem Solved

This solution addresses the common issue of **Infinite Recursion in Supabase RLS policies** by moving all security checks to the application layer.

### Key Features
- ✅ **No Database Triggers**: Profile creation happens in the `/api/register` endpoint
- ✅ **No Recursive Policies**: Security checks are performed in middleware, not in SQL
- ✅ **Environment-Based Admin Fail-Safe**: Super admin defined via `SUPER_ADMIN_EMAIL` environment variable
- ✅ **JWT Verification**: Secure token validation using Supabase Auth
- ✅ **Role-Based Access Control**: Middleware-based role checking

## 📋 Prerequisites

- Node.js (v14 or higher)
- A Supabase project with:
  - A `profiles` table
  - A `documents` storage bucket (for file uploads)

### Database Schema

Create the following table in your Supabase project:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Create indexes for better performance
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);

-- IMPORTANT: Keep RLS policies simple or disable them
-- Security is handled in the application layer
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Simple policy: users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Note: Insert/Update/Delete operations use service role key
-- which bypasses RLS, so no policies needed for those operations
```

### Storage Bucket Setup

Create a storage bucket named `documents` in your Supabase project:

```sql
-- Create storage bucket (run in Supabase SQL Editor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Optional: Simple RLS policy for storage
-- Users can upload to their own folder
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
```

## 🚀 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd testbot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your `.env` file with your Supabase credentials:
```env
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3000
SUPER_ADMIN_EMAIL=admin@example.com
```

**Important**: Replace with your actual Supabase credentials:
- Go to your [Supabase Dashboard](https://app.supabase.com)
- Select your project
- Navigate to **Settings** > **API**
- Copy the **Project URL** (for `SUPABASE_URL`)
- Copy the **anon public** key (for `SUPABASE_ANON_KEY`)
- Copy the **service_role** key (for `SUPABASE_SERVICE_ROLE_KEY`)
- ⚠️ **Warning**: Never commit the `service_role` key or share it publicly - it bypasses all RLS policies!

## 🏃 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the PORT specified in your .env file).

## 📡 API Endpoints

### 1. Health Check
```http
GET /health
```

Check if the server is running and properly configured.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-17T16:43:00.000Z",
  "supabaseConfigured": true,
  "superAdminConfigured": true
}
```

### 2. User Registration
```http
POST /api/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

Creates a new user and their profile in one transaction. No database triggers required.

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "role": "user"
  }
}
```

### 3. Document Upload (Generate Signed URL)
```http
POST /api/documents/upload
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json

{
  "fileName": "document.pdf",
  "fileType": "application/pdf"
}
```

Generates a signed URL for uploading files to Supabase Storage.

**Response:**
```json
{
  "signedUrl": "https://...",
  "path": "user-id/timestamp_document.pdf",
  "token": "upload-token",
  "message": "Use this signed URL to upload your file"
}
```

**Usage:** Use the returned `signedUrl` to upload your file via PUT request.

### 4. Admin Dashboard
```http
GET /api/admin/dashboard
Authorization: Bearer <supabase-jwt-token>
```

Admin-only endpoint. Returns dashboard statistics.

**Response:**
```json
{
  "message": "Admin dashboard data",
  "adminEmail": "admin@example.com",
  "isSuperAdmin": true,
  "statistics": {
    "totalUsers": 42,
    "recentUsers": [...]
  }
}
```

### 5. Get Profile
```http
GET /api/profile
Authorization: Bearer <supabase-jwt-token>
```

Get the current user's profile information.

**Response:**
```json
{
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "created_at": "2026-01-17T16:43:00.000Z",
    "isSuperAdmin": false
  }
}
```

## 🔒 Security Architecture

### Authentication Flow

1. **User Login**: User authenticates with Supabase Auth and receives a JWT token
2. **Request**: User includes JWT in `Authorization: Bearer <token>` header
3. **Middleware Verification**: 
   - Extracts and validates JWT
   - Checks if user email matches `SUPER_ADMIN_EMAIL` (environment variable)
   - If super admin: grants admin role immediately
   - If not: queries `profiles` table for user's role
4. **Role-Based Access**: Endpoints check required role before processing

### Key Security Principles

- **No Hardcoded Secrets**: All sensitive data in environment variables
- **Fail-Safe Admin**: `SUPER_ADMIN_EMAIL` ensures admin access even if database fails
- **Service Role for Admin Ops**: Bypasses RLS for administrative operations
- **Non-Recursive Queries**: Profile lookups never query the table they're protecting
- **Explicit Profile Creation**: No triggers - all profile creation in `/api/register`

## 🧪 Testing

### Test User Registration
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'
```

### Test Admin Access (with super admin email)
1. Register or login as the super admin email
2. Get JWT token from Supabase
3. Access admin endpoint:
```bash
curl -X GET http://localhost:3000/api/admin/dashboard \
  -H "Authorization: Bearer <your-jwt-token>"
```

## 🐛 Troubleshooting

### "Missing required environment variables"
- Ensure your `.env` file exists and contains all required variables
- Check that variable names match exactly (case-sensitive)

### "Invalid or expired token"
- Verify your JWT token is valid and not expired
- Ensure you're using the correct Supabase project credentials

### "Admin access required"
- Verify the user's email matches `SUPER_ADMIN_EMAIL` in `.env`
- Or ensure the user's role in the `profiles` table is set to 'admin'

### Storage bucket not found
- Create the `documents` bucket in your Supabase project
- Ensure the bucket name in the code matches your bucket name

## 📝 Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `SUPABASE_URL` | Your Supabase project URL | Yes | `https://abc.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon key for client operations | Yes | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations | Yes | `eyJ...` |
| `PORT` | Server port | No | `3000` |
| `SUPER_ADMIN_EMAIL` | Email for fail-safe admin access | Yes | `admin@example.com` |

## 🤝 Contributing

This is a reference implementation. Feel free to adapt it to your needs.

## 📄 License

See LICENSE file for details.

## 🔗 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Documentation](https://expressjs.com/)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
