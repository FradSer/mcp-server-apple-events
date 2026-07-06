/*
 * disclaim.c — TCC responsibility disclaim shim (issue #93).
 *
 * Usage: event-disclaim <binary> [args...]
 *
 * Re-execs <binary> via posix_spawn with POSIX_SPAWN_SETEXEC and TCC
 * responsibility disclaimed, making <binary> its own TCC-responsible
 * process. macOS then reads the EventKit usage strings from <binary>'s
 * embedded Info.plist and can show the Reminders/Calendar permission
 * prompt even when the process tree was started by a GUI MCP client
 * (Codex Desktop, Claude Desktop, ...) that declares no such strings —
 * without the disclaim, TCC attributes the request to that client and
 * refuses it before EventKit is reached.
 *
 * POSIX_SPAWN_SETEXEC replaces this process image in place (exec
 * semantics), so stdio, exit codes, and signals need no proxying.
 */
#include <spawn.h>
#include <stdio.h>
#include <string.h>

extern char **environ;

/*
 * Private libSystem API (macOS 10.14+), the same call Chromium uses to make
 * helper processes self-responsible for TCC. Declared weakly so the shim
 * degrades to a plain exec — the pre-shim, host-attributed behavior — if a
 * future macOS removes the symbol.
 */
extern int responsibility_spawnattrs_setdisclaim(posix_spawnattr_t *attrs,
                                                 int disclaim)
    __attribute__((weak_import));

int main(int argc, char *argv[]) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <binary> [args...]\n",
            argc > 0 ? argv[0] : "event-disclaim");
    return 64;
  }

  posix_spawnattr_t attr;
  int rc = posix_spawnattr_init(&attr);
  if (rc != 0) {
    fprintf(stderr, "event-disclaim: posix_spawnattr_init: %s\n",
            strerror(rc));
    return 127;
  }
  posix_spawnattr_setflags(&attr, POSIX_SPAWN_SETEXEC);
  if (responsibility_spawnattrs_setdisclaim) {
    responsibility_spawnattrs_setdisclaim(&attr, 1);
  }

  pid_t pid;
  rc = posix_spawn(&pid, argv[1], NULL, &attr, &argv[1], environ);
  /* Reached only when the spawn itself failed — with SETEXEC a successful
     spawn never returns. */
  posix_spawnattr_destroy(&attr);
  fprintf(stderr, "event-disclaim: failed to exec %s: %s\n", argv[1],
          strerror(rc));
  return 127;
}
