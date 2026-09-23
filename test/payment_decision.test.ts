import assert from "node:assert/strict";
import { test } from "node:test";
import { decideFailure, failureBody } from "../src/payment_decision.ts";

test("high-value settlement pauses for risk review and keeps an audit trail", () => {
  const failure = failureBody.parse({
    jobId: "creator-payout-settlement",
    runId: "run-42",
    paymentEventId: "payout-42",
    eventType: "settlement",
    amountCents: 125000,
    occurredAt: "2026-09-20T01:00:00.000Z",
    reason: "Ledger mismatch"
  });
  assert.deepEqual(decideFailure(failure), {
    action: "hold_for_review",
    notification: {
      paymentEventId: "payout-42",
      runId: "run-42",
      occurredAt: "2026-09-20T01:00:00.000Z",
      severity: "critical",
      audience: "risk_and_operations"
    }
  });
});

test("receipt delivery does not trigger a settlement hold", () => {
  const failure = failureBody.parse({
    jobId: "receipt-mailer",
    runId: "run-43",
    paymentEventId: "payout-42",
    eventType: "receipt_delivery",
    amountCents: 125000,
    occurredAt: "2026-09-20T01:00:00.000Z",
    reason: "Delivery failed"
  });
  assert.equal(decideFailure(failure).action, "retry_with_operator_approval");
});
