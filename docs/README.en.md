# dsh-purge-零甲 · DeepSeek Harness jailbreak, integrated edition

**Current version 1.8.0** · Targets **DSH Desktop 0.2.2-rc.5** (also 0.2.2-rc.1/rc.2/rc.3 and 0.2.1-rc.5).

dsh-purge-零甲 (technical id `dsh-purge-lingjia`) is a fork and consolidation of [dsh-purge Community 1.7.20](https://github.com/kingcharleslzy-ai/dsh-purge)
(MIT, attribution kept). It adds a **zero-armor** layer on top of the classic "patch the host source" approach:

| Sink (last point before the request leaves the process) | Patch | What happens |
|---|---|---|
| system prompt / runtime context | #97 | armor sentences deleted (not rewritten) |
| message list (`deriveMessages`) | #98 | developer messages and non-user-source user messages dropped |
| assistant history | #100 | refusal sentences stripped, roles kept alternating |
| tool schemas | #99 | tool + parameter descriptions scrubbed (`scrub`) or reduced to the first line (`void`) |

Highlights of 1.8.0:

- **92 host patches** (69 evaluated / 64 applied / 0 drifted on DSH 0.2.2-rc.5, iOS web profile).
- **`obsoleteWhenAbsent`** — a patch whose feature symbols are gone reports `na` instead of drifting forever.
- **Selftests** — `npm run selftest` runs 18 engine assertions and 19 zero-armor assertions.
- Single package: patch table, zero-armor, red-team console, three-tier prompt slots, refusal retry, snapshots.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/axisovo/dsh-purge-lingjia/main/scripts/install.sh -o /tmp/dsh-purge-install.sh
sh /tmp/dsh-purge-install.sh --dry && sh /tmp/dsh-purge-install.sh
```

Fixed release tarball (with `SHA256SUMS.txt`):

```
https://github.com/axisovo/dsh-purge-lingjia/releases/download/v1.8.0/dsh-purge-lingjia-1.8.0.tgz
```

Or add `https://github.com/axisovo/dsh-purge-lingjia` in DSH → Plugins → Add plugin.
The installer never applies host patches, never restarts DSH, and never changes your global npm registry.

## Design

- Full design, rule table, per-sink behaviour and rollback: [zero-armor.md](zero-armor.md)
- Chinese README (primary): [../README.md](../README.md)
- Install/maintenance: [INSTALLATION.md](INSTALLATION.md) · [MAINTENANCE.md](MAINTENANCE.md)

## License

MIT, inherited from upstream dsh-purge / dsh-purge Community. `LICENSE`, `NOTICE.md` and
`CONTRIBUTORS.md` are kept verbatim. The `obsoleteWhenAbsent` mechanism is ported (reimplemented)
from ZiDuNet/dsh-purge 1.1.97 (Apache-2.0).

## Limits

It rewrites the host source on **your own machine and your own installation**. Back up before you start;
every edit leaves a `.dshpurge.bak` and can be reverted in one command, but compatibility with arbitrary
host versions is not guaranteed. The alignment prior inside the model weights cannot be deleted by code —
the zero-armor layer only removes the narrative, it cannot remove the prior.
