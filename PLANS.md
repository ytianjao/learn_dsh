# LearnLoop Plans

## Current Harness baseline

Runtime maintenance is pinned by `scripts/dsh-baseline.json` to the newest complete published
npm family (`0.1.1-rc.2`).

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent interviews, commits and obtains explicit Profile confirmation, creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.

## Canonical learning content (implemented)

The full boundary **Plan → LessonSourceSnapshot → LessonDocument → Publication** is implemented:

- Passing a verified task records durable teaching segments and a pending capture request.
- `generate-articles` (HTTP) creates/resumes the single project generation job, materializes the private source snapshot into the content repository, and wakes the owning Agent.
- The model submits only `LessonDocumentIntent` via `learnloop_write_lesson_document`; the Host validates, derives identity/sequence/slug/provenance, persists the immutable document, and advances the job in plan order.
- `export-articles` writes Markdown, a static HTML site, PDF (local Chromium-family browser), EPUB, and a combined ZIP into one fresh subdirectory of the chosen output directory; export records persist for open/download replay.

Restarts reconcile interrupted jobs to `failed` with a clear reason; retries are receipt-idempotent.

## 0.9.0 interview boundary

The learner's language precedes internal planning structure. A Probe describes an information need, not a fixed questionnaire field. Native custom answers are supported; uncertainty requests a Host scaffold. Tokenized native questions prevent identical stateful Tool calls, and only an explicit Host chat fallback may consume a direct message.
