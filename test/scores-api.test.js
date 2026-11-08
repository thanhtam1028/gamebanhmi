import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const call = (path, init) => exports.default.fetch(`http://example.com${path}`, init);
const post = (body) =>
  call("/api/scores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const list = async () => (await (await call("/api/scores")).json()).scores;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM scores").run();
});

describe("GET /api/scores", () => {
  it("trả về danh sách rỗng khi chưa có ai chơi", async () => {
    const res = await call("/api/scores");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ scores: [] });
  });

  it("sắp xếp điểm cao trước, bằng điểm thì ai gửi trước đứng trước", async () => {
    await post({ name: "An", score: 100 });
    await post({ name: "Bình", score: 300 });
    await post({ name: "Cúc", score: 100 });
    const scores = await list();
    expect(scores.map((s) => s.name)).toEqual(["Bình", "An", "Cúc"]);
  });

  it("chỉ trả về top 10", async () => {
    for (let i = 1; i <= 12; i++) await post({ name: `P${i}`, score: i * 10 });
    const scores = await list();
    expect(scores).toHaveLength(10);
    expect(scores[0]).toMatchObject({ name: "P12", score: 120 });
    expect(scores[9]).toMatchObject({ name: "P3", score: 30 });
  });
});

describe("POST /api/scores", () => {
  it("lưu điểm hợp lệ vào D1 và trả về bảng mới", async () => {
    const res = await post({ name: "  Bánh Mì  ", score: 450 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scores[0]).toMatchObject({ name: "Bánh Mì", score: 450 });

    const row = await env.DB.prepare("SELECT name, score FROM scores").first();
    expect(row).toEqual({ name: "Bánh Mì", score: 450 });
  });

  it("chấp nhận điểm 0 và điểm tối đa", async () => {
    expect((await post({ name: "Zero", score: 0 })).status).toBe(201);
    expect((await post({ name: "Max", score: 99999 })).status).toBe(201);
  });

  it("chấp nhận tên 12 ký tự có dấu và emoji", async () => {
    expect((await post({ name: "ÂÊÔƠƯĂĐ🥖🥖🥖🥖🥖", score: 1 })).status).toBe(201);
  });

  it("lưu tên có thẻ HTML như văn bản thường, không biến đổi", async () => {
    await post({ name: "<b>x</b>", score: 5 });
    expect((await list())[0].name).toBe("<b>x</b>");
  });

  it.each([
    ["tên thiếu", { score: 10 }],
    ["tên không phải chuỗi", { name: 123, score: 10 }],
    ["tên rỗng", { name: "", score: 10 }],
    ["tên chỉ có dấu cách", { name: "   ", score: 10 }],
    ["tên dài hơn 12 ký tự", { name: "a".repeat(13), score: 10 }],
    ["tên có ký tự điều khiển", { name: "a\nb", score: 10 }],
  ])("từ chối %s", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_name");
    expect(await list()).toEqual([]);
  });

  it.each([
    ["điểm thiếu", { name: "An" }],
    ["điểm âm", { name: "An", score: -1 }],
    ["điểm có phần thập phân", { name: "An", score: 1.5 }],
    ["điểm là chuỗi", { name: "An", score: "100" }],
    ["điểm vượt mức tối đa", { name: "An", score: 100000 }],
    ["điểm vô cực (null sau JSON)", { name: "An", score: null }],
  ])("từ chối %s", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_score");
    expect(await list()).toEqual([]);
  });

  it("từ chối JSON hỏng", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("từ chối nội dung không phải đối tượng", async () => {
    const res = await post("123");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });

  it("từ chối nội dung quá lớn", async () => {
    const res = await post({ name: "An", score: 1, padding: "x".repeat(2000) });
    expect(res.status).toBe(413);
    expect(await list()).toEqual([]);
  });
});

describe("đường dẫn và phương thức khác", () => {
  it("trả 405 kèm Allow cho phương thức không hỗ trợ", async () => {
    const res = await call("/api/scores", { method: "DELETE" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, POST");
  });

  it("trả 404 cho đường dẫn API lạ", async () => {
    const res = await call("/api/khong-co");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});
