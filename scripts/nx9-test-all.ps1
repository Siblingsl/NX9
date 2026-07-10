# nx9-test-all.ps1 — NX9 一键全流程测试脚本
# §3.2 规格强制实现

$ErrorActionPreference = 'Stop'
$RunId = Get-Date -Format 'yyyyMMdd-HHmmss'
$ReportDir = 'docs/test-reports'
$Report = "$ReportDir/TEST-RUN-$RunId-report.md"
$RootDir = Split-Path -Parent $PSScriptRoot
$StartTime = Get-Date
$global:StepResults = @()

function Step($Name, $ScriptBlock) {
  $stepStart = Get-Date
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  $result = 'FAIL'
  $actual = 'unknown'
  try {
    & $ScriptBlock
    $exitCode = $LASTEXITCODE
    if ($exitCode -and $exitCode -ne 0) { throw "exit code $exitCode" }
    $result = 'PASS'
    $actual = 'exit 0'
    $elapsed = "{0:N1}s" -f ((Get-Date) - $stepStart).TotalSeconds
    Write-Host "✓ $Name 通过 ($elapsed)" -ForegroundColor Green
  } catch {
    $result = 'FAIL'
    $actual = "FAIL: $_"
    $elapsed = "{0:N1}s" -f ((Get-Date) - $stepStart).TotalSeconds
    Write-Host "✗ $Name 失败: $_" -ForegroundColor Red
  }
  $global:StepResults = $global:StepResults + @{ Step = $Name; Cmd = ''; Expected = 'exit 0'; Actual = $actual; Elapsed = $elapsed; Result = $result }
}

# 0. 报告头信息
$GitCommit = git -C $RootDir rev-parse --short HEAD 2>$null
$GitDirty = git -C $RootDir status --porcelain 2>$null
$DirtyFlag = if ($GitDirty) { 'dirty' } else { 'clean' }
$NodeVer = node --version

Write-Host "NX9 测试运行 $RunId" -ForegroundColor Magenta
Write-Host "Git: $GitCommit ($DirtyFlag) · Node: $NodeVer" -ForegroundColor Magenta

Push-Location $RootDir

# ST-0 静态门禁
Step 'ST-0-shared-build'  { npm run build -w @nx9/shared }
Step 'ST-0-web-typecheck' { npm run typecheck -w @nx9/web }
Step 'ST-0-server-build'  { Push-Location apps\server; npm run build:nest; Pop-Location }

# ST-2 服务端 vitest 全量
Step 'ST-2-vitest-all'    { Push-Location apps\server; npm run test; Pop-Location }
Step 'ST-2-vitest-wf'     { Push-Location apps\server; npm run test -- test-wf.test.ts; Pop-Location }

Pop-Location

# 生成报告
$TotalTime = "{0:N1}s" -f ((Get-Date) - $StartTime).TotalSeconds
$PassCount = 0; $FailCount = 0
foreach ($r in $global:StepResults) {
  if ($r.Result -eq 'PASS') { $PassCount++ } else { $FailCount++ }
}
$Conclusion = if ($FailCount -gt 0) { 'FAIL' } else { 'PASS' }

$ReportContent = @"
# TEST-RUN-$RunId 自测报告

- **执行者**: AI Agent (nx9-test-all.ps1)
- **执行时间**: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
- **Git 基线**: $GitCommit ($DirtyFlag)
- **Node 版本**: $NodeVer
- **总耗时**: $TotalTime
- **自测结论**: $Conclusion

## ST 执行记录

| 层级 | Step | 命令 | 期望 | 实际 | 耗时 | 结果 |
|------|------|------|------|------|------|------|
"@

foreach ($r in $global:StepResults) {
  $ReportContent += "| $($r.Step) | $($r.Step) | npm run ... | $($r.Expected) | $($r.Actual) | $($r.Elapsed) | $($r.Result) |`n"
}

$Unlocked = @()
if ($Conclusion -eq 'PASS') {
  $Unlocked += '- **E2E-001** 短剧最小闭环 — 打开 `docs/NX9-TEST-REQUIREMENTS-SPEC.md` §6.3'
  $Unlocked += '- **TEST-SB-001** 故事板导入 — 完成 E2E-001 后方可测试'
}

$ReportContent += @"

## 汇总

- **通过**: $PassCount / $($global:StepResults.Count)
- **失败**: $FailCount
- **自测结论**: $Conclusion

## 已解锁人工测试

$(if ($Conclusion -eq 'PASS') { $Unlocked -join "`n" } else { '无（自测 FAIL）' })

## 人工测试入口

打开 docs/NX9-TEST-REQUIREMENTS-SPEC.md §7，从 E2E-001 开始。

---

*由 nx9-test-all.ps1 自动生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')*
"@

New-Item -ItemType File -Path $Report -Force | Out-Null
Set-Content -Path $Report -Value $ReportContent -Encoding UTF8
Write-Host "`n报告已写入: $Report" -ForegroundColor Yellow

if ($Conclusion -eq 'PASS') {
  Write-Host "`n✅ 全部通过！人工测试已解锁。" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n❌ 存在失败项，请修复后重试。" -ForegroundColor Red
  exit 1
}
