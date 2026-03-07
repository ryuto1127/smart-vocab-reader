import { createAnalysisService } from "../backend/analysis-service.js";

const BODY_LIMIT_BYTES = 100_000;
const analysisCache = new Map();

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function readJsonBody(request) {
  const body = await request.text();

  if (body.length > BODY_LIMIT_BYTES) {
    throw new Error("Request body too large");
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return jsonResponse(204, {});
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(200, {
        ok: true,
        service: "cefr-vocab-reader-worker"
      });
    }

    const analysisService = createAnalysisService({
      env,
      fetchImpl: fetch,
      cache: analysisCache
    });

    try {
      if (request.method === "POST" && url.pathname === "/api/analyze") {
        const body = await readJsonBody(request);

        if (typeof body.selectionText !== "string" || typeof body.threshold !== "string") {
          return jsonResponse(400, {
            error: "selectionText and threshold are required"
          });
        }

        const result = await analysisService.analyzeSelection({
          selectionText: body.selectionText,
          threshold: body.threshold
        });

        return jsonResponse(200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/details") {
        const body = await readJsonBody(request);
        const result = await analysisService.loadWordDetails(body);
        return jsonResponse(200, result);
      }

      return jsonResponse(404, { error: "Not found" });
    } catch (error) {
      return jsonResponse(500, {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
};
