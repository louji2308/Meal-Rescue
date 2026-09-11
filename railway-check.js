const https = require('https');
const query = JSON.stringify({
  query: `query { project(id: "a7d17427-8708-4526-b5ae-b15c7254ac5a") { deployments(first: 3, input: { environmentId: "4c32c8b8-7e64-4728-809d-5800766961d1" }) { edges { node { id state createdAt commitInfo { message commitSha } } } } } }`
});
const options = {
  hostname: 'api.railway.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rnd_IhokVABjjVOAk7WPcDwKE0zIGJXZ',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(query)
  }
};
const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(body));
});
req.on('error', (e) => console.error('Error:', e.message));
req.write(query);
req.end();
