require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPER_ADMIN_EMAIL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please create a .env file based on .env.example');
  process.exit(1);
}

// Initialize Supabase clients
// Anon client for general operations
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Service role client for admin operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Secure Auth Middleware
 * Verifies Supabase JWT and checks user role
 * Uses environment variable fail-safe for admin access
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verify JWT with Supabase
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Store user in request for downstream use
    req.user = user;

    // Check if user is the super admin (fail-safe using environment variable)
    if (user.email === process.env.SUPER_ADMIN_EMAIL) {
      req.userRole = 'admin';
      req.isSuperAdmin = true;
      return next();
    }

    // Query database for user role (non-recursive - only queries profiles table)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      // If profile doesn't exist, default to 'user' role
      console.warn(`Profile not found for user ${user.id}, defaulting to 'user' role`);
      req.userRole = 'user';
    } else {
      req.userRole = profile.role || 'user';
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Admin Role Check Middleware
 * Ensures user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * POST /api/register
 * Register a new user and create their profile
 * No database triggers - profile creation happens here
 */
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true // Auto-confirm for dev/demo; implement proper email verification in production
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const user = authData.user;

    // Create profile in database
    // NO triggers - explicit creation in application code
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        name: name || null,
        role: 'user', // Default role
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      return res.status(500).json({ error: 'Failed to create profile: ' + profileError.message });
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        role: profile.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/documents/upload
 * Generate a signed URL for file upload to Supabase Storage
 * Protected by authentication middleware
 */
app.post('/api/documents/upload', authenticateUser, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    // Generate a unique file path for the user
    const filePath = `${req.user.id}/${Date.now()}_${fileName}`;
    const bucketName = 'documents';

    // Generate a signed URL for upload (default expiration: 2 hours)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
      .storage
      .from(bucketName)
      .createSignedUploadUrl(filePath);

    if (signedUrlError) {
      return res.status(500).json({ error: 'Failed to generate signed URL: ' + signedUrlError.message });
    }

    res.json({
      signedUrl: signedUrlData.signedUrl,
      path: filePath,
      token: signedUrlData.token,
      message: 'Use this signed URL to upload your file'
    });
  } catch (error) {
    console.error('Upload URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * GET /api/admin/dashboard
 * Admin-only endpoint
 * Protected by authentication and admin role check
 */
app.get('/api/admin/dashboard', authenticateUser, requireAdmin, async (req, res) => {
  try {
    // Fetch some admin statistics
    const { count: userCount, error: userCountError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (userCountError) {
      console.error('Error fetching user count:', userCountError);
    }

    // Fetch recent users
    const { data: recentUsers, error: recentUsersError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentUsersError) {
      console.error('Error fetching recent users:', recentUsersError);
    }

    res.json({
      message: 'Admin dashboard data',
      adminEmail: req.user.email,
      isSuperAdmin: req.isSuperAdmin || false,
      statistics: {
        totalUsers: userCount || 0,
        recentUsers: recentUsers || []
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

/**
 * GET /api/profile
 * Get current user's profile
 * Protected by authentication middleware
 */
app.get('/api/profile', authenticateUser, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      profile: {
        ...profile,
        isSuperAdmin: req.isSuperAdmin || false
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    supabaseConfigured: !!process.env.SUPABASE_URL,
    superAdminConfigured: !!process.env.SUPER_ADMIN_EMAIL
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Server is running on port', PORT);
  console.log('📊 Environment:');
  console.log('  - Supabase URL:', process.env.SUPABASE_URL);
  console.log('  - Super Admin Email:', process.env.SUPER_ADMIN_EMAIL);
  console.log('✅ All security checks in application layer (no RLS recursion)');
});

module.exports = app;
