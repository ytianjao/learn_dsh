# Delivery Report — Canonical Workspace Model

## DSH 0.1.1-rc.2 compatibility delivery

LearnLoop now consumes one exact Harness release family and the public typed Session event
contract. Product state schema, Storage Domain epoch, backup format, and HTTP API v3 remain
unchanged. The baseline manifest drives dependency, CI, and Acceptance verification.

LearnLoop 0.2.0 removes the runtime compatibility architecture. Commands mutate one active Project aggregate directly under its Workspace. Successful commands increment root and Workspace revisions once; replay changes neither; validation failure returns no state. Sessions attach execution context only. HTTP API v2 and backup format 3 expose canonical data. Pre-canonical state is rejected and never silently reset.

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent interviews, commits and obtains explicit Profile confirmation, creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.
