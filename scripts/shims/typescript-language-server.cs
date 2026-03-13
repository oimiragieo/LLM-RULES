using System;
using System.Diagnostics;

class Program
{
    static int Main(string[] args)
    {
        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = "cmd.exe";
        
        string argumentsString = string.Join(" ", Array.ConvertAll(args, arg => arg.Contains(" ") ? "\"" + arg + "\"" : arg));
        
        startInfo.Arguments = string.Format("/c typescript-language-server.cmd {0}", argumentsString);
        startInfo.UseShellExecute = false;

        try
        {
            using (Process process = Process.Start(startInfo))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Error launching typescript-language-server.cmd: " + ex.Message);
            return 1;
        }
    }
}
