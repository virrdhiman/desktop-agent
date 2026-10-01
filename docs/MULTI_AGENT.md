# Multi-Agent Team Mode

VD Agent can process a normal chat message through a bounded team instead of relying on one model pass.

## Modes

Choose **Team: Off**, **Team: Auto**, or **Team: Always** in the Agent header or Settings.

- **Off** uses the standard executor flow.
- **Auto** uses the team for coding, documentation, analysis, and other substantial requests. Short conversational messages stay single-agent to preserve free-tier quota and latency.
- **Always** uses the team for every message.

New and existing installations default to **Auto**.

## Workflow

```text
User request
  -> Analyst: defines intent, constraints, risks, and acceptance criteria
  -> Executor: inspects the workspace, uses tools, makes changes, and verifies them
  -> Reviewer: checks completeness and compares claims with tool evidence
  -> Executor repair: one bounded repair pass when the review finds a material gap
  -> Verifier: produces the concise final answer from the latest work and evidence
```

The app shows role progress in the task timeline, but only the final verified response is added to chat. Drafts and internal review JSON are not displayed.

## Safety and evidence

- Only the Executor may call tools or modify the workspace. Analyst, Reviewer, and Verifier tool requests are rejected.
- Reviewers receive bounded tool-result summaries, including success or failure and relevant output, rather than trusting the Executor's claims.
- A malformed or empty specialist response does not erase valid executor work. VD falls back to the evidence-backed executor answer.
- The review loop is capped at two reviews and one repair pass.
- **Stop** is honored between every role and during model calls.
- Existing tool permissions, workspace boundaries, checkpoints, response checks, and provider fallback remain in force.

## Providers and free keys

When several official free providers are configured, VD prefers different providers for independent specialist passes. With one configured provider, Team Mode still works by giving isolated role contexts to separate model calls.

Team Mode does not require a paid service, but it uses more API requests and tokens than standard chat. **Auto** is the recommended setting for free keys because it keeps simple questions on one model call. Provider rate limits still apply, and adding more than one official free provider improves resilience.

The request and bounded context can be sent to up to three configured official free providers. Reviewer and Verifier calls also receive the latest executor answer and bounded tool evidence. Team Mode does not implicitly use community proxies or paid providers. Use **Off** or one local provider for sensitive work that must stay with a single endpoint.

## Limits

This is orchestrated collaboration, not several processes editing files concurrently. Sequential execution is intentional: parallel writers would create conflicting edits and make evidence unreliable. Multiple model opinions can reduce blind spots, but they cannot guarantee correctness; real tests and tool evidence remain the completion standard.
