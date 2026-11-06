$ErrorActionPreference='Stop'
$root=$PSScriptRoot.Replace('\','/')
$codexConfig=Join-Path $env:USERPROFILE '.codex/config.toml'
$content=if(Test-Path -LiteralPath $codexConfig){[IO.File]::ReadAllText($codexConfig)}else{''}
if($content -match '(?m)^\[mcp_servers\.zebra_labels\]') { Write-Output 'Zebra MCP is already configured. Restart Codex to load it.'; exit }
$block=@"

[mcp_servers.zebra_labels]
command = "$root/desktop/Zebra Label Studio.exe"
args = ["$root/desktop/resources/app/mcp.cjs"]
startup_timeout_sec = 45
tool_timeout_sec = 120

[mcp_servers.zebra_labels.env]
ELECTRON_RUN_AS_NODE = "1"
ZEBRA_STUDIO_DATA = "$root/data"
ZEBRA_STUDIO_APP = "$root/desktop/Zebra Label Studio.exe"

"@
[IO.Directory]::CreateDirectory((Split-Path $codexConfig)) | Out-Null
[IO.File]::AppendAllText($codexConfig,$block,[Text.UTF8Encoding]::new($false))
Write-Output 'Registered local Zebra Label Studio MCP. Restart Codex to load the tools.'
