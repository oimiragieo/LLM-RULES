# PowerShell Performance Patterns

## Measuring Performance

```powershell
# Time a block of code
$elapsed = Measure-Command {
    Get-ChildItem -Recurse C:\Windows\System32
}
Write-Host "Elapsed: $($elapsed.TotalSeconds)s"

# Compare two approaches
$approach1 = Measure-Command {
    $result = @()
    1..10000 | ForEach-Object { $result += $_ }
}

$approach2 = Measure-Command {
    $result = [System.Collections.Generic.List[int]]::new()
    1..10000 | ForEach-Object { $result.Add($_) }
}

"Array +=: $($approach1.TotalMilliseconds)ms"
"List.Add: $($approach2.TotalMilliseconds)ms"
```

## Array Building (Critical)

```powershell
# BAD: O(n²) — creates new array on each iteration
$array = @()
foreach ($item in $source) { $array += $item }

# GOOD: O(n) — amortized constant append
$list = [System.Collections.Generic.List[object]]::new()
foreach ($item in $source) { $list.Add($item) }

# Convert back to array if needed
$array = $list.ToArray()

# Also good: ArrayList (non-generic)
$list = [System.Collections.ArrayList]::new()
$list.Add($item) | Out-Null  # Suppress return value

# Best for known size: pre-allocated array
$array = [object[]]::new(10000)
for ($i = 0; $i -lt 10000; $i++) { $array[$i] = $i }
```

## Pipeline vs Loop Performance

```powershell
# ForEach-Object pipeline — functional but slower (overhead per object)
1..10000 | ForEach-Object { $_ * 2 }

# foreach statement — fastest for simple loops
$results = [System.Collections.Generic.List[int]]::new()
foreach ($n in 1..10000) { $results.Add($n * 2) }

# .NET LINQ (fastest for filtering/projecting)
$data = 1..10000
$results = [System.Linq.Enumerable]::Where($data, [Func[int,bool]]{ param($x) $x % 2 -eq 0 })
```

## Parallel Processing (PS7+)

```powershell
# ForEach-Object -Parallel for CPU-bound work
$servers = 'server1', 'server2', 'server3', 'server4', 'server5'
$results = $servers | ForEach-Object -Parallel {
    $pingResult = Test-Connection $_ -Count 1 -Quiet
    [PSCustomObject]@{
        Server = $_
        Online = $pingResult
    }
} -ThrottleLimit 10

# Pass variables into parallel scope with $using:
$threshold = 80
Get-Process | ForEach-Object -Parallel {
    if ($_.CPU -gt $using:threshold) {
        [PSCustomObject]@{ Name = $_.Name; CPU = $_.CPU }
    }
} -ThrottleLimit 4
```

## ThreadJob for Background I/O

```powershell
# Start-ThreadJob (lightweight, lower overhead than Start-Job)
$jobs = 'server1', 'server2', 'server3' | ForEach-Object {
    $server = $_
    Start-ThreadJob -ScriptBlock {
        param($s)
        Invoke-RestMethod "https://$s/api/health" -TimeoutSec 5
    } -ArgumentList $server -ThrottleLimit 5
}

# Wait and collect results
$results = $jobs | Receive-Job -Wait -AutoRemoveJob
```

## .NET Methods for Hot Paths

```powershell
# File I/O — .NET is faster than cmdlets for large files
# BAD (Get-Content loads entire file into PS objects)
$lines = Get-Content -Path .\large.log

# GOOD (.NET ReadAllLines is faster for one-shot reads)
$lines = [System.IO.File]::ReadAllLines('C:\large.log')

# BEST (streaming for large files)
$reader = [System.IO.StreamReader]::new('C:\large.log')
while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    if ($line -match 'ERROR') { $line }
}
$reader.Dispose()

# String operations — .NET StringBuilder for concatenation
$sb = [System.Text.StringBuilder]::new()
foreach ($line in $lines) { [void]$sb.AppendLine($line) }
$result = $sb.ToString()
```

## Hashtable for O(1) Lookups

```powershell
# BAD: O(n) search — array contains check
$validValues = @('red', 'green', 'blue')
if ($color -in $validValues) { ... }  # Scans entire array

# GOOD: O(1) lookup — hashtable/hashset
$validValues = @{ red = $true; green = $true; blue = $true }
if ($validValues.ContainsKey($color)) { ... }

# Or HashSet
$validSet = [System.Collections.Generic.HashSet[string]]::new([string[]]@('red', 'green', 'blue'))
if ($validSet.Contains($color)) { ... }
```

## Provider Filtering vs Client Filtering

```powershell
# BAD: Client-side filtering (downloads all, filters locally)
Get-ChildItem C:\Windows -Recurse | Where-Object { $_.Name -like '*.dll' }

# GOOD: Provider-side filtering (server/filesystem filters before returning)
Get-ChildItem C:\Windows -Recurse -Filter '*.dll'

# BAD: Download all log entries then filter
Get-WinEvent -LogName System | Where-Object { $_.Level -eq 2 }

# GOOD: Filter at source
Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 2 }
```

## WMI/CIM Performance

```powershell
# BAD: Get-WmiObject (deprecated, slower, DCOM)
Get-WmiObject -Class Win32_Process

# GOOD: Get-CimInstance (faster, uses WS-Man/DCOM fallback)
Get-CimInstance -ClassName Win32_Process

# GOOD: CimSession for multiple queries to same server
$session = New-CimSession -ComputerName 'server1'
$procs = Get-CimInstance -CimSession $session -ClassName Win32_Process
$disks = Get-CimInstance -CimSession $session -ClassName Win32_LogicalDisk
$session | Remove-CimSession
```

## Runspaces for Advanced Parallelism

```powershell
# For high-volume I/O-bound parallelism (hundreds of targets)
$runspacePool = [System.Management.Automation.Runspaces.RunspacePool]::CreateRunspacePool(1, 50)
$runspacePool.Open()

$jobs = foreach ($server in $servers) {
    $ps = [powershell]::Create()
    $ps.RunspacePool = $runspacePool
    [void]$ps.AddScript({
        param($srv)
        Test-Connection $srv -Count 1 -Quiet
    }).AddArgument($server)

    @{
        PowerShell = $ps
        Handle     = $ps.BeginInvoke()
        Server     = $server
    }
}

# Collect results
foreach ($job in $jobs) {
    $result = $job.PowerShell.EndInvoke($job.Handle)
    [PSCustomObject]@{ Server = $job.Server; Online = $result }
    $job.PowerShell.Dispose()
}

$runspacePool.Close()
$runspacePool.Dispose()
```

## Performance Tips Summary

| Scenario                            | Recommendation                                     |
| ----------------------------------- | -------------------------------------------------- |
| Building large arrays               | `List[T]`, not `@() +=`                            |
| Tight loops                         | `foreach` statement, not `ForEach-Object`          |
| Large file reads                    | `[System.IO.File]::ReadAllLines()` or StreamReader |
| Filtering collections               | Hashtable/HashSet for O(1) lookups                 |
| CIM/WMI queries                     | `Get-CimInstance`, not `Get-WmiObject`             |
| Multiple CIM queries to same server | `CimSession`                                       |
| Provider-level filtering            | Use `-Filter` parameter, not `Where-Object`        |
| I/O-bound parallel work             | `Start-ThreadJob` or runspaces                     |
| CPU-bound parallel work             | `ForEach-Object -Parallel`                         |
| Profiling                           | `Measure-Command`                                  |
