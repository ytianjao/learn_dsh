# Content repository

Host-owned content lives below `$DSH_HOME/learnloop/content/ws-<hash>/project-<hash>`. Visible directory names are stable truncated SHA-256 values, never raw Workspace or Project identifiers. Sources and lessons use immutable names; only `course.manifest.json` is replaceable.

`ContentRepository` uses `node:fs/promises` because DSH's public filesystem surface does not provide the required mkdir, exclusive temporary creation, fsync, validation, rename, and directory sync transaction. It confines relative paths, resolves the real parent to reject symlink escape, writes mode `0600`, rereads and schema-validates temporary JSON, then renames. A later coordinator reconciles a valid immutable file with its state reference; invalid files are retained for diagnosis and never supplied to a model.
