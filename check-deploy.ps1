[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
$headers = @{
  "Authorization" = "Bearer rnd_IhokVABjjVOAk7WPcDwKE0zIGJXZ"
  "Content-Type" = "application/json"
}
$body = '{"query":"query { project(id: \"a7d17427-8708-4526-b5ae-b15c7254ac5a\") { deployments(first: 3, input: { environmentId: \"4c32c8b8-7e64-4728-809d-5800766961d1\" }) { edges { node { id state createdAt commitInfo { message commitSha } } } } } }"}'
try {
  $r = Invoke-WebRequest -Uri "https://api.railway.com/graphql" -Method POST -Headers $headers -Body $body -UseBasicParsing
  $r.Content
} catch {
  Write-Output "Error: $($_.Exception.Message)"
  if ($_.Exception.InnerException) { Write-Output "Inner: $($_.Exception.InnerException.Message)" }
}
