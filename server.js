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
 * POST /api/auth/google
 * Initiate Google OAuth flow
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { redirectTo } = req.body;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || process.env.OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback'
      }
    });

    if (error) {
      return res.status(400).json({ 
        error: 'OAuth Initiation Failed', 
        message: error.message 
      });
    }

    res.json({
      message: 'OAuth URL generated',
      url: data.url
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to initiate Google OAuth' 
    });
  }
});

/**
 * POST /api/auth/microsoft
 * Initiate Microsoft OAuth flow
 */
app.post('/api/auth/microsoft', async (req, res) => {
  try {
    const { redirectTo } = req.body;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: redirectTo || process.env.OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback',
        scopes: 'email'
      }
    });

    if (error) {
      return res.status(400).json({ 
        error: 'OAuth Initiation Failed', 
        message: error.message 
      });
    }

    res.json({
      message: 'OAuth URL generated',
      url: data.url
    });
  } catch (error) {
    console.error('Microsoft OAuth error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to initiate Microsoft OAuth' 
    });
  }
});

/**
 * POST /api/auth/callback
 * Handle OAuth callback and create/update user profile
 */
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Access token is required' 
      });
    }

    // Get user from access token
    const { data: { user }, error: authError } = await supabase.auth.getUser(access_token);

    if (authError || !user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid access token' 
      });
    }

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected for new users
      console.error('Profile check error:', checkError);
    }

    if (!existingProfile) {
      // Create profile for new OAuth user
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          role: 'user' // Default role
        })
        .select()
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
        return res.status(500).json({ 
          error: 'Profile Creation Failed', 
          message: 'Failed to create user profile' 
        });
      }

      res.status(201).json({
        message: 'User profile created successfully',
        user: {
          id: user.id,
          email: user.email,
          profile: profile
        },
        session: {
          access_token,
          refresh_token
        }
      });
    } else {
      // Profile already exists
      res.json({
        message: 'User authenticated successfully',
        user: {
          id: user.id,
          email: user.email,
          profile: existingProfile
        },
        session: {
          access_token,
          refresh_token
        }
      });
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Authentication callback failed' 
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
    message: 'Supabase Security Middleware API with OAuth',
    version: '2.0.0',
    endpoints: {
      health: 'GET /health',
      googleOAuth: 'POST /api/auth/google',
      microsoftOAuth: 'POST /api/auth/microsoft',
      oauthCallback: 'POST /api/auth/callback',
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
