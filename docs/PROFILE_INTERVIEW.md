# Progressive Profile Interview

LearnLoop persists ordered learner-first Probes from `goal.subject` through `success-criteria`. The Host exposes one tokenized pending question, stores canonical selected/custom answers and option snapshots, and uses Probe-specific uncertainty policy. Ordinary Chat is consumed only after an explicit persisted fallback. Profile drafting remains unavailable until all required Probes are answered, and critical fields bind to learner evidence or an explicitly labelled Host recommendation.


---

# Profile Interview V6

1. The Host asks `goal.subject` as free text: the learner needs no taxonomy or professional terminology.
2. Every later Probe is option-based. For scaffolded Probes the model first reasons over the subject and prior answers (exposed as `interviewAnswers` in the session prompt data), then proposes 3–6 beginner-friendly, jargon-free options covering distinct situations; the Host validates them, assigns opaque values, stores the actual snapshot, and falls back to a per-Probe generic Host scaffold when suggestions are absent or invalid. Only `goal.outcome` keeps ordered goal-depth levels and the appended “还不确定，请根据入门目标推荐” option; a selected scaffolded option stores its label as the normalized value.
3. Native `custom` overrides `selected` and is learner evidence. A selected option is learner choice; selecting uncertainty produces a separately labelled Host recommendation (`overview`).
4. “不知道” is Probe-specific: subject needs help, outcome/success criteria need scaffolding, gaps are valid evidence, and deadline becomes no deadline.
5. A durable opaque `questionToken` binds the current Session, Project, Probe revision, and native question. Replay retains it; progression/release invalidates it; stale calls never open UI.
6. Ordinary Chat is forbidden for Profile answers unless persisted `awaitingChatProbeId` proves an explicit `fallback-to-chat` result. Profile View confirmation is the authorization boundary.
