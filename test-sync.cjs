const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/evolution/sync-contacts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
});

req.on('error', (e) => console.error('Error:', e));
req.end();
