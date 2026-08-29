# Host-authoritative Reviews

Profile and Plan decisions are HTTP v3 Host commands initiated by LearnLoop views. `confirm-profile` and `approve-plan` are explicit approvals; revision commands are not approvals. Every successful command uses canonical Workspace/Session ownership, optimistic revision checks, idempotent receipts, and audit events. Model confirmation, approval, and plan-revision tools are not registered. Plan approval activates the Draft but leaves every task pending and execution null.
