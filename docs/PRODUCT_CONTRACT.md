# Product contract

LearnLoop is a local-first, long-term learning companion inside the DSH Web profile. DSH owns sessions, streaming Chat, model routing and credentials; LearnLoop owns learning projects, plans, evidence, mastery, review and adjustment facts.

## Browser experience

The existing DSH Chat remains the default tab and primary input. Before a project exists, the dock asks “你现在想学会什么？” and accepts one natural-language description. The Host creates a versioned plan and current task. Alongside Chat, the session exposes **学习计划**, **学习进度**, and **复盘**. The input dock presents only the current task and its relevant actions. LearnLoop preferences live in DSH Settings.

The Plan view expands stages and acceptance criteria, exposes task status, pending major adjustment decisions, diffs, history and revert. The Progress view uses discrete mastery labels and expands the evidence explanation. Review is rebuilt from persisted events. Empty, loading, disconnected and mutation-conflict states provide browser-visible guidance.

## Learning rules

A user explanation, pseudocode, implementation, hypothesis, assessment or reflection may be evidence when it includes a source range and idempotency key. A model explanation, “懂了”, a completion click, time-on-page or generated code alone is not evidence. One qualifying item means practicing, two high-confidence items demonstrate a concept, and mastery additionally requires an assessment or implementation. Task completion and mastery remain independent.

Minor, reversible schedule/order changes may apply automatically and always create a plan version and adjustment record. A goal, graduation, scope or material time-budget change remains proposed until the user accepts it in the browser. Stable event and idempotency IDs prevent retries from duplicating facts.

## Security and authority

Host storage is the sole fact source. Browser state is a read cache, never localStorage. Schema validation protects durable input, revision checks protect concurrent writes, and the Web endpoint requires same origin plus an explicit mutation header. LearnLoop does not inspect DSH credentials, invoke DeepSeek directly, expose shell/network tools, or put secrets in events, exports and screenshots.
