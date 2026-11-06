param([Parameter(Mandatory=$true)][ValidateSet('list','print','jobs','inspect','native_test')][string]$Action,[string]$RequestFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'usb.csharp') -Raw)
if($Action -eq 'list') {
  $result=@([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { $p=New-Object System.Drawing.Printing.PrinterSettings; $p.PrinterName=$_; [pscustomobject]@{name=[string]$_;isDefault=$p.IsDefaultPrinter;isValid=$p.IsValid;transport='spooler'} })
  $result+=@([ZebraUsb]::List())
  ConvertTo-Json -InputObject $result -Compress; exit
}
if($Action -eq 'jobs') { ConvertTo-Json -InputObject @(Get-PrintJob -PrinterName ((Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json).printer) | Select-Object ID,DocumentName,JobStatus,SubmittedTime) -Compress; exit }
$r=Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json
if($Action -eq 'inspect') { @{hostStatus=[ZebraUsb]::HostStatus([string]$r.printer);hostInfo=[ZebraUsb]::HostInfo([string]$r.printer);configuration=[ZebraUsb]::Configuration([string]$r.printer)} | ConvertTo-Json -Compress; exit }
if($Action -eq 'native_test') {
 $tempZpl=Join-Path ([IO.Path]::GetDirectoryName($RequestFile)) ([IO.Path]::GetFileNameWithoutExtension($RequestFile)+'.native.zpl')
 [IO.File]::WriteAllText($tempZpl,"`r`n^XA`r`n^FO40,40^A0N,50,50^FDZP505 CONNECTION TEST^FS`r`n^FO40,110^GB600,3,3^FS`r`n^FO40,150^A0N,30,30^FDNative ZPL - one label^FS`r`n^PQ1`r`n^XZ`r`n",[Text.Encoding]::ASCII)
 try { @{bytesWritten=[ZebraUsb]::Send([string]$r.printer,$tempZpl);status='sent-to-usb';test='native-zpl'} | ConvertTo-Json -Compress } finally { Remove-Item -LiteralPath $tempZpl -ErrorAction SilentlyContinue }
 exit
}
if([string]$r.printer -like 'Zebra USB direct - *') {
  $bytes=[ZebraUsb]::Send([string]$r.printer,[string]$r.file)
  @{status='sent-to-usb';printer=$r.printer;bytesWritten=$bytes} | ConvertTo-Json -Compress
  exit
}
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class ZebraRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDatatype; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h,int level,[In] DOCINFO d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool AbortPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h,IntPtr buf,int count,out int written);
  static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static int Send(string name,string file,string title) {
    IntPtr h; Check(OpenPrinter(name,out h,IntPtr.Zero)); bool active=false; IntPtr mem=IntPtr.Zero;
    try { int job=StartDocPrinter(h,1,new DOCINFO {pDocName=title,pDatatype="RAW"}); if(job==0) throw new Win32Exception(Marshal.GetLastWin32Error()); active=true;
      Check(StartPagePrinter(h)); byte[] b=File.ReadAllBytes(file); mem=Marshal.AllocHGlobal(b.Length); Marshal.Copy(b,0,mem,b.Length);
      int offset=0; while(offset<b.Length) {int sent; Check(WritePrinter(h,IntPtr.Add(mem,offset),b.Length-offset,out sent)); if(sent<=0) throw new IOException("Printer accepted no data"); offset+=sent;}
      Check(EndPagePrinter(h)); Check(EndDocPrinter(h)); active=false; return job;
    } finally {if(mem!=IntPtr.Zero) Marshal.FreeHGlobal(mem); if(active) AbortPrinter(h); ClosePrinter(h);}
  }
}
'@
$job=[ZebraRawPrint]::Send([string]$r.printer,[string]$r.file,[string]$r.title)
@{jobId=$job;status='submitted';printer=$r.printer} | ConvertTo-Json -Compress
