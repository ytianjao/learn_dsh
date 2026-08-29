# Canonical content model

LearnLoop fixes the boundary **Plan → LessonSourceSnapshot → LessonDocument → Static Publication**. The Plan is a course skeleton. A private snapshot is the generation fact input. A lesson document is the canonical, reviewable content source. Static publication is deliberately outside this release and must later consume only manifests and lesson documents.

Snapshots retain only explicitly bounded assistant text and accepted assessment/evidence facts—not transcripts, learner answers, system prompts, tool payloads, credentials, or local paths. Main state stores only `ProjectContentIndex` references and jobs; full snapshots and documents remain files.
