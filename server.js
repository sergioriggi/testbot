require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(
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
 * Verifies the Supabase JWT and checks user role against database OR environment variable fail-safe
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Extract the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token' 
      });
    }

    // Attach user to request
    req.user = user;

    // Check role: First check environment variable fail-safe
    if (user.email === process.env.SUPER_ADMIN_EMAIL) {
      req.userRole = 'admin';
      return next();
    }

    // Otherwise, query the database for user role
    // Using service role client to bypass RLS
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      // If profile doesn't exist, default to 'user' role
      req.userRole = 'user';
    } else {
      req.userRole = profile?.role || 'user';
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Authentication failed' 
    });
  }
};

/**
 * Admin Role Check Middleware
 * Ensures the authenticated user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Admin access required' 
    });
  }
  next();
};

/**
 * POST /api/register
 * User registration endpoint - creates auth user and profile
 */
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Email and password are required' 
      });
    }

    // Create the auth user using service role client
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      return res.status(400).json({ 
        error: 'Registration Failed', 
        message: authError.message 
      });
    }

    // Create the profile record
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        email: email,
        full_name: fullName || null,
        role: 'user' // Default role
      })
      .select()
      .single();

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('Failed to rollback user creation:', deleteError);
      }
      
      return res.status(500).json({ 
        error: 'Registration Failed', 
        message: 'Failed to create user profile' 
      });
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        profile: profile
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Registration failed' 
    });
  }
});

/**
 * POST /api/documents/upload
 * Generate a signed URL for file upload
 * Protected by authentication
 */
app.post('/api/documents/upload', authMiddleware, async (req, res) => {
  try {
    const { fileName, fileType, bucket = 'documents' } = req.body;

    if (!fileName) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'fileName is required' 
      });
    }

    // Sanitize fileName to prevent directory traversal attacks
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Create a unique file path with user ID prefix
    const filePath = `${req.user.id}/${Date.now()}-${sanitizedFileName}`;

    // Generate a signed URL for upload (valid for 60 seconds)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUploadUrl(filePath);

    if (signedUrlError) {
      return res.status(500).json({ 
        error: 'Upload URL Generation Failed', 
        message: signedUrlError.message 
      });
    }

    res.json({
      message: 'Signed upload URL generated',
      uploadUrl: signedUrlData.signedUrl,
      path: filePath,
      token: signedUrlData.token,
      expiresIn: 60
    });
  } catch (error) {
    console.error('Upload URL generation error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to generate upload URL' 
    });
  }
});

/**
 * GET /api/admin/dashboard
 * Admin-only endpoint
 * Protected by authentication and admin role check
 */
app.get('/api/admin/dashboard', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Fetch some admin dashboard data using service role client
    const { data: users, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (usersError) {
      return res.status(500).json({ 
        error: 'Data Fetch Failed', 
        message: usersError.message 
      });
    }

    // Get total user count
    const { count, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    res.json({
      message: 'Admin dashboard data',
      admin: {
        email: req.user.email,
        role: req.userRole
      },
      stats: {
        totalUsers: count || 0,
        recentUsers: users.length
      },
      users: users
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to fetch dashboard data' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Supabase Security Middleware API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      register: 'POST /api/register',
      upload: 'POST /api/documents/upload (requires auth)',
      adminDashboard: 'GET /api/admin/dashboard (requires admin role)'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Super Admin Email: ${process.env.SUPER_ADMIN_EMAIL || 'Not configured'}`);
});

module.exports = app;
