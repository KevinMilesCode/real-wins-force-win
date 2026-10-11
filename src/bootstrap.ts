// Bulletproof entry point for the pkg bundle.
//
// Static-import failures (a module that throws while loading) never reach
// cli.ts's try/catch, so without this the window would vanish with no
// message. This wrapper catches everything — import errors, uncaught
// exceptions, unhandled rejections — prints the error, and waits for Enter.

function waitForEnter(): Promise<void> {
  // Only wait on a real console; never hang a piped/redirected run.
  if (!process.stdin.isTTY) return Promise.resolve();
  return new Promise((resolve) => {
    process.stdout.write('\nPress Enter to exit...');
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
    // Safety: never trap the user forever if stdin dies.
    process.stdin.once('end', () => resolve());
    process.stdin.once('error', () => resolve());
  });
}

async function fatal(where: string, e: unknown): Promise<never> {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(`\nFATAL (${where}):\n${msg}`);
  await waitForEnter();
  process.exit(1);
}

process.on('uncaughtException', (e) => {
  void fatal('uncaught', e);
});

process.on('unhandledRejection', (e) => {
  void fatal('unhandled', e);
});

console.log('CFB27 Force Win — starting…');
try {
  await import('./cli.js');
} catch (e) {
  await fatal('startup', e);
}
