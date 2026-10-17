// Windows-only diagnostic for Attachment Execution Services. Does not launch
// or interpret the supplied file. Uses only SetLocalPath, SetSource and Save.
// Official ABI: microsoft/win32metadata ShObjIdl_core.h (IAttachmentExecute),
// ShObjIdl.h (CLSID_AttachmentServices). PreserveSig retains the exact HRESULT.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class CfnewAttachmentSaveResult
{
    public string Stage { get; set; }
    public int HResult { get; set; }
    public string HResultHex { get { return "0x" + unchecked((uint)HResult).ToString("X8"); } }
    public bool SaveCalled { get; set; }
    public bool ExistsAfter { get; set; }
}

public static class CfnewAttachmentDiagnostic
{
    // Keep every method in native vtable order, including methods never called.
    // IUnknown's QueryInterface/AddRef/Release are supplied by COM interop.
    [ComImport]
    [Guid("73DB1241-1E85-4581-8E4F-A81E1D0F8C57")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAttachmentExecute
    {
        [PreserveSig] int SetClientTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        [PreserveSig] int SetClientGuid([In] ref Guid clientGuid);
        [PreserveSig] int SetLocalPath([MarshalAs(UnmanagedType.LPWStr)] string localPath);
        [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string fileName);
        [PreserveSig] int SetSource([MarshalAs(UnmanagedType.LPWStr)] string source);
        [PreserveSig] int SetReferrer([MarshalAs(UnmanagedType.LPWStr)] string referrer);
        [PreserveSig] int CheckPolicy();
        // Native ATTACHMENT_PROMPT and ATTACHMENT_ACTION are 32-bit enums.
        [PreserveSig] int Prompt(IntPtr hwnd, int prompt, out int action);
        [PreserveSig] int Save();
        // Declared for ABI completeness only; never called by this diagnostic.
        [PreserveSig] int Execute(IntPtr hwnd,
            [MarshalAs(UnmanagedType.LPWStr)] string verb, out IntPtr process);
        [PreserveSig] int SaveWithUI(IntPtr hwnd);
        [PreserveSig] int ClearClientState();
    }

    [DllImport("ole32.dll", ExactSpelling = true, PreserveSig = true)]
    private static extern int CoInitializeEx(IntPtr reserved, uint apartmentType);

    [DllImport("ole32.dll", ExactSpelling = true)]
    private static extern void CoUninitialize();

    [DllImport("ole32.dll", ExactSpelling = true, PreserveSig = true)]
    private static extern int CoCreateInstance(
        [In] ref Guid classId, IntPtr outer, uint context, [In] ref Guid interfaceId,
        [MarshalAs(UnmanagedType.Interface)] out IAttachmentExecute instance);

    public static CfnewAttachmentSaveResult Save(string localPath, string sourceUrl)
    {
        if (Environment.OSVersion.Platform != PlatformID.Win32NT)
            throw new PlatformNotSupportedException("Windows Attachment Execution Services are required.");
        if (String.IsNullOrWhiteSpace(localPath))
            throw new ArgumentException("An existing local attachment path is required.", "localPath");
        string fullPath = Path.GetFullPath(localPath);
        if (!File.Exists(fullPath)) throw new FileNotFoundException("Attachment was not found.", fullPath);
        Uri source;
        if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out source) ||
            (source.Scheme != Uri.UriSchemeHttp && source.Scheme != Uri.UriSchemeHttps))
            throw new ArgumentException("An absolute original HTTP(S) download URL is required.", "sourceUrl");

        CfnewAttachmentSaveResult result = new CfnewAttachmentSaveResult();
        Exception failure = null;
        // A dedicated STA thread avoids RPC_E_CHANGED_MODE on PowerShell 7's
        // default MTA thread. COM creation, use and release stay on this thread.
        Thread thread = new Thread(delegate()
        {
            IAttachmentExecute attachment = null;
            bool initialized = false;
            try
            {
                result.Stage = "CoInitializeEx";
                result.HResult = CoInitializeEx(IntPtr.Zero, 2); // COINIT_APARTMENTTHREADED
                if (result.HResult < 0) return;
                initialized = true; // S_OK and S_FALSE both require CoUninitialize.
                Guid classId = new Guid("4125DD96-E03A-4103-8F70-E0597D803B9C");
                Guid interfaceId = new Guid("73DB1241-1E85-4581-8E4F-A81E1D0F8C57");
                result.Stage = "CoCreateInstance";
                result.HResult = CoCreateInstance(ref classId, IntPtr.Zero, 1, ref interfaceId, out attachment); // CLSCTX_INPROC_SERVER
                if (result.HResult < 0) return;
                result.Stage = "SetLocalPath";
                result.HResult = attachment.SetLocalPath(fullPath);
                if (result.HResult < 0) return;
                result.Stage = "SetSource";
                result.HResult = attachment.SetSource(sourceUrl);
                if (result.HResult < 0) return;
                result.Stage = "Save";
                result.SaveCalled = true;
                result.HResult = attachment.Save();
            }
            catch (Exception error) { failure = error; }
            finally
            {
                try
                {
                    if (attachment != null) Marshal.FinalReleaseComObject(attachment);
                }
                finally
                {
                    if (initialized) CoUninitialize();
                    result.ExistsAfter = File.Exists(fullPath);
                }
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (failure != null)
            throw new InvalidOperationException("Attachment diagnostic failed at " + result.Stage + ".", failure);
        return result;
    }
}
