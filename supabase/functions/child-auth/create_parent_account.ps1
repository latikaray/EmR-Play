# Create a confirmed parent account using Supabase Admin API
# No OTP required — service_role bypasses email verification

$SUPABASE_URL   = "https://ecaimdsdugxouzaeyfub.supabase.co"
$SERVICE_ROLE   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY3MjI1OSwiZXhwIjoyMDY4MjQ4MjU5fQ.9zBNLpYHRFtNJfHxngDIG9BKs57AJ2ees83m_MI-Ixs"
$ANON_KEY       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NzIyNTksImV4cCI6MjA2ODI0ODI1OX0.LJiu7qJarcPqCLaIpldl0uxWmVAokuhudWAt_r-Pbzw"

$PARENT_EMAIL    = "latikar109@gmail.com"
$PARENT_PASSWORD = "Parent@20"
$DISPLAY_NAME    = "Latika"

$adminHeaders = @{
    "apikey"        = $SERVICE_ROLE
    "Authorization" = "Bearer $SERVICE_ROLE"
    "Content-Type"  = "application/json"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Creating Confirmed Parent Account" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Create the auth user (email_confirm = true → no OTP) ─────────────
Write-Host "Step 1: Creating auth user..." -ForegroundColor Yellow

$userBody = @{
    email          = $PARENT_EMAIL
    password       = $PARENT_PASSWORD
    email_confirm  = $true
    user_metadata  = @{
        role         = "parent"
        display_name = $DISPLAY_NAME
    }
} | ConvertTo-Json

$userId = $null
try {
    $userResp = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/admin/users" `
        -Method POST -Headers $adminHeaders -Body $userBody
    $userId = $userResp.id
    Write-Host "  -> Created user: $userId" -ForegroundColor Green
    Write-Host "     email: $($userResp.email)" -ForegroundColor DarkGray
    Write-Host "     confirmed: $($userResp.email_confirmed_at)" -ForegroundColor DarkGray
} catch {
    # User might already exist — try to find them
    $errMsg = $_.ToString()
    if ($errMsg -match "already" -or $errMsg -match "duplicate" -or $errMsg -match "422") {
        Write-Host "  -> User already exists, fetching ID..." -ForegroundColor DarkYellow
        try {
            $listResp = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/admin/users?email=$([Uri]::EscapeDataString($PARENT_EMAIL))" `
                -Method GET -Headers $adminHeaders
            $userId = $listResp.users[0].id
            Write-Host "  -> Found existing user: $userId" -ForegroundColor Green

            # Auto-confirm if not already confirmed
            $confirmBody = @{ email_confirm = $true } | ConvertTo-Json
            Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/admin/users/$userId" `
                -Method PUT -Headers $adminHeaders -Body $confirmBody | Out-Null
            Write-Host "  -> Email confirmed" -ForegroundColor Green
        } catch {
            Write-Host "  FATAL: Could not fetch existing user: $_" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  FATAL: $errMsg" -ForegroundColor Red
        exit 1
    }
}

if (-not $userId) {
    Write-Host "  FATAL: No user ID obtained" -ForegroundColor Red
    exit 1
}

# ── Step 2: Sign in as admin to get a service_role Postgres session ──────────
# Use service_role key directly as the bearer for PostgREST admin calls

$pgHeaders = @{
    "apikey"        = $SERVICE_ROLE
    "Authorization" = "Bearer $SERVICE_ROLE"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=representation"
}

# ── Step 3: Upsert user_roles row ────────────────────────────────────────────
Write-Host ""
Write-Host "Step 2: Setting user role to 'parent'..." -ForegroundColor Yellow

$roleBody = @{
    user_id = $userId
    role    = "parent"
} | ConvertTo-Json

try {
    $roleResp = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/rest/v1/user_roles?on_conflict=user_id,role" `
        -Method POST `
        -Headers ($pgHeaders + @{ "Prefer" = "return=representation,resolution=ignore-duplicates" }) `
        -Body $roleBody
    Write-Host "  -> Role set: parent" -ForegroundColor Green
} catch {
    # Might already exist (Phase A signup attempt partially created it)
    Write-Host "  -> Role row may already exist (OK): $($_.ToString().Split([Environment]::NewLine)[0])" -ForegroundColor DarkYellow
}

# ── Step 4: Upsert parent_profiles row ───────────────────────────────────────
Write-Host ""
Write-Host "Step 3: Creating parent profile..." -ForegroundColor Yellow

$profileBody = @{
    user_id      = $userId
    display_name = $DISPLAY_NAME
} | ConvertTo-Json

try {
    $profileResp = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/rest/v1/parent_profiles?on_conflict=user_id" `
        -Method POST `
        -Headers ($pgHeaders + @{ "Prefer" = "return=representation,resolution=merge-duplicates" }) `
        -Body $profileBody
    Write-Host "  -> Profile created: $DISPLAY_NAME" -ForegroundColor Green
} catch {
    Write-Host "  -> Profile may already exist (OK): $($_.ToString().Split([Environment]::NewLine)[0])" -ForegroundColor DarkYellow
}

# ── Step 5: Verify sign-in works ─────────────────────────────────────────────
Write-Host ""
Write-Host "Step 4: Verifying sign-in works..." -ForegroundColor Yellow

$signInBody = @{ email = $PARENT_EMAIL; password = $PARENT_PASSWORD } | ConvertTo-Json
try {
    $signInResp = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
        -Method POST `
        -Headers @{ "apikey" = $ANON_KEY; "Content-Type" = "application/json" } `
        -Body $signInBody
    $token = $signInResp.access_token
    Write-Host "  -> Sign-in SUCCESS" -ForegroundColor Green
    Write-Host "     access_token: $($token.Substring(0, 40))..." -ForegroundColor DarkGray
} catch {
    Write-Host "  FAIL: Sign-in failed: $_" -ForegroundColor Red
    exit 1
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Account Ready!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Email   : $PARENT_EMAIL" -ForegroundColor White
Write-Host "  Password: $PARENT_PASSWORD" -ForegroundColor White
Write-Host "  Role    : parent (confirmed)" -ForegroundColor White
Write-Host ""
Write-Host "  You can now sign in at: http://localhost:8080/parent/login" -ForegroundColor Cyan
Write-Host ""
