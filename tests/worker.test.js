import test from "node:test";
import assert from "node:assert/strict";

import worker from "../worker/index.js";

test("worker health endpoint returns ok", async () => {
  const response = await worker.fetch(new Request("https://example-worker.workers.dev/health"), {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.service, "cefr-vocab-reader-worker");
});

test("worker analyze endpoint validates required fields", async () => {
  const response = await worker.fetch(
    new Request("https://example-worker.workers.dev/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }),
    {}
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, "selectionText and threshold are required");
});
