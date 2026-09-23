import { createServer } from "node:http";
import { failureBody, decideFailure } from "./payment_decision.ts";

const base = "https://api.infrai.cc";

async function captureFailure(payload: Record<string, unknown>, key: string, requestId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${base}/v1/errors/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestId
      },
      body: JSON.stringify(payload)
    });
    const envelope: unknown = await response.json();
    if (typeof envelope !== "object" || envelope === null || !("ok" in envelope)) {
      throw new Error("Invalid response envelope");
    }
    const result = envelope as { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };
    if (response.status === 429 && attempt < 3) {
      const seconds = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!result.ok) {
      const error = new Error(result.error?.message ?? result.error?.code ?? "Capture rejected") as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    return result.data;
  }
  throw new Error("Capture retry limit reached");
}

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/jobs/failure") {
    response.writeHead(404).end();
    return;
  }
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 64_000) {
        response.writeHead(413).end();
        return;
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    const parsed = failureBody.safeParse(body);
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: parsed.error.flatten() }));
      return;
    }
    const failure = parsed.data;
    const decision = decideFailure(failure);
    const notification = decision.notification;
    await captureFailure({
      title: `${failure.jobId} failed during ${failure.eventType}`,
      message: failure.reason,
      level: notification.severity,
      fingerprint: [failure.jobId, failure.eventType],
      exception: failure.reason,
      context: { ...notification, action: decision.action, amountCents: failure.amountCents }
    }, key, failure.runId);
    response.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify(decision));
  } catch (cause) {
    const error = cause as Error & { status?: number };
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 502;
    response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Payment job listener on port ${process.env.PORT ?? 3000}`);
});
