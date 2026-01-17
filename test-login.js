require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function login() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node test-login.js <email> <password>');
    process.exit(1);
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error.message);
      process.exit(1);
    }

    console.log('\n✅ Login successful!');
    console.log('\nUser ID:', data.user.id);
    console.log('Email:', data.user.email);
    console.log('\nAccess Token:');
    console.log(data.session.access_token);
    console.log('\n📋 Copy the token above and use it in your API calls:');
    console.log('Authorization: Bearer <token>');
  } catch (err) {
    console.error('Unexpected error:', err.message);
    process.exit(1);
  }
}

login();
