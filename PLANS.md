# LearnLoop Plans

## Current Harness baseline

Runtime maintenance is pinned by `scripts/dsh-baseline.json` to the newest complete published
npm family. This upgrade does not add content models, repositories, site generation, or new
export capabilities.

Version 0.2.0 completes the persistence epoch reset: schema 6 and storage unit 2 use Workspace-owned Project aggregates exclusively. Current work preserves onboarding, profile confirmation, draft approval, task controls, Verified Answer Loop, mastery, adjustments, export, and DSH rc.8 public contracts. Historical-state migration and backup import are non-goals.

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent interviews, commits and obtains explicit Profile confirmation, creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.

## Canonical learning content

Version 0.6.0 implements Plan → private Lesson Source Snapshot → canonical Lesson Document. Static publication is the next independent project. Main state contains content references and generation jobs rather than article bodies.

## 0.7.0 host-authoritative onboarding

Runtime V4 resolves `AssembleContext.agent.id`, persists a one-topic-at-a-time evidence-backed interview, and moves Profile/Plan approval to explicit LearnLoop UI HTTP actions. Schema 10, Storage Domain 7, and backup 5 are a clean epoch; clear only LearnLoop data. Static HTML publication remains out of scope.

## 0.8.0 runtime boundary

Adaptive onboarding uses required Probes, deterministic Host Profile compilation, direct Plan View approval, and recovery directives. State schema 11 / Storage Domain 8 / backup 6 is a clean epoch. HTML, Static Publisher, Directory Picker, ZIP, and VitePress remain separate future work.

## 0.9.0 interview boundary

The learner's language precedes internal planning structure. A Probe describes an information need, not a fixed questionnaire field. Native custom answers are supported; uncertainty requests a Host scaffold. Tokenized native questions prevent identical stateful Tool calls, and only an explicit Host chat fallback may consume a direct message. Content generation and publication remain separate work.
