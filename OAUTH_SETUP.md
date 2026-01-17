# OAuth Setup Guide

This guide walks you through the complete setup of Google and Microsoft OAuth authentication for your Supabase project.

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- Access to Google Cloud Console
- Access to Microsoft Azure Portal

## Step 1: Supabase Configuration

### Get Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the following:
   - Project URL (e.g., `https://xxxxxxxxxxxxx.supabase.co`)
   - `anon` `public` key
   - `service_role` `secret` key

Note your project reference for OAuth configuration:
- Your redirect URI will be: `https://<your-project-ref>.supabase.co/auth/v1/callback`

## Step 2: Google OAuth Setup

### 2.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. If this is your first time:
   - Click **Configure Consent Screen**
   - Choose **External** user type
   - Fill in required fields:
     - App name
     - User support email
     - Developer contact information
   - Click **Save and Continue**
   - Skip scopes (click **Save and Continue**)
   - Add test users if needed
   - Click **Save and Continue**

### 2.2 Create OAuth Client ID

1. In **Credentials** page, click **Create Credentials** > **OAuth client ID**
2. Select **Web application**
3. Enter a name (e.g., "My App OAuth")
4. Under **Authorized redirect URIs**, add:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   Replace `<your-project-ref>` with your actual Supabase project reference
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** that appear

### 2.3 Configure in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** > **Providers**
3. Find **Google** in the list
4. Toggle it to **Enabled**
5. Paste your **Client ID** and **Client Secret**
6. Click **Save**

## Step 3: Microsoft OAuth Setup

### 3.1 Register Application

1. Go to [Microsoft Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** (or **Microsoft Entra ID**)
3. Click **App registrations** > **New registration**
4. Fill in the details:
   - Name: Your application name
   - Supported account types: Choose one:
     - **Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts**
       (Recommended for most apps)
   - Redirect URI:
     - Platform: **Web**
     - URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Click **Register**

### 3.2 Get Application Credentials

1. After registration, you'll see the **Overview** page
2. Copy the **Application (client) ID**
3. Navigate to **Certificates & secrets**
4. Click **New client secret**
5. Add a description and choose expiration period
6. Click **Add**
7. **Important**: Copy the **Value** immediately (it won't be shown again)

### 3.3 Configure API Permissions (Optional but Recommended)

1. Navigate to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add these permissions:
   - `email`
   - `openid`
   - `profile`
   - `User.Read`
6. Click **Add permissions**
7. Click **Grant admin consent** if you have admin rights

### 3.4 Configure in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** > **Providers**
3. Find **Azure** in the list
4. Toggle it to **Enabled**
5. Paste your **Application (client) ID** as **Azure Client ID**
6. Paste your **Client Secret Value** as **Azure Secret**
7. Leave **Azure Tenant ID** empty to allow all accounts, or specify:
   - Your tenant ID for single-tenant apps
   - `organizations` for work/school accounts only
   - `consumers` for personal Microsoft accounts only
8. Click **Save**

## Step 4: Application Configuration

### 4.1 Update Environment Variables

Create a `.env` file in your project root (copy from `.env.example`):

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key

# Server Configuration
PORT=3000
NODE_ENV=development
SERVER_URL=http://localhost:3000

# OAuth Configuration
OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback

# Security Configuration
SUPER_ADMIN_EMAIL=your-email@example.com
```

### 4.2 Update for Production

For production deployment, update:

```env
NODE_ENV=production
SERVER_URL=https://your-production-domain.com
OAUTH_REDIRECT_URL=https://your-production-domain.com/auth/callback
```

## Step 5: Database Setup

Create the profiles table in your Supabase database:

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

-- Create storage bucket for documents (if needed)
-- Do this in Supabase Dashboard -> Storage -> New bucket
-- Name: documents
-- Public: false (or true, depending on your needs)
```

## Step 6: Testing

### 6.1 Start Your Server

```bash
npm install
npm start
```

### 6.2 Test Google OAuth

```bash
node test-login.js google
```

Follow the OAuth URL in your browser and complete authentication.

### 6.3 Test Microsoft OAuth

```bash
node test-login.js microsoft
```

Follow the OAuth URL in your browser and complete authentication.

## Troubleshooting

### Common Issues

#### Google OAuth

**Error: redirect_uri_mismatch**
- Ensure the redirect URI in Google Cloud Console exactly matches: `https://<your-project-ref>.supabase.co/auth/v1/callback`
- Check for trailing slashes or typos

**Error: Access blocked: This app's request is invalid**
- Complete OAuth consent screen configuration
- Add your email as a test user if app is in testing mode

#### Microsoft OAuth

**Error: AADSTS50011: The redirect URI specified in the request does not match**
- Verify redirect URI in Azure Portal matches exactly
- Check platform is set to "Web"

**Error: AADSTS700016: Application not found**
- Check Application (client) ID is correct
- Ensure the app is properly registered

**Error: Invalid client secret**
- The secret may have expired
- Generate a new client secret and update your Supabase configuration

#### General Issues

**Profile not created**
- Check Supabase logs in Dashboard > Logs
- Verify profiles table exists
- Check service role key has proper permissions

**OAuth flow redirects but no session**
- Check that your callback endpoint is receiving tokens
- Verify Supabase URL and keys are correct
- Check browser console for errors

## Security Considerations

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use different credentials** for development and production
3. **Rotate secrets regularly** - Both OAuth secrets and Supabase keys
4. **Monitor OAuth usage** - Check Google/Microsoft dashboards for unusual activity
5. **Set appropriate consent scopes** - Only request necessary permissions
6. **Configure allowed domains** - Restrict OAuth to specific domains in production
7. **Enable MFA for admin accounts** - Protect accounts with admin privileges

## Production Checklist

Before deploying to production:

- [ ] OAuth credentials created for production domains
- [ ] Production redirect URIs configured in Google Cloud Console
- [ ] Production redirect URIs configured in Azure Portal
- [ ] Supabase Auth providers configured with production credentials
- [ ] Environment variables set in production environment
- [ ] `.env` file added to `.gitignore`
- [ ] SSL/TLS certificate configured for production domain
- [ ] Supabase RLS policies reviewed (if using)
- [ ] Database backups configured
- [ ] Error logging and monitoring set up
- [ ] OAuth consent screen published (Google)
- [ ] Azure app moved out of testing state (if applicable)

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft Identity Platform](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Supabase Auth with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Auth with Azure](https://supabase.com/docs/guides/auth/social-login/auth-azure)

## Support

If you encounter issues:

1. Check Supabase logs: Dashboard > Logs
2. Check browser developer console
3. Review server logs: `npm run dev` (with verbose logging)
4. Verify all configuration steps were completed
5. Test with a fresh browser/incognito window
