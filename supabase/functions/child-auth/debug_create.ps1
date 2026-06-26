# Query Supabase edge function logs via management API
# This hits the Supabase platform API (not the project REST API)

$SERVICE_ROLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY3MjI1OSwiZXhwIjoyMDY4MjQ4MjU5fQ.9zBNLpYHRFtNJfHxngDIG9BKs57AJ2ees83m_MI-Ixs"
$ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NzIyNTksImV4cCI6MjA2ODI0ODI1OX0.LJiu7qJarcPqCLaIpldl0uxWmVAokuhudWAt_r-Pbzw"
$SUPABASE_URL = "https://ecaimdsdugxouzaeyfub.supabase.co"
$EDGE_URL     = "https://ecaimdsdugxouzaeyfub.supabase.co/functions/v1/child-auth"
$PARENT_EMAIL = "latikar109@gmail.com"
$PARENT_PASS  = "Parent@20"

# Sign in
$signIn = Invoke-RestMethod `
    -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
    -Method POST `
    -Headers @{ "apikey" = $ANON_KEY; "Content-Type" = "application/json" } `
    -Body (@{ email = $PARENT_EMAIL; password = $PARENT_PASS } | ConvertTo-Json)
$JWT = $signIn.access_token

# Test with a simple username - try very minimal payload
$testCases = @(
    @{ action="create_child"; username="abc"; password="TestPass1!!"; displayName="Test" },
    @{ action="create_child"; username="testchild1"; password="TestPass123!!" }
)

foreach ($tc in $testCases) {
    Write-Host "Testing: $($tc | ConvertTo-Json -Compress)"

    $h = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $JWT" }
    try {
        $r = Invoke-WebRequest -Uri $EDGE_URL -Method POST -Headers $h `
            -Body ($tc | ConvertTo-Json -Compress) -UseBasicParsing
        Write-Host "  -> $($r.StatusCode): $($r.Content)"
    } catch {
        $sc = 0; $body = ""
        if ($_.Exception.Response) {
            $sc = [int]$_.Exception.Response.StatusCode
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
        }
        Write-Host "  -> HTTP $sc : $body"
    }
    Write-Host ""
}

# Also check the CHILD_SESSION_SECRET validation path
# (The function checks this FIRST before any action)
Write-Host "Testing with no auth (checks env validation path):"
$h2 = @{ "Content-Type" = "application/json" }
try {
    $r2 = Invoke-WebRequest -Uri $EDGE_URL -Method POST -Headers $h2 `
        -Body '{"action":"login","username":"x","parentEmail":"x@x.com","password":"xxxxxxxx"}' -UseBasicParsing
    Write-Host "  -> $($r2.StatusCode): $($r2.Content)"
} catch {
    $sc2 = 0; $b2 = ""
    if ($_.Exception.Response) {
        $sc2 = [int]$_.Exception.Response.StatusCode
        $reader2 = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $b2 = $reader2.ReadToEnd()
    }
    Write-Host "  -> HTTP $sc2 : $b2"
}
