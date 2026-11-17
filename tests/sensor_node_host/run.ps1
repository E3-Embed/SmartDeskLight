param([ValidateSet('auto','msvc','g++')][string]$Compiler = 'auto')
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$msvcRoot = Get-ChildItem 'C:\Program Files\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*' -Directory -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
if ($Compiler -eq 'auto') {
  if ($msvcRoot) { $Compiler = 'msvc' } else { $Compiler = 'g++' }
}
$oldInclude = $env:INCLUDE
$oldLib = $env:LIB
Push-Location $repoRoot
try {
  if ($Compiler -eq 'msvc') {
    if (!$msvcRoot) { throw 'MSVC C++ build tools not found' }
    $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10'
    $sdkVersion = Get-ChildItem (Join-Path $sdkRoot 'Include') -Directory | Sort-Object Name | Select-Object -Last 1 -ExpandProperty Name
    $env:INCLUDE = "$msvcRoot\include;$sdkRoot\Include\$sdkVersion\ucrt;$sdkRoot\Include\$sdkVersion\shared;$sdkRoot\Include\$sdkVersion\um"
    $env:LIB = "$msvcRoot\lib\x64;$sdkRoot\Lib\$sdkVersion\ucrt\x64;$sdkRoot\Lib\$sdkVersion\um\x64"
  }
  foreach ($major in 2,3) {
    $outputPath = Join-Path $env:TEMP "smartdesk-node-test$major.exe"
    if ($Compiler -eq 'msvc') {
      & "$msvcRoot\bin\Hostx64\x64\cl.exe" /nologo /EHsc /std:c++14 "/DESP_ARDUINO_VERSION_MAJOR=$major" /Itests/sensor_node_host /Ifirmware/sensor_node/include /Ifirmware/common tests/sensor_node_host/test.cpp "/Fo$env:TEMP\smartdesk-node-test$major.obj" "/Fe$outputPath"
    } else {
      & g++ -std=c++11 -Wall -Wextra -Werror "-DESP_ARDUINO_VERSION_MAJOR=$major" -Itests/sensor_node_host -Ifirmware/sensor_node/include -Ifirmware/common tests/sensor_node_host/test.cpp -o $outputPath
    }
    if ($LASTEXITCODE -ne 0) { throw "Compile failed: Arduino $major" }
    & $outputPath
    if ($LASTEXITCODE -ne 0) { throw "Test failed: Arduino $major" }
  }
} finally {
  Pop-Location
  $env:INCLUDE = $oldInclude
  $env:LIB = $oldLib
}
