/**
 * Server Smoke Test: Verifies HTTP routing, static asset serving, and basic API endpoints
 */
const http = require('http');

async function checkUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers });
    }).on('error', reject);
  });
}

async function smokeTest() {
  console.log('🚀 Running server smoke test...');

  // Start server
  const { server } = require('../server/server');

  // Allow server a brief moment to listen
  await new Promise(r => setTimeout(r, 800));

  try {
    const urls = [
      'http://localhost:3000/',
      'http://localhost:3000/widget.js',
      'http://localhost:3000/widget.css',
      'http://localhost:3000/admin',
      'http://localhost:3000/docs',
      'http://localhost:3000/docs/docs.css',
      'http://localhost:3000/api/public/config',
      'http://localhost:3000/api/auth/me' // should return 401 Unauthorized without token
    ];

    for (const url of urls) {
      const res = await checkUrl(url);
      console.log(`  🔍 GET ${url} -> Status ${res.statusCode}`);
      if (url.includes('/api/auth/me')) {
        if (res.statusCode !== 401) throw new Error(`Expected 401 for unauthenticated auth check, got ${res.statusCode}`);
      } else {
        if (res.statusCode !== 200) throw new Error(`Expected 200 for ${url}, got ${res.statusCode}`);
      }
    }

    console.log('\n✅ All server routes verified successfully!');
  } finally {
    server.close();
    process.exit(0);
  }
}

smokeTest().catch((err) => {
  console.error('❌ Server smoke test failed:', err);
  process.exit(1);
});
