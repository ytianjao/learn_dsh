# Delivery Report — Canonical Workspace Model

LearnLoop 0.2.0 removes the runtime compatibility architecture. Commands mutate one active Project aggregate directly under its Workspace. Successful commands increment root and Workspace revisions once; replay changes neither; validation failure returns no state. Sessions attach execution context only. HTTP API v2 and backup format 3 expose canonical data. Pre-canonical state is rejected and never silently reset.
