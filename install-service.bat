@echo off
echo Installing SipLess as a Windows service...

nssm install SipLess cmd.exe
nssm set SipLess AppParameters "/c \"C:\Users\rquir\OneDrive\Documents\GitHub\sipless\sipless-service.bat\""
nssm set SipLess AppDirectory "C:\Users\rquir\OneDrive\Documents\GitHub\sipless"
nssm set SipLess AppStdout "C:\Users\rquir\OneDrive\Documents\GitHub\sipless\service.log"
nssm set SipLess AppStderr "C:\Users\rquir\OneDrive\Documents\GitHub\sipless\service.log"
nssm set SipLess AppRotateFiles 1
nssm set SipLess AppRotateBytes 1048576
nssm set SipLess Start SERVICE_AUTO_START
nssm start SipLess

echo Done. SipLess service installed and started.
pause
