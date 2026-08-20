# Web acceptance

All keyless scenarios run against a real DSH Web profile with deterministic Host state. They never call DeepSeek.

1. **Welcome:** open a fresh profile; Chat is selected; the dock shows “你现在想学会什么？” and the goal text box is keyboard reachable. Save a natural-language goal and observe a current task.
2. **Plan:** open 学习计划; verify active plan version, stages, dependencies, statuses, acceptance criteria, estimate, next action and history come from the state endpoint.
3. **Refresh:** reload; the project, plan and task remain and no second plan/event appears.
4. **Evidence:** complete the task, submit the user's explanation, and verify a progress event and “练习中” rationale. Re-submit the same idempotency key through replay and verify one evidence row.
5. **Insufficient evidence:** submit only completion intent; verify task state may change but mastery does not become mastered and the UI asks for a minimum explanation.
6. **Progress query:** compare the current stage/next task shown by Progress with the same Host projection consumed by Chat context; they must match without a model call.
7. **Minor adjustment:** post a deterministic repeated-misconception fixture; verify a new plan version, diff, inline reason and Revert action.
8. **Major adjustment:** propose weekly hours 10 → 5; verify the active plan is unchanged until Apply. Reject preserves v1; Apply creates v2.
9. **Review:** verify recent evidence, events, misconceptions and next start survive refresh and are not regenerated prose.
10. **Conflict and outage:** submit a stale revision and receive an actionable 409; disconnect the Host and see a retry message without losing durable state.
11. **Settings and data:** edit preferences, export JSON, restart and verify values. Reset requires confirmation and does not touch DSH model credentials.
12. **Security:** scan client bundle, state export, logs and screenshots for credential fields or key-like fixtures; none may exist.

Screenshots are generated under ignored `test-results/` and are not committed. They are captured from these running routes: welcome, Plan, Progress/current task, adjustment proposal/diff, assessment/evidence node and connection error. The live-provider smoke is separate: after the user selects a DeepSeek model in DSH Settings, send one teaching message in ordinary Chat and confirm streaming. The test must not read the stored key.
