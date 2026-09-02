# Content generation

A project may have one active generation job. Eligible completed tasks must have an accepted Assessment; passing a task records a durable capture request with the closed teaching segments. Jobs follow Plan order and expose one current lesson at a time. The model submits only `LessonDocumentIntent`; the Host derives identity, sequence, slug, revision, provenance, audience, hashes and path.

The Host wakes the owning Agent through DSH's public Agent handle (`followup`) after the snapshot is ready; the Agent Loop assembles the bounded snapshot in the LearnLoop system section and the model calls `learnloop_write_lesson_document` exactly once per task. Agent execution uses DSH's public Agent Loop and never calls a provider or reads credentials directly.

Repeated or replayed generation requests for an already-covered task are recorded no-ops and never reach the model twice. Reference links are rejected unless they literally appear in the captured teaching content. Invalid arguments may receive one repair attempt; unknown tool outcomes are not retried. Restart reconciliation fails interrupted jobs with an explicit reason, and retry resumes a failed job while preserving completed immutable lessons.
