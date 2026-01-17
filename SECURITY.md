# Security Considerations

## Rate Limiting

⚠️ **Important**: The OAuth endpoints (`/api/auth/google`, `/api/auth/microsoft`) should have rate limiting enabled in production to prevent abuse.

### Recommended Implementation

Install express-rate-limit:
```bash
npm install express-rate-limit
```

Add to server.js:
```javascript
const rateLimit = require('express-rate-limit');

// Create rate limiter for OAuth endpoints
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many OAuth requests from this IP, please try again later.'
});

// Apply to OAuth endpoints
app.post('/api/auth/google', oauthLimiter, async (req, res) => { ... });
app.post('/api/auth/microsoft', oauthLimiter, async (req, res) => { ... });
```

### Other Security Recommendations

1. **Enable HTTPS in Production**: Always use SSL/TLS certificates
2. **CORS Configuration**: Restrict CORS to specific domains in production
3. **Environment Variables**: Never commit `.env` file
4. **OAuth Credentials**: Rotate secrets regularly
5. **Logging**: Monitor OAuth failures for suspicious activity
6. **Admin Access**: Limit SUPER_ADMIN_EMAIL to trusted accounts only
7. **Database Backups**: Regular backups of the profiles table
8. **Token Expiration**: Configure appropriate token expiration in Supabase

## CodeQL Findings

The CodeQL security scan identified that the OAuth initiation endpoints lack rate limiting. While this doesn't introduce new vulnerabilities (since password-based authentication also lacked rate limiting), it should be addressed before production deployment.

### Why Rate Limiting is Important for OAuth

- Prevents brute force attacks on OAuth URLs
- Reduces server load from automated requests
- Protects against denial-of-service attempts
- Limits abuse of OAuth provider quotas

### Remediation

Add rate limiting middleware to the OAuth endpoints before production deployment. See implementation example above.
