import { z } from "zod";

export const failureBody = z.object({
  jobId: z.string().min(1),
  runId: z.string().min(1),
  paymentEventId: z.string().min(1),
  eventType: z.enum(["settlement", "receipt_delivery"]),
  amountCents: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  reason: z.string().min(1).max(500)
}).strict();

export type Failure = z.infer<typeof failureBody>;

export function decideFailure(failure: Failure) {
  const requiresReview = failure.eventType === "settlement" && failure.amountCents >= 100_000;
  return {
    action: requiresReview ? "hold_for_review" : "retry_with_operator_approval",
    notification: {
      paymentEventId: failure.paymentEventId,
      runId: failure.runId,
      occurredAt: failure.occurredAt,
      severity: requiresReview ? "critical" : "error",
      audience: requiresReview ? "risk_and_operations" : "operations"
    }
  } as const;
}
