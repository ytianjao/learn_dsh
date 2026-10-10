# 学习档案访谈 / Profile interview

## 原则 / Principles

访谈管线由 Host 定义：每道题的类型、单选或多选、选项编码、互斥项、出现条件和对应的画像字段都写在 `src/interview-probes.ts` 的声明式规范里。“空模型”（只发 `questionToken`）只会问一个很短的基线——5 道题，选择动手练习时再加 1 道——就能得到语义正确的档案。模型在这条管线上做有边界的编排和增强：当学习者的话给出理由时追加 Host 定义的可选题，改写措辞，记录带理由的推断。模型出错只会被降级为 Host 默认，不会阻塞学习者。

The interview pipeline is Host-defined: every Probe's kind, single- or multi-select cardinality, option codes, exclusive options, presence condition, and Profile mapping live in the declarative spec in `src/interview-probes.ts`. A "null model" that sends only `questionToken` asks a short baseline — five questions, six when the learner wants hands-on practice — and still produces a semantically correct Profile. A model orchestrates and enhances within bounds: it adds Host-defined optional Probes when the learner's words give a reason, rewords questions, and records reasoned assumptions. Its mistakes degrade to the Host default instead of blocking the learner.

## 基线 / Baseline

| # | Probe | 类型 / Kind | 编码 / Codes（* 互斥 / exclusive） | 画像字段 / Profile fields |
| --- | --- | --- | --- | --- |
| 1 | `goal.subject` | free text | — | goalSubject |
| 2 | `goal.outcome` | ordinal | explore, overview, interpret, guided-use, independent-use, design；不确定 → overview | goalIntent, desiredOutcome；推导 successCriteria |
| 3 | `current-foundation.relevant-experience` | multi | none*, heard-of-it, tried-learning, small-practice, adjacent-skill | priorExperience；推导 experienceLevel |
| 4 | `learning-mode.style` | single | read-only, understand-first, balanced, hands-on；不确定 → balanced | learningStyle → mode + practiceCapacity |
| 5 | `time-budget.weekly-hours` | number | 1 / 2 / 4 / 6 / 10，或自定义 1–80；不确定 → 2 | weeklyHours |
| 6 | `constraints.constraints`（仅当学习方式不是 read-only / only unless style is read-only） | multi | none*, mobile-only, no-install, free-only | constraints |

学习方式一题同时决定两项计划约束：read-only → knowledge-first + 不练习；understand-first → knowledge-first + 少量练习；balanced → balanced + 少量练习；hands-on → practice-first + 充分练习。

One learning-style answer sets both plan gates: read-only → knowledge-first, no practice; understand-first → knowledge-first, light practice; balanced → balanced, light practice; hands-on → practice-first, full practice.

## 推导与未询问 / Derived and unasked fields

- **由 Host 推导 / Derived by the Host**：成功标准按期望目标推荐；当前基础按经历推导（做过练习或小项目 → 有一定基础，否则初学者）。来源记为 `host-derived`，在审阅页可以直接修改；修改前，它们会随来源字段一起更新。/ Success criteria follow the outcome; the starting level follows experience (exercises or small projects → intermediate, otherwise beginner). Both are recorded as `host-derived`, follow their source until the learner edits them, and can be edited in review.
- **可选题 / Optional Probes**：成功标准、当前基础、已有资源、知识缺口、时间安排、期限、示例偏好。空模型不问；模型可用 `addProbes` 追加（整场最多 4 道），追加的题紧接着当前题提问。/ Success criteria, starting level, resources, knowledge gaps, time pattern, deadline, and example preference. The null model never asks them; a model may add up to four per interview with `addProbes`, asked right after the current question.
- **未询问 / Not asked**：未追加的可选题记为 `null`，来源为 `not-asked`，审阅页显示“未询问”，学习者可以在那里补充——不会用默认值冒充学习者的回答。练习限制在 read-only 时记为“不适用”。示例密度只有在学习者选择 `example-rich` 时才为 high。/ Unasked optional fields are `null` with a `not-asked` origin, shown as "Not asked" in review where the learner can fill them in — no default ever stands in for an answer. Practice constraints are "not applicable" for a read-only learner. Example density is high only when the learner picks `example-rich`.

## 读取回答 / Reading answers

1. 每个被选中的选项都会计入；多选题中实质选项压过同时勾选的互斥项。/ Every selected option counts; on multi-select Probes a substantive choice outranks an exclusive one picked alongside it.
2. 自由文本按题目策略处理：记为 `other` 加原文、解析为小时数或日期，或要求重答。/ Free text is recorded as `other` with the learner's words, parsed into hours or a date, or re-asked, per Probe policy.
3. “不知道”等不确定表达：有“不确定”选项的题记为 Host 推荐；知识缺口记为 `cannot-tell`；其余题追问一次。/ Uncertainty records a Host recommendation where the Probe offers one, `cannot-tell` on knowledge gaps, and one re-ask elsewhere.
4. 每道题最多追问一次；之后采用 Host 推荐，并把学习者原话保留为备注。/ Each Probe is re-asked at most once; after that the Host recommendation stands and the learner's words are kept as a note.
5. 连续两次空答后改为在聊天中回答；聊天回复按最近一次显示的选项文字匹配，多选可用顿号或逗号分隔。/ Two empty answers fall back to chat; the reply is matched against the labels last shown, and multi-select replies may be separated by commas.

## 模型增强 / Model enhancements

`learnloop_ask_profile_question` 只要求 `questionToken`。可选增强（附带 `probeId` 以绑定到对应题目）：

- `addProbes`：从 `currentQuestion.optionalProbes` 中追加可选题，例如学习者提到考试日期时追加期限。
- `question`：按学习者的说法改写题干。
- `options`：为既有编码改写贴合主题的文字；不能新增、删除或重排编码；多选题可为同一编码追加最多 3 个变体。
- `assume`：仅限可推断的题、首次提问、整场最多 3 次；不发提问，记为模型推断，在下一题和审阅页中提示学习者确认。目标、期望目标、相关经验、学习方式、成功标准永远不可推断。
- `followUp`：针对上一题回答的一道补充问题，每个主题最多 1 道、整场最多 3 道；结果进入补充回答，不改变规范字段。

`learnloop_ask_profile_question` requires only `questionToken`. Optional enhancements (echo `probeId` to bind them): `addProbes` adds optional Probes from `currentQuestion.optionalProbes`, e.g. the deadline when the learner mentions an exam date; `question` rewords the Probe; `options` relabels existing codes for the subject (never invent, drop, or reorder codes; multi-select Probes accept up to 3 extra labels); `assume` records an assumption instead of asking — inferable Probes only, first ask only, at most 3 per interview, shown for confirmation; the goal, outcome, experience, learning style, and success criteria are never inferable; `followUp` asks one extra question about the previous answer — at most one per topic and three per interview — stored as supplementary context.

优先级：followUp → assume → 提问；`addProbes` 在每个分支都会生效。被拒绝的增强会列在 `enhancement.rejected` 中并改用 Host 默认；结果还会返回下一题的契约（`nextQuestion`）。只有过期的 token 才会失败。

Precedence: followUp, then assume, then ask; `addProbes` applies in every branch. Rejected enhancements are listed in `enhancement.rejected` and the Host default is used; the result carries the next question's contract (`nextQuestion`). Only a stale token fails.

## 审阅 / Review

审阅页由 Host 构建每一行（`profileReview`），每行显示人类可读的值和来源，并带有该字段的编辑规格：学习者可以用 Host 的选项直接修改任一字段（`revise-profile-field`），包括补充未询问的字段。每次修改都会提升档案修订号并记为 `learner-revision`；确认档案必须针对最新修订。

The review renders Host-built rows (`profileReview`), each with a human-readable value, its origin, and an edit spec: the learner can change any field with the Host's options (`revise-profile-field`), including filling in fields that were never asked. Each edit raises the Profile revision and is recorded as a `learner-revision`; confirmation must target the latest revision.

## 令牌与恢复 / Tokens and recovery

不透明的 `questionToken` 绑定当前会话、项目、题目和提问修订号。回放保留它；作答、释放或追问都会让它失效，过期调用永远不会打开界面。普通聊天不能作答，除非 Host 已持久化 `awaitingChatProbeId`。审阅界面中的确认是授权边界。

The opaque `questionToken` binds the current Session, Project, Probe, and question revision. Replay keeps it; an answer, a release, or a follow-up rotates it, and a stale call never opens UI. Ordinary chat cannot answer a Probe unless the Host persisted `awaitingChatProbeId`. Confirmation in the review is the authorization boundary.

## 评测 / Evaluation

`tests/interview-pipeline.spec.ts` 用按编码作答的脚本学习者，在空模型、增强模型和噪声模型三种策略下驱动真实工具：空模型只问基线（5 或 6 题）；噪声模型的档案必须与空模型完全一致；增强模型只能改变措辞、它追加并标注的可选题，以及补充回答。

`tests/interview-pipeline.spec.ts` drives the real tool with scripted learners that answer by code under null, enhancing, and noisy model policies: the null model asks only the baseline (five or six questions), the noisy model must produce exactly the null-model Profile, and the enhancing model may change only wording, the optional Probes it adds (and labels), and supplementary answers.
