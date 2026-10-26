// Windows ships npm, dart and flutter as .cmd/.bat wrappers, which Node starts only through a shell.
const WRAPPER = /(^|[\/])(npm|npx|dart|flutter)$|\.(cmd|bat)$/i;

const quote = (s: string) => (/[\s"&|<>^()%]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Spawn arguments for `cmd`; a Windows wrapper becomes one quoted command line for the shell. */
export function launch(cmd: string, args: string[]): { cmd: string; args: string[]; shell: boolean } {
  if (process.platform !== "win32" || !WRAPPER.test(cmd)) return { cmd, args, shell: false };
  return { cmd: [cmd, ...args].map(quote).join(" "), args: [], shell: true };
}
