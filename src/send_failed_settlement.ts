const response = await fetch("http://localhost:3000/jobs/failure", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jobId: "creator-payout-settlement",
    runId: "payout-2026-09-20-01",
    paymentEventId: "creator-payout-1842",
    eventType: "settlement",
    amountCents: 125000,
    occurredAt: "2026-09-20T01:00:00.000Z",
    reason: "Settlement reconciliation did not match the payout ledger"
  })
});
console.log(response.status, await response.json());
