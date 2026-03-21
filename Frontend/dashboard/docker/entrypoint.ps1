$value = $env:API_BASE_URL
if ([string]::IsNullOrWhiteSpace($value)) {
  $value = $env:NEXT_PUBLIC_API_BASE_URL
}
if ($null -eq $value) {
  $value = ""
}

$json = @{ API_BASE_URL = $value } | ConvertTo-Json -Compress
Set-Content -Path "C:\app\public\runtime-config.js" -Value ("window.__APP_RUNTIME_CONFIG__ = " + $json + ";") -Encoding UTF8

if ($args.Count -gt 0) {
  & $args[0] $args[1..($args.Count - 1)]
} else {
  node server.js
}
