# Content generation

A project may have one active generation job. Eligible completed tasks must have an accepted Assessment and ready source snapshot. Jobs follow Plan order and expose one current lesson at a time. The model submits only `LessonDocumentIntent`; the Host derives identity, sequence, slug, revision, provenance, audience, hashes and path.

Unknown tool outcomes are not retried. Invalid arguments may receive one repair attempt. Cancellation preserves completed immutable lessons. Agent execution must use DSH's public Agent Loop and never call a provider or read credentials directly.
