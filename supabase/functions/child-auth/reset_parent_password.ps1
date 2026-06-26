# Reset password and verify sign-in for existing parent account

$SERVICE_ROLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY3MjI1OSwiZXhwIjoyMDY4MjQ4MjU5fQ.9zBNLpYHRFtNJfHxngDIG9BKs57AJ2ees83m_MI-Ixs"
$ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NzIyNTksImV4cCI6MjA2ODI0ODI1OX0.LJiu7qJarcPqCLaIpldl0uxWmVAokuhudWAt_r-Pbzw"
$SUPABASE_URL = "https://ecaimdsdugxouzaeyfub.supabase.co"
$USER_ID      = "30d9f00f-a6af-41d5-b3e5-85c6743330df"
$EMAIL        = "latikar109@gmail.com"
$NEW_PASSWORD = "Parent@20"

$adminHeaders = @{
    "apikey"        = $SERVICE_ROLE
    "Authorization" = "Bearer $SERVICE_ROLE"
    "Content-Type"  = "application/json"
}

Write-Host ""
Write-Host "Step 1: Resetting password for $EMAIL ..." -ForegroundColor Yellow

$resetBody = @{
    password      = $NEW_PASSWORD
    email_confirm = $true
} | ConvertTo-Json

$resetResp = Invoke-RestMethod `
    -Uri "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" `
    -Method PUT -Headers $adminHeaders -Body $resetBody

Write-Host "  -> Password reset for: $($resetResp.email)" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Verifying sign-in..." -ForegroundColor Yellow

$signInBody = @{ email = $EMAIL; password = $NEW_PASSWORD } | ConvertTo-Json
$signIn = Invoke-RestMethod `
    -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
    -Method POST `
    -Headers @{ "apikey" = $ANON_KEY; "Content-Type" = "application/json" } `
    -Body $signInBody

Write-Host "  -> Sign-in SUCCESS" -ForegroundColor Green
Write-Host "     token: $($signIn.access_token.Substring(0, 40))..." -ForegroundColor DarkGray

Write-Host ""
Write-Host "Step 3: Ensuring user_roles row exists..." -ForegroundColor Yellow

$pgHeaders = @{
    "apikey"        = $SERVICE_ROLE
    "Authorization" = "Bearer $SERVICE_ROLE"
    "Content-Type"  = "application/json"
    "Prefer"        = "resolution=ignore-duplicates"
}

$roleBody = @{ user_id = $USER_ID; role = "parent" } | ConvertTo-Json
try {
    Invoke-RestMethod `
        -Uri "$SUPABASE_URL/rest/v1/user_roles" `
        -Method POST -Headers $pgHeaders -Body $roleBody | Out-Null
    Write-Host "  -> user_roles: parent role confirmed" -ForegroundColor Green
} catch {
    Write-Host "  -> user_roles row already existed (OK)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Account Ready to Use!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Email   : $EMAIL"
Write-Host "  Password: $NEW_PASSWORD"
Write-Host "  User ID : $USER_ID"
Write-Host ""
Write-Host "  -> Login at: http://localhost:8080/parent/login" -ForegroundColor Cyan
Write-Host ""
