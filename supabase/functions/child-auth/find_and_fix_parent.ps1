# Find latikar109@gmail.com user ID and reset password

$SERVICE_ROLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY3MjI1OSwiZXhwIjoyMDY4MjQ4MjU5fQ.9zBNLpYHRFtNJfHxngDIG9BKs57AJ2ees83m_MI-Ixs"
$ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NzIyNTksImV4cCI6MjA2ODI0ODI1OX0.LJiu7qJarcPqCLaIpldl0uxWmVAokuhudWAt_r-Pbzw"
$SUPABASE_URL = "https://ecaimdsdugxouzaeyfub.supabase.co"
$TARGET_EMAIL = "latikar109@gmail.com"
$NEW_PASSWORD = "Parent@20"

$adminHeaders = @{
    "apikey"        = $SERVICE_ROLE
    "Authorization" = "Bearer $SERVICE_ROLE"
    "Content-Type"  = "application/json"
}

Write-Host ""
Write-Host "Searching for $TARGET_EMAIL in auth.users..." -ForegroundColor Yellow

# List all users and filter
$listResp = Invoke-RestMethod `
    -Uri "$SUPABASE_URL/auth/v1/admin/users?per_page=100" `
    -Method GET -Headers $adminHeaders

$targetUser = $listResp.users | Where-Object { $_.email -eq $TARGET_EMAIL }

if (-not $targetUser) {
    Write-Host "  User not found! Creating fresh..." -ForegroundColor DarkYellow
    $createBody = @{
        email         = $TARGET_EMAIL
        password      = $NEW_PASSWORD
        email_confirm = $true
        user_metadata = @{ role = "parent"; display_name = "Latika" }
    } | ConvertTo-Json
    $targetUser = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/auth/v1/admin/users" `
        -Method POST -Headers $adminHeaders -Body $createBody
    Write-Host "  -> Created: $($targetUser.id)" -ForegroundColor Green
} else {
    Write-Host "  -> Found: $($targetUser.id) | email_confirmed: $($targetUser.email_confirmed_at)" -ForegroundColor Green

    # Reset password + confirm
    $resetBody = @{ password = $NEW_PASSWORD; email_confirm = $true } | ConvertTo-Json
    $updated = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/auth/v1/admin/users/$($targetUser.id)" `
        -Method PUT -Headers $adminHeaders -Body $resetBody
    Write-Host "  -> Password reset. Confirmed: $($updated.email_confirmed_at)" -ForegroundColor Green
}

$userId = $targetUser.id

# Ensure user_roles = parent
Write-Host ""
Write-Host "Setting user role to parent..." -ForegroundColor Yellow
$pgHeaders = @{
    "apikey"        = $SERVICE_ROLE
    "Authorization" = "Bearer $SERVICE_ROLE"
    "Content-Type"  = "application/json"
    "Prefer"        = "resolution=ignore-duplicates"
}
$roleBody = @{ user_id = $userId; role = "parent" } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/user_roles" `
        -Method POST -Headers $pgHeaders -Body $roleBody | Out-Null
    Write-Host "  -> Role: parent set" -ForegroundColor Green
} catch {
    Write-Host "  -> Role already exists (OK)" -ForegroundColor DarkYellow
}

# Verify sign-in
Write-Host ""
Write-Host "Verifying login..." -ForegroundColor Yellow
$signInBody = @{ email = $TARGET_EMAIL; password = $NEW_PASSWORD } | ConvertTo-Json
try {
    $signIn = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
        -Method POST `
        -Headers @{ "apikey" = $ANON_KEY; "Content-Type" = "application/json" } `
        -Body $signInBody
    Write-Host "  -> LOGIN SUCCESS" -ForegroundColor Green

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Account Ready!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Email   : $TARGET_EMAIL"
    Write-Host "  Password: $NEW_PASSWORD"
    Write-Host "  User ID : $userId"
    Write-Host ""
    Write-Host "  -> Login at: http://localhost:8080/parent/login" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "  -> Login FAILED: $_" -ForegroundColor Red
}
