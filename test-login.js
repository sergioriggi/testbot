require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const url = require('url');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

/**
 * OAuth Test Script
 * 
 * This script helps test OAuth authentication flows for Google and Microsoft.
 * 
 * Usage:
 *   node test-login.js google   # Test Google OAuth
 *   node test-login.js microsoft # Test Microsoft OAuth
 * 
 * The script will:
 * 1. Start a local callback server on port 8080
 * 2. Get the OAuth URL from your backend
 * 3. Open the URL in your browser (you need to copy and paste it)
 * 4. Wait for the OAuth callback
 * 5. Display the access token
 */

async function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      
      if (parsedUrl.pathname === '/auth/callback') {
        const query = parsedUrl.query;
        
        // Handle OAuth callback with query params
        if (query.access_token || query.code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <script>
                  // Extract tokens from URL hash fragments (Supabase's default)
                  // and send them back to the server
                  const hash = window.location.hash.substring(1);
                  const params = new URLSearchParams(hash || window.location.search.substring(1));
                  const access_token = params.get('access_token');
                  const refresh_token = params.get('refresh_token');
                  
                  if (access_token) {
                    fetch('/auth/complete', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ access_token, refresh_token })
                    });
                  }
                </script>
              </body>
            </html>
          `);
          return;
        }
        
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authentication parameters');
      } else if (parsedUrl.pathname === '/auth/complete') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const { access_token, refresh_token } = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            
            server.close();
            resolve({ access_token, refresh_token });
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.listen(8080, () => {
      console.log('🔄 Callback server started on http://localhost:8080');
    });

    server.on('error', reject);
  });
}

async function testOAuth(provider) {
  console.log(`\n🔐 Testing ${provider} OAuth flow...\n`);

  try {
    // Step 1: Get OAuth URL from backend
    console.log('Step 1: Getting OAuth URL from backend...');
    const response = await fetch(`${SERVER_URL}/api/auth/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        redirectTo: 'http://localhost:8080/auth/callback'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get OAuth URL');
    }

    const { url: oauthUrl } = await response.json();
    
    console.log('\n📋 OAuth URL generated:');
    console.log(oauthUrl);
    console.log('\n🌐 Please open this URL in your browser to authenticate.');
    console.log('⏳ Waiting for authentication...\n');

    // Step 2: Start callback server and wait for response
    const { access_token, refresh_token } = await startCallbackServer();

    // Step 3: Send tokens to backend callback endpoint
    console.log('\n✅ Authentication successful!');
    console.log('📤 Sending tokens to backend...');
    
    const callbackResponse = await fetch(`${SERVER_URL}/api/auth/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access_token,
        refresh_token
      })
    });

    if (!callbackResponse.ok) {
      const error = await callbackResponse.json();
      throw new Error(error.message || 'Callback failed');
    }

    const result = await callbackResponse.json();

    console.log('\n✅ Profile created/updated successfully!');
    console.log('\n👤 User Info:');
    console.log('  ID:', result.user.id);
    console.log('  Email:', result.user.email);
    console.log('  Role:', result.user.profile.role);
    console.log('\n🔑 Access Token:');
    console.log(access_token);
    console.log('\n📋 Use this token in your API calls:');
    console.log('Authorization: Bearer <token>');

  } catch (error) {
    console.error('\n❌ OAuth test failed:', error.message);
    process.exit(1);
  }
}

// Main
const provider = process.argv[2];

if (!provider || !['google', 'microsoft'].includes(provider)) {
  console.error('Usage: node test-login.js <google|microsoft>');
  console.error('\nExamples:');
  console.error('  node test-login.js google');
  console.error('  node test-login.js microsoft');
  process.exit(1);
}

testOAuth(provider);
