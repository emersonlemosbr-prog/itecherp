const http = require('http');

const req = http.request({
  hostname: '127.0.0.1',
  port: 4001,
  path: '/api/health',
  method: 'GET',
  timeout: 3000
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`[SERVER_STATUS] Port 4001 HTTP Status: ${res.statusCode}, Body: ${data}`);
  });
});

req.on('error', (err) => {
  console.log(`[SERVER_STATUS] Server not running or unreachable: ${err.message}`);
});

req.end();
