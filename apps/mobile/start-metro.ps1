$env:NODE_ENV = "development"
Set-Location "C:\Users\LOUJAN B\Meal Rescue\apps\mobile"
npx expo start --clear --dev-client 2>&1 | Tee-Object -FilePath "C:\Users\LOUJAN B\Meal Rescue\apps\mobile\metro.log"
