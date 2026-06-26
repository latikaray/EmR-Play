# Fix user_roles: ensure latikar109@gmail.com has role=parent

$SR  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY3MjI1OSwiZXhwIjoyMDY4MjQ4MjU5fQ.9zBNLpYHRFtNJfHxngDIG9BKs57AJ2ees83m_MI-Ixs"
$URL = "https://ecaimdsdugxouzaeyfub.supabase.co"
$UID = "30cf4c6f-c46a-4933-a73c-1f476e638e00"   # latikar109@gmail.com

$h = @{
    "apikey"        = $SR
    "Authorization" = "Bearer $SR"
}
$hJson = @{
    "apikey"        = $SR
    "Authorization" = "Bearer $SR"
    "Content-Type"  = "application/json"
}

# Check existing
Write-Host "Current user_roles for this user:"
$existing = Invoke-RestMethod -Uri "$URL/rest/v1/user_roles?user_id=eq.$UID" -Method GET -Headers $h
Write-Host ($existing | ConvertTo-Json -Compress)

# Delete all existing role rows for this user
Invoke-RestMethod -Uri "$URL/rest/v1/user_roles?user_id=eq.$UID" -Method DELETE -Headers $h | Out-Null
Write-Host "Deleted existing role rows"

# Insert fresh parent role
$body = @{ user_id = $UID; role = "parent" } | ConvertTo-Json
$hReturn = $hJson + @{ "Prefer" = "return=representation" }
$ins = Invoke-RestMethod -Uri "$URL/rest/v1/user_roles" -Method POST -Headers $hReturn -Body $body
Write-Host "Inserted: $($ins | ConvertTo-Json -Compress)"
Write-Host ""
Write-Host "Done! latikar109@gmail.com now has role=parent" -ForegroundColor Green
