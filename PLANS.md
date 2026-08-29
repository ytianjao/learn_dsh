# LearnLoop Plans

## Current Harness baseline

Runtime maintenance is pinned by `scripts/dsh-baseline.json` to the newest complete published
npm family. This upgrade does not add content models, repositories, site generation, or new
export capabilities.

Version 0.2.0 completes the persistence epoch reset: schema 6 and storage unit 2 use Workspace-owned Project aggregates exclusively. Current work preserves onboarding, profile confirmation, draft approval, task controls, Verified Answer Loop, mastery, adjustments, export, and DSH rc.8 public contracts. Historical-state migration and backup import are non-goals.

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent interviews, commits and obtains explicit Profile confirmation, creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.
