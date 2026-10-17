param(
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'chengemr/cfnew',
    [string]$ReportDirectory = (Join-Path $env:TEMP 'cfnew-defender-report')
)

# Run only on an isolated, disposable Windows runner. Samples are never executed.
# The sample directory is deliberately outside the checkout and report directory.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sampleRoot = 'C:\cfnew-defender-samples'
$eventLog = 'Microsoft-Windows-Windows Defender/Operational'
$script:MpPath = $null
$script:PreparationErrors = @()
$script:Results = @()
$script:Ready = $false
$script:FatalError = $null
$exitCode = 1
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null

function Write-JsonReport([string]$Name, $Value) {
    ConvertTo-Json -InputObject $Value -Depth 15 | Set-Content -LiteralPath (Join-Path $ReportDirectory $Name) -Encoding UTF8
}

function Get-DefenderSnapshot {
    $snapshot = [ordered]@{ AtUtc = [DateTime]::UtcNow.ToString('o') }
    try {
        $snapshot.Service = Get-Service WinDefend -ErrorAction Stop | Select-Object Name, Status, StartType
    } catch { $snapshot.ServiceError = $_.Exception.Message }
    try {
        $snapshot.Status = Get-MpComputerStatus -ErrorAction Stop | Select-Object AMRunningMode,
            AMServiceEnabled, AntivirusEnabled, AntispywareEnabled, RealTimeProtectionEnabled,
            BehaviorMonitorEnabled, IoavProtectionEnabled, OnAccessProtectionEnabled,
            AMEngineVersion, AMProductVersion, AMServiceVersion, AntivirusSignatureVersion,
            AntivirusSignatureLastUpdated, AntivirusSignatureAge, DefenderSignaturesOutOfDate,
            NISEnabled, IsTamperProtected
    } catch { $snapshot.StatusError = $_.Exception.Message }
    try {
        $snapshot.Preferences = Get-MpPreference -ErrorAction Stop | Select-Object ExclusionPath,
            ExclusionExtension, ExclusionProcess, DisableArchiveScanning, DisableScriptScanning,
            DisableIOAVProtection, DisableRealtimeMonitoring, DisableBehaviorMonitoring,
            MAPSReporting, SubmitSamplesConsent, DisableBlockAtFirstSeen, CloudBlockLevel,
            DisableScanningNetworkFiles, DisableAutoExclusions
    } catch { $snapshot.PreferenceError = $_.Exception.Message }
    try {
        $policy = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Advanced Threat Protection' -ErrorAction Stop
        $snapshot.ForceDefenderPassiveMode = $policy.ForceDefenderPassiveMode
    } catch { $snapshot.PassiveModePolicyError = $_.Exception.Message }
    return $snapshot
}

function Get-DefenderEvents([long]$AfterRecordId) {
    try {
        $events = @(Get-WinEvent -FilterHashtable @{ LogName = $eventLog; Id = @(1000,1001,1002,1116,1117,1118,1119,5007) } -ErrorAction SilentlyContinue |
            Where-Object { $_.RecordId -gt $AfterRecordId } | Sort-Object RecordId |
            ForEach-Object {
                $raw = $_.ToXml()
                $xml = [xml]$raw
                $data = [ordered]@{}
                foreach ($field in $xml.Event.EventData.Data) {
                    $key = [string]$field.Name
                    if (-not $key) { $key = 'Unnamed' + $data.Count }
                    $data[$key] = [string]$field.'#text'
                }
                [pscustomobject]@{ RecordId = $_.RecordId; EventId = $_.Id;
                    TimeCreated = $_.TimeCreated.ToUniversalTime().ToString('o');
                    Fields = $data; Message = $_.Message; Xml = $raw }
            })
        return $events
    } catch {
        return @([pscustomobject]@{ EventReadError = $_.Exception.Message })
    }
}

function Get-EventWatermark {
    try { return [long](Get-WinEvent -LogName $eventLog -MaxEvents 1 -ErrorAction Stop).RecordId }
    catch { return [long]0 }
}

function Get-ThreatSnapshot {
    $value = [ordered]@{}
    try { $value.Detections = @(Get-MpThreatDetection -ErrorAction Stop | Select-Object DetectionID, ThreatID,
        Resources, InitialDetectionTime, LastThreatStatusChangeTime, RemediationTime, ActionSuccess,
        CurrentThreatExecutionStatusID, ThreatStatusID, ThreatStatusErrorCode, ProcessName, DetectionSourceTypeID) }
    catch { $value.DetectionError = $_.Exception.Message }
    try { $value.Threats = @(Get-MpThreat -ErrorAction Stop | Select-Object ThreatID, ThreatName, SeverityID,
        CategoryID, IsActive, DidThreatExecute, Resources, RollupStatus) }
    catch { $value.ThreatError = $_.Exception.Message }
    return $value
}

function Invoke-MpDiagnostic([string]$Label, [string[]]$Arguments) {
    $outFile = Join-Path $ReportDirectory ($Label + '.stdout.txt')
    $errFile = Join-Path $ReportDirectory ($Label + '.stderr.txt')
    $started = [DateTime]::UtcNow.ToString('o')
    # All arguments are known switches or locally constructed paths without quotes.
    $quoted = ($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    try {
        $process = Start-Process -FilePath $script:MpPath -ArgumentList $quoted -PassThru -Wait -NoNewWindow -RedirectStandardOutput $outFile -RedirectStandardError $errFile
        $result = [ordered]@{ StartedUtc = $started; EndedUtc = [DateTime]::UtcNow.ToString('o');
            Arguments = $Arguments; ExitCode = $process.ExitCode;
            Stdout = [string](Get-Content -LiteralPath $outFile -Raw -ErrorAction SilentlyContinue);
            Stderr = [string](Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue) }
    } catch {
        $result = [ordered]@{ StartedUtc = $started; EndedUtc = [DateTime]::UtcNow.ToString('o');
            Arguments = $Arguments; Error = $_.Exception.Message; ExitCode = $null }
    }
    Write-JsonReport ($Label + '.json') $result
    return $result
}

function Test-ExclusionResult($Result) {
    $text = [string]$Result.Stdout + ' ' + [string]$Result.Stderr
    # Preserve raw exit codes; do not assume undocumented CheckExclusion exit semantics.
    if ($text -match '(?i)\bnot\s+excluded\b') { return 'not_excluded' }
    if ($text -match '(?i)\bis\s+excluded\b') { return 'excluded' }
    return 'unknown'
}

function Get-ByteHash([byte[]]$Bytes) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}

function Get-PublicBytes([string]$Url) {
    # HttpClient downloads the ORIGINAL bytes into memory so their SHA can be
    # checked before realtime protection can quarantine a newly written sample.
    # There is no decoding, repacking, renaming to evade detection, or execution.
    $bytes = $script:AssetClient.GetByteArrayAsync($Url).GetAwaiter().GetResult()
    return ,([byte[]]$bytes)
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $admin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Write-JsonReport 'runner.json' ([ordered]@{ Repository = $Repository; StartedUtc = [DateTime]::UtcNow.ToString('o');
        OS = [Environment]::OSVersion.VersionString; PowerShell = $PSVersionTable.PSVersion.ToString();
        ImageOS = $env:ImageOS; ImageVersion = $env:ImageVersion; IsAdministrator = $admin;
        SampleDirectory = $sampleRoot; SampleSubmissionPolicy = 'Unchanged; no manual sample submission or appeal is performed.' })
    if (-not $admin) { throw 'Administrator privileges are required to restore Defender protection on this disposable runner.' }
    Import-Module Defender -ErrorAction Stop
    Write-JsonReport 'defender-before.json' (Get-DefenderSnapshot)
    Write-JsonReport 'threats-before.json' (Get-ThreatSnapshot)
    $script:InitialWatermark = Get-EventWatermark

    # Use Defender's documented CUSTOM-SCAN -DisableRemediation option. Its
    # own -? help explains that file exclusions are ignored, archives are
    # scanned, detections are printed, and remediation/event/UI logging is not
    # performed for that scan. Do not change realtime/cloud/exclusion policy.
    try {
        $service = Get-Service WinDefend -ErrorAction Stop
        if ($service.Status -ne 'Running') {
            Set-Service WinDefend -StartupType Automatic -ErrorAction Stop
            Start-Service WinDefend -ErrorAction Stop
        }
    } catch { $script:PreparationErrors += 'Start WinDefend: ' + $_.Exception.Message }
    try { Update-MpSignature -ErrorAction Stop }
    catch { $script:PreparationErrors += 'Update signatures: ' + $_.Exception.Message }

    New-Item -ItemType Directory -Path $sampleRoot -Force | Out-Null
    $platformRoot = Join-Path $env:ProgramData 'Microsoft\Windows Defender\Platform'
    $platforms = @(Get-ChildItem -LiteralPath $platformRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
    foreach ($platform in $platforms) {
        $candidate = Join-Path $platform.FullName 'MpCmdRun.exe'
        if (Test-Path -LiteralPath $candidate) { $script:MpPath = $candidate; break }
    }
    if (-not $script:MpPath) {
        $candidate = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
        if (Test-Path -LiteralPath $candidate) { $script:MpPath = $candidate }
    }
    if (-not $script:MpPath) { throw 'MpCmdRun.exe is unavailable; no Defender scan was performed.' }
    $help = Invoke-MpDiagnostic 'mpcmdrun-help' @('-?')
    $maps = Invoke-MpDiagnostic 'maps-connectivity' @('-ValidateMapsConnection')
    $rootExclusion = Invoke-MpDiagnostic 'sample-root-exclusion' @('-CheckExclusion','-Path',$sampleRoot)
    $after = Get-DefenderSnapshot
    Write-JsonReport 'defender-after-prepare.json' $after
    Write-JsonReport 'preparation-errors.json' $script:PreparationErrors
    $status = $after.Status
    $prefs = $after.Preferences
    $missing = @()
    if (-not $status.AMServiceEnabled) { $missing += 'Antimalware service is not enabled' }
    if (-not $status.AMEngineVersion -or -not $status.AntivirusSignatureVersion -or $status.AntivirusSignatureVersion -eq '0.0.0.0') { $missing += 'Engine/signatures missing' }
    if ($status.DefenderSignaturesOutOfDate) { $missing += 'Security intelligence is out of date' }
    if (([string]$help.Stdout + [string]$help.Stderr) -notmatch '\-DisableRemediation') { $missing += 'The installed MpCmdRun help does not advertise -DisableRemediation' }
    $script:Ready = ($missing.Count -eq 0)
    Write-JsonReport 'readiness.json' ([ordered]@{ Ready = $script:Ready; Missing = $missing; MpCmdRun = $script:MpPath;
        MapsConnectivityExitCode = $maps.ExitCode; SampleSubmissionConsent = $prefs.SubmitSamplesConsent;
        ScanMode = 'CustomScan -DisableRemediation: ignore file exclusions and scan archives; no remediation or detection event/UI entry for this scan. Raw console output is primary evidence.';
        Caveat = 'This hosted Server engine is not the user device. Cloud/model/reputation, definitions, realtime and script policies can differ. Existing realtime, cloud, exclusion and sample-submission policies are not changed.' })
    if (-not $script:Ready) { throw ('Defender readiness is insufficient: ' + ($missing -join '; ')) }

    Add-Type -AssemblyName System.Net.Http
    $script:AssetClient = New-Object System.Net.Http.HttpClient
    $script:AssetClient.Timeout = [TimeSpan]::FromSeconds(90)
    $script:AssetClient.DefaultRequestHeaders.UserAgent.ParseAdd('CFnew-Defender-Diagnostics/1.0')
    foreach ($tag in @('v4.0.6','v4.0.7')) {
        try {
            $release = Invoke-RestMethod -Uri ('https://api.github.com/repos/' + $Repository + '/releases/tags/' + $tag) -Headers @{ 'User-Agent' = 'CFnew-Defender-Diagnostics/1.0'; 'Accept' = 'application/vnd.github+json' }
            $manifestAsset = @($release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' })[0]
            if (-not $manifestAsset) { throw ('Release ' + $tag + ' has no SHA256SUMS.txt') }
            $manifest = [Text.Encoding]::UTF8.GetString((Get-PublicBytes $manifestAsset.browser_download_url))
            $manifest | Set-Content -LiteralPath (Join-Path $ReportDirectory ($tag + '-SHA256SUMS.txt')) -Encoding UTF8
            $hashes = @{}
            foreach ($line in $manifest -split '\r?\n') {
                if ($line -match '^([a-fA-F0-9]{64})\s+\*?(.+)$') { $hashes[$matches[2].Trim()] = $matches[1].ToLowerInvariant() }
            }
            $tagDirectory = Join-Path $sampleRoot $tag
            New-Item -ItemType Directory -Path $tagDirectory -Force | Out-Null
            foreach ($assetName in @('Pages.zip','_worker.js','_worker.obfuscated.js')) {
                $label = $tag + '-' + $assetName.Replace('.','-')
                $samplePath = Join-Path $tagDirectory $assetName
                $watermark = Get-EventWatermark
                $startedUtc = [DateTime]::UtcNow
                $result = [ordered]@{ Tag = $tag; Asset = $assetName; Path = $samplePath; StartedUtc = $startedUtc.ToString('o');
                    ExpectedSHA256 = $hashes[$assetName]; HashVerifiedBeforeWrite = $false; Scan = $null; Outcome = 'inconclusive' }
                try {
                    $asset = @($release.assets | Where-Object { $_.name -eq $assetName })[0]
                    if (-not $asset -or -not $hashes.ContainsKey($assetName)) { throw 'Release asset or its SHA256 manifest entry is missing' }
                    $result.DownloadUrl = $asset.browser_download_url
                    $bytes = Get-PublicBytes $asset.browser_download_url
                    $result.DownloadedBytes = $bytes.Length
                    $result.ActualSHA256 = Get-ByteHash $bytes
                    if ($result.ActualSHA256 -ne $result.ExpectedSHA256) { throw 'SHA256 mismatch: sample will not be written or scanned' }
                    $result.HashVerifiedBeforeWrite = $true
                    [IO.File]::WriteAllBytes($samplePath, $bytes)
                    $bytes = $null
                    $result.FilePresentAfterWrite = Test-Path -LiteralPath $samplePath
                    try { Set-Content -LiteralPath $samplePath -Stream Zone.Identifier -Value ("[ZoneTransfer]`r`nZoneId=3`r`nHostUrl=" + $asset.browser_download_url) -Encoding ASCII; $result.MarkOfTheWebSet = $true }
                    catch { $result.MarkOfTheWebError = $_.Exception.Message }
                    if (Test-Path -LiteralPath $samplePath) {
                        $exclusion = Invoke-MpDiagnostic ($label + '-exclusion') @('-CheckExclusion','-Path',$samplePath)
                        $result.Exclusion = $exclusion
                        $result.Scan = Invoke-MpDiagnostic ($label + '-scan') @('-Scan','-ScanType','3','-File',$samplePath,'-DisableRemediation')
                    } else { $result.FileMissingBeforeManualScan = $true }
                } catch { $result.Error = $_.Exception.Message }
                finally {
                    # Allow asynchronous realtime remediation events to be recorded.
                    Start-Sleep -Seconds 3
                    $events = @(Get-DefenderEvents $watermark)
                    $threats = Get-ThreatSnapshot
                    $matching = @($events | Where-Object { ($_.EventId -in @(1116,1117,1118,1119)) -and ($_.Xml -match [regex]::Escape($samplePath)) })
                    $result.Events = $events
                    $result.MatchingDetectionEvents = $matching
                    $result.ThreatSnapshot = $threats
                    $result.FilePresentAfterScan = Test-Path -LiteralPath $samplePath
                    $result.DefenderStatusAfter = (Get-DefenderSnapshot).Status
                    $scanText = [string]$result.Scan.Stdout + ' ' + [string]$result.Scan.Stderr
                    $names = @([regex]::Matches($scanText, '(?i)\b(?:Trojan(?:Downloader|Proxy|Spy|Clicker|Dropper|Notifier)?|Virus|Worm|Backdoor|Ransom|HackTool|PUA|PWS|Exploit|Behavior|VirTool|Spyware|Adware|BrowserModifier|SoftwareBundler):[A-Za-z0-9_/.!@+\-]+') | ForEach-Object { $_.Value } | Select-Object -Unique)
                    $result.ConsoleThreatNames = $names
                    if ($names.Count -gt 0 -or @($matching | Where-Object { $_.EventId -eq 1116 }).Count -gt 0) { $result.Outcome = 'detection_observed' }
                    elseif ($result.HashVerifiedBeforeWrite -and -not $result.Error -and $result.Scan -and $result.Scan.ExitCode -eq 0 -and $scanText -match '(?i)Scan\s+finished' -and $result.FilePresentAfterScan) {
                        $result.Outcome = 'completed_no_detection_in_this_environment'
                    }
                    $script:Results += [pscustomobject]$result
                    Write-JsonReport ($label + '-result.json') $result
                    Write-Host ($tag + ' ' + $assetName + ': ' + $result.Outcome)
                }
            }
        } catch {
            $script:Results += [pscustomobject]@{ Tag = $tag; Outcome = 'inconclusive'; ReleaseError = $_.Exception.Message }
        }
    }
} catch { $script:FatalError = $_.Exception.Message; Write-Warning $script:FatalError }
finally {
    if ($script:AssetClient) { $script:AssetClient.Dispose() }
    Write-JsonReport 'defender-final.json' (Get-DefenderSnapshot)
    Write-JsonReport 'threats-final.json' (Get-ThreatSnapshot)
    if ($null -ne $script:InitialWatermark) { Write-JsonReport 'defender-events-all.json' @(Get-DefenderEvents $script:InitialWatermark) }
    $outcomes = @($script:Results | ForEach-Object { $_.Outcome })
    $overall = 'inconclusive'
    if ($outcomes -contains 'detection_observed') { $overall = 'detection_observed'; $exitCode = 2 }
    elseif ($script:Ready -and -not $script:FatalError -and $script:Results.Count -eq 6 -and @($outcomes | Where-Object { $_ -ne 'completed_no_detection_in_this_environment' }).Count -eq 0) {
        $overall = 'completed_no_detection_in_this_environment'; $exitCode = 0
    }
    $summary = [ordered]@{ Overall = $overall; Ready = $script:Ready; FatalError = $script:FatalError;
        PreparationErrors = $script:PreparationErrors; Results = $script:Results; EndedUtc = [DateTime]::UtcNow.ToString('o');
        Interpretation = 'No-detection is limited to this engine/definitions/cloud policy and does not prove the user detection was false. -DisableRemediation custom scans report detections in raw console output, not event/UI logs; nonzero exit alone can also be a scanning error. No sample has been executed, manually submitted, or included in the report directory.' }
    Write-JsonReport 'summary.json' $summary
    Write-Host ('Overall: ' + $overall + '; reports: ' + $ReportDirectory)
}
exit $exitCode
