# Generate a secure secret and set it + deploy the function

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [System.BitConverter]::ToString($bytes) -replace '-', ''
Write-Host "Generated secret: $($secret.Substring(0,8))... (64 hex chars total: $($secret.Length))"

# Set the secret
$env:CHILD_SESSION_SECRET = $secret
Write-Host ""
Write-Host "Setting CHILD_SESSION_SECRET in Supabase..." -ForegroundColor Yellow
$result = npx supabase secrets set "CHILD_SESSION_SECRET=$secret" 2>&1
Write-Host $result

Write-Host ""
Write-Host "Deploying child-auth function..." -ForegroundColor Yellow
$deploy = npx supabase functions deploy child-auth --no-verify-jwt 2>&1
Write-Host $deploy

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "Secret length: $($secret.Length) chars"
