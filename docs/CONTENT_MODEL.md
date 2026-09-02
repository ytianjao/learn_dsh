# Canonical content model

LearnLoop fixes the boundary **Plan → LessonSourceSnapshot → LessonDocument → Publication**. The Plan is a course skeleton. A private snapshot is the generation fact input. A lesson document is the canonical, reviewable content source. Publication (Markdown, static HTML, PDF, EPUB, ZIP) consumes only lesson documents and never the private snapshot.

Snapshots retain only explicitly bounded assistant text and accepted assessment/evidence facts—not transcripts, learner answers, system prompts, tool payloads, credentials, or local paths. Main state stores only `ProjectContentIndex` references, capture requests, generation jobs, and export records; full snapshots and documents remain immutable files in the content repository.
