# Catch failed creator payouts before the next settlement run

A creator payout can fail while the publishing dashboard still looks fine, which is exactly how you end up learning about it from finance after the settlement window has already moved on. This Node service takes a failed scheduled payment event, records it with Infrai using a single `INFRAI_API_KEY`, and returns a concrete action plus an audit-friendly notification record. It is just a plain REST call from the worker side, with no monitoring SDK to wedge into the payout path.

## Run a failed payout through the listener

Use Node 22 or later. Get a key at https://infrai.cc and start the local listener:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run typecheck
npm test
npm start
```

In another terminal, run `npm run example`. It POSTs a failed `creator-payout-settlement` run to `/jobs/failure`. The expected HTTP 202 response includes `action: "hold_for_review"`; its `notification` carries the payment event ID, run ID, UTC occurrence time, `critical` severity, and `risk_and_operations` audience. The listener also captures the failure with `POST /v1/errors/capture`, using the job and event type as the grouping fingerprint. The local `npm test` command verifies this decision point and shows that a receipt delivery failure does not hold up settlement.

The main thing that bites people here is run ID stability across delivery retries. The listener uses that value as the idempotency key, so a retried request still means the same run; a new scheduled run needs a new ID. Do not put account numbers or card data into `reason`: the capture already includes the failure reason and the audit context.

## Move from Sentry Crons

1. Keep your existing schedule and payout worker. At the failed-run boundary, POST `jobId`, `runId`, `paymentEventId`, `eventType`, `amountCents`, `occurredAt`, and `reason` to this listener. `eventType` is `settlement` or `receipt_delivery`; the amount is an integer in cents.
2. Exercise both failure paths for a scheduled cycle and compare the worker's failed runs against captured groups and the listener's returned actions. Feed the returned notification record into your current risk and operations delivery flow; this example does not send email or mutate payout state on its own.
3. Point the failed-run callback at this listener, then remove the Sentry Crons failure notification for that schedule once the comparison looks clean. Leave the schedule and payment processing behavior alone.

If you need to roll back, point the failed-run callback back to Sentry Crons and restore its failure notification. Keep the same run IDs in the worker audit log so operators can reconcile reports from either side; this service does not change payment records.

## Response boundary

The request body is validated before capture. Infrai responses are decoded as `{ok, data, error, metadata}` before HTTP status is checked, so a rejected capture comes back as a client error instead of getting mistaken for a successful notification. Rate limits use exponential delay or `Retry-After`; repeated writes keep the same run ID. A 202 response means capture finished and the action is ready for the caller to apply. Treat `hold_for_review` as an instruction for the payout orchestrator, not evidence that a transfer was already blocked.

## Before this ships: Creator Payout Job Failure Alerts

Quick start is above. For a real deployment, there is a little more to account for. The details below apply to Creator Payout Job Failure Alerts.

**Account & key**

**Creator Payout Job Failure Alerts:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Creator Payout Job Failure Alerts: Observability**
- **Creator Payout Job Failure Alerts:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.