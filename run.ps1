# CAPEX dev runner — Windows fallback (PowerShell 5 or shebang unavailable)
# Prefer: ./run

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$Root = $PSScriptRoot
if ($Args.Count -eq 0) {
    & node "$Root\run" run
} else {
    & node "$Root\run" @Args
}
exit $LASTEXITCODE
