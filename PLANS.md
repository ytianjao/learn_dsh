# LearnLoop delivery plan

The plan is acceptance-driven: every completed row has a browser surface, Host behavior, durable state, automated evidence, and a screenshot target.

| Slice | Status | Browser outcome | Verification |
| --- | --- | --- | --- |
| 0. Baseline and load | Complete | LearnLoop client module loads in the DSH Web profile | compatibility test and installed-profile smoke |
| 1. Web shell | Complete | Plan, Progress, Review tabs, current-task dock, onboarding and settings | browser E2E and transient screenshots |
| 2. Project initialization | Complete | A natural-language goal creates a project, v1 plan and current task; refresh restores it | domain, HTTP and browser tests |
| 3. DSH conversation integration | Complete | Normal DSH Chat remains the primary streaming surface; LearnLoop never handles credentials or calls a provider | profile composition smoke |
| 4. Evidence and mastery | Complete | Evidence submission updates explained, discrete mastery from the Host | domain and browser tests |
| 5. Review and next action | Complete | Review uses persisted events and next action uses plan dependencies | domain and browser tests |
| 6. Adjustments | Complete | Minor changes version immediately; major changes require browser approval; applied changes can be reverted | domain tests and Plan UI |
| 7. Recovery and safety | Complete for keyless v1 | DSH storage-domain persistence, CAS writes, same-origin mutations, export/reset and actionable connection errors | HTTP and restart acceptance |
| 8. Package | Complete except user-owned live-key smoke | Installable package, profile patch, user guide and delivery report | build, package validation and keyless gates |

The sole external acceptance is the opt-in real DeepSeek conversation smoke after the user configures a model in DSH Web. LearnLoop neither reads nor receives that credential.
