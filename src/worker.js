// API bảng xếp hạng của game. File game và các tệp tĩnh do Workers Assets phục vụ;
// chỉ các đường dẫn /api/* mới chạy vào Worker này (xem wrangler.jsonc).

const MAX_NAME_LENGTH = 12;
const MAX_SCORE = 99999;
const TOP_COUNT = 10;
const MAX_BODY_BYTES = 1024;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

async function topScores(db) {
  const { results } = await db
    .prepare("SELECT name, score, created_at FROM scores ORDER BY score DESC, created_at ASC, id ASC LIMIT ?")
    .bind(TOP_COUNT)
    .all();
  return results;
}

// Trả về { name, score } đã làm sạch, hoặc { error } nếu dữ liệu không hợp lệ.
function validate(body) {
  if (!body || typeof body !== "object") return { error: "invalid_body" };

  if (typeof body.name !== "string") return { error: "invalid_name" };
  const name = body.name.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: "invalid_name" };
  const length = [...name].length;
  if (length < 1 || length > MAX_NAME_LENGTH) return { error: "invalid_name" };

  const { score } = body;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return { error: "invalid_score" };

  return { name, score };
}

async function handleScores(request, env) {
  if (request.method === "GET") {
    return json({ scores: await topScores(env.DB) });
  }

  if (request.method === "POST") {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ error: "body_too_large" }, 413);

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const checked = validate(body);
    if (checked.error) return json({ error: checked.error }, 400);

    await env.DB.prepare("INSERT INTO scores (name, score) VALUES (?, ?)").bind(checked.name, checked.score).run();
    return json({ ok: true, scores: await topScores(env.DB) }, 201);
  }

  return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/scores") return handleScores(request, env);
    return json({ error: "not_found" }, 404);
  },
};
