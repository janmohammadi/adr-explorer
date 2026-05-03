export interface CliOptions {
  withAi: boolean;
  port: number;
  bindHost: string;
  open: boolean;
  readOnly: boolean;
  rootDir: string;
  help: boolean;
  version: boolean;
}

const HELP_TEXT = `adr-explorer — browse Architecture Decision Records in your default browser.

USAGE
  adr-explorer [options]

OPTIONS
  --root <dir>     Directory to scan for ADRs (default: current working directory)
  --port <n>       Bind to a specific port (default: random free port)
  --host <addr>    Bind address (default: 127.0.0.1; never use 0.0.0.0 unless on a trusted network)
  --with-ai        Enable Distill + Insights. Requires ANTHROPIC_API_KEY in the environment.
  --read-only      Disable Apply Distill — suggestions are visible but cannot modify files.
  --no-open        Don't auto-open the browser; print the URL instead.
  --help, -h       Show this help.
  --version, -v    Print the package version.

ENVIRONMENT
  ANTHROPIC_API_KEY  Required when --with-ai is set.

EXAMPLES
  adr-explorer
  adr-explorer --root docs/adr --with-ai
  adr-explorer --port 4040 --no-open
`;

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    withAi: false,
    port: 0,
    bindHost: '127.0.0.1',
    open: true,
    readOnly: false,
    rootDir: process.cwd(),
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--with-ai': opts.withAi = true; break;
      case '--read-only': opts.readOnly = true; break;
      case '--no-open': opts.open = false; break;
      case '--help':
      case '-h': opts.help = true; break;
      case '--version':
      case '-v': opts.version = true; break;
      case '--port': {
        const next = argv[++i];
        const n = Number(next);
        if (!Number.isFinite(n) || n < 0 || n > 65535) {
          throw new Error(`Invalid --port value: ${next}`);
        }
        opts.port = n;
        break;
      }
      case '--host': {
        const next = argv[++i];
        if (!next) throw new Error('--host requires a value');
        opts.bindHost = next;
        break;
      }
      case '--root': {
        const next = argv[++i];
        if (!next) throw new Error('--root requires a value');
        opts.rootDir = next;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

export function helpText(): string {
  return HELP_TEXT;
}
