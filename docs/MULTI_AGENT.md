# Agentic Environments

VD Agent can process a normal chat message through a bounded team instead of relying on one model pass.

## Modes

Choose an **Agent Environment** in the Agent header or Settings.

- **Normal** uses the standard single-executor flow.
- **Smart** uses the team for coding, documentation, analysis, and other substantial requests. Short conversational messages stay single-agent to preserve free-tier quota and latency.
- **Agentic** uses the team for every message.

New and existing installations default to **Smart**.

## Workflow

```text
User request
  -> Analyst: clarifies intent and rewrites the request into an optimized executor prompt
  -> Optional specialists: read-only task-specific guidance selected by preset and request
  -> Executor: inspects the workspace, uses tools, makes changes, and verifies them
  -> Reviewer: checks the original request, optimized prompt, and tool evidence
  -> Executor repair: one bounded repair prompt and work pass when the review finds a material gap
  -> Verifier: produces the concise final answer from the latest work and evidence
```

The app shows role progress in the task timeline, but only the final verified response is added to chat. Drafts and internal review JSON are not displayed.

## Visual trace

Every specialist pass writes a structured trace entry to the active task. Open **Tasks** after a run to expand **Agent trace** and inspect each role's bounded input, output, provider, status, and the evidence supplied to review/verifier passes. These traces are local session data and are restored with the chat.

## Presets and custom agents

Settings includes saved team presets:

- **Default Team**: general-purpose prompt analyst, worker, reviewer, and verifier.
- **Coding Team**: implementation, regression risk, and verification focus.
- **Research Team**: source freshness, primary evidence, and uncertainty focus.
- **CSV/Data Team**: schema, provenance, archive safety, and validation focus.
- **Security Review Team**: defensive security review, severity, evidence, and mitigation focus.

Custom instructions for the Prompt Analyst, Worker, Reviewer, and Final Verifier override the selected preset role by role. Custom role text is additive in power but bounded in authority: it guides the specialist, but it does not remove tool isolation, workspace permissions, evidence checks, review limits, token caps, or final-response guardrails.

## Dynamic specialists

When enabled, VD can add read-only specialists based on the request and selected preset. Examples include a Security Specialist, Data Specialist, Research Specialist, or Test Planner. Dynamic specialists never call tools or edit files; they provide compact guidance to the Executor. The selected token budget caps how many can run.

## Safety and evidence

- Only the Executor may call tools or modify the workspace. Analyst, Reviewer, and Verifier tool requests are rejected.
- Reviewers receive bounded tool-result summaries, including success or failure and relevant output, rather than trusting the Executor's claims.
- A malformed or empty specialist response does not erase valid executor work. VD falls back to the evidence-backed executor answer.
- The review loop is capped at two reviews and one repair pass.
- **Stop** is honored between every role and during model calls.
- Existing tool permissions, workspace boundaries, checkpoints, response checks, and provider fallback remain in force.

## Providers and free keys

When several official free providers are configured, VD prefers different providers for independent specialist passes. With one configured provider, Agentic mode still works by giving isolated role contexts to separate model calls.

Agentic mode does not require a paid service, but it uses more API requests and tokens than standard chat. **Smart** is the recommended setting for free keys because it keeps simple questions on one model call. Provider rate limits still apply, and adding more than one official free provider improves resilience.

The request and bounded context can be sent to up to three configured official free providers. Reviewer and Verifier calls also receive the latest executor answer and bounded tool evidence. Agentic mode does not implicitly use paid providers. Use **Normal** or one local provider for sensitive work that must stay with a single endpoint.

## Limits

This follows the current production pattern used by modern agent frameworks: bounded orchestration, specialist handoffs, guardrails, traces, durable sessions, and explicit termination criteria. It is not several processes editing files concurrently. Sequential execution is intentional: parallel writers would create conflicting edits and make evidence unreliable. Multiple model opinions can reduce blind spots, but they cannot guarantee correctness; real tests and tool evidence remain the completion standard.

## Token efficiency

The team is deliberately compact. Smart mode only invokes specialists for substantial work, analyst output is capped, reviewer issues are limited, evidence summaries are shortened before being sent to specialist roles, and the loop is capped.

- **Cheap**: highest savings, no dynamic specialists, tight context/evidence caps, one review pass.
- **Balanced**: default, one dynamic specialist, medium caps, one repair opportunity.
- **Strong**: largest context/evidence caps, up to two dynamic specialists, strongest review context.

Agentic mode gives the strongest workflow, but Normal and Smart remain available when token use matters more than extra review.
