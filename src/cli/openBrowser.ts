import { spawn } from 'child_process';

/**
 * Open a URL in the user's default browser. Cross-platform: uses the OS
 * command (`start`, `open`, `xdg-open`) so we don't need an extra runtime
 * dependency. Detached + ignored stdio so we don't tie the CLI's lifecycle
 * to the browser process.
 */
export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    let args: string[];
    if (process.platform === 'win32') {
      // The empty string is the title for `cmd /c start`. Without it, an
      // unquoted URL is parsed as the window title instead of the target.
      cmd = 'cmd.exe';
      args = ['/c', 'start', '', url];
    } else if (process.platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}
