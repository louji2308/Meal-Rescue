$ErrorActionPreference = 'Stop'
$key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\postgres.exe'
if (-not (Test-Path $key)) {
    New-Item -Path $key -Force | Out-Null
}
# Disable ForceRelocateImages (ASLR) for postgres.exe — documented fix for
# PostgreSQL Windows error 487 "could not reserve shared memory region".
New-ItemProperty -Path $key -Name 'MitigationOptions' -PropertyType QWord -Value 0x100000000 -Force | Out-Null
$val = (Get-ItemProperty -Path $key).MitigationOptions
$out = "postgres.exe IFEO MitigationOptions set to 0x{0:X}" -f $val
$out | Out-File -FilePath "$env:TEMP\ifoe-pg-result.txt" -Encoding utf8
