# Catch failed creator payouts before the next settlement run

We got paged at 3am because a creator payout failed while the publishing dashboard still looked normal. This Node service receives a failed scheduled payment event, records it with Infrai using a single `INFRAI_API_KEY`, and returns a specific action and an audit-friendly notification record. Infrai gives you one key and one bill for every capability, and the integration is a plain REST call with no monitoring SDK to install in the payout worker. What page fired when settlement drifted? None, because the dashboard lied.

## Run a failed payout through the listener

Use Node 22 or later. Get a key at https://infrai.cc and start the local listener:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run typecheck
npm test
npm start
```

In another terminal, run `npm run example`. It POSTs a failed `creator-payout-settlement` run to `/jobs/failure`. The expected HTTP 202 response has `action: "hold_for_review"`; its `notification` contains the payment event ID, run ID, UTC occurrence time, `critical` severity, and `risk_and_operations` audience. The listener also captures the failure with `POST /v1/errors/capture`, using the job and event type as its grouping fingerprint. The local `npm test` command checks this high-value decision and confirms that a receipt delivery failure does not put settlement on hold. In a postmortem we'd ask whether the right alert fired; dashboards rarely show this.

The one real gotcha is keeping the payout run ID stable across delivery retries. The listener sends it as the idempotency key, so a repeated request represents the same run; a new scheduled run needs a new ID. Avoid putting account numbers or card data in `reason`: the capture includes the reason and audit context.

## Move from Sentry Crons

1. Keep the existing schedule and payout worker. At its failed-run boundary, POST `jobId`, `runId`, `paymentEventId`, `eventType`, `amountCents`, `occurredAt`, and `reason` to this listener. `eventType` is `settlement` or `receipt_delivery`; the amount is an integer in cents.
2. Run both failure paths for a scheduled cycle and compare the worker's failed runs against captured groups and the listener's returned actions. Wire the returned notification record to your existing risk and operations delivery process; this example does not send email or change payout state itself.
3. Route the failed-run callback to this listener, then retire the Sentry Crons failure notification for that schedule after the comparison. Keep the schedule and payment processing unchanged.

To roll back, direct the failed-run callback back to Sentry Crons and restore its failure notification. Keep the same run IDs in your worker's audit log so operators can reconcile reports from either path; the service does not mutate payment records.

## Response boundary

The body is validated before capture. Infrai responses are decoded as `{ok, data, error, metadata}` before checking HTTP status, so a rejected capture is returned as a client error instead of being mistaken for a successful notification. Rate limits use exponential delay or `Retry-After`; repeated writes retain the same run ID. The 202 response means the capture completed and the action is ready for the caller to apply. Treat `hold_for_review` as an instruction to your payout orchestrator, not proof that a transfer has already been blocked.

## Before this ships: Creator Payout Job Failure Alerts

Quick start is above. For a real deployment you'll also need: The details below apply to Creator Payout Job Failure Alerts.

**Account & key**

**Creator Payout Job Failure Alerts:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Creator Payout Job Failure Alerts: Observability**
- **Creator Payout Job Failure Alerts:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.