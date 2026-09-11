fetch('https://api.railway.com/graphql', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rnd_IhokVABjjVOAk7WPcDwKE0zIGJXZ',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `query { deployments(input: { projectId: "a7d17427-8708-4526-b5ae-b15c7254ac5a", environmentId: "4c32c8b8-7e64-4728-809d-5800766961d1", first: 3 }) { edges { node { id state createdAt commitInfo { message commitSha } } } } }`
  })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(e => console.error(e));
