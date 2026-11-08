import { expect, test } from "@playwright/test";

// Các biến state, player, score... là biến toàn cục của game nên đọc được trực tiếp trong page.evaluate.

async function openAndStart(page) {
  await page.goto("/");
  await expect(page.locator("canvas#game")).toBeVisible();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => state)).toBe("play");
}

const uniqueName = () => `T${Date.now() % 1_000_000}`;

test("trang game mở được và không có lỗi trong console", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page).toHaveTitle("Bánh Mì Thần Tốc");
  await expect.poll(() => page.evaluate(() => state)).toBe("start");
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => state)).toBe("play");
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("nhân vật chạy sang phải và nhảy lên được", async ({ page }) => {
  await openAndStart(page);
  const x0 = await page.evaluate(() => player.x);

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowRight");
  expect(await page.evaluate(() => player.x)).toBeGreaterThan(x0 + 20);

  const y0 = await page.evaluate(() => player.y);
  await page.keyboard.down("Space");
  await page.waitForTimeout(250);
  const y1 = await page.evaluate(() => player.y);
  await page.keyboard.up("Space");
  expect(y1).toBeLessThan(y0 - 20);
});

test("bị chuột cắn lần đầu thì nhỏ lại, lần hai mới mất mạng", async ({ page }) => {
  await openAndStart(page);

  await page.evaluate(() => hurt());
  expect(await page.evaluate(() => ({ state, lives, small: player.small }))).toEqual({ state: "play", lives: 3, small: true });

  // Đang nhấp nháy bất tử thì cắn tiếp vẫn không sao
  await page.evaluate(() => hurt());
  expect(await page.evaluate(() => ({ state, lives }))).toEqual({ state: "play", lives: 3 });

  await page.evaluate(() => { player.inv = 0; hurt(); });
  expect(await page.evaluate(() => ({ state, lives }))).toEqual({ state: "dying", lives: 2 });
});

test("hái bông hoa khi đang nhỏ thì lớn lại", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => hurt());
  expect(await page.evaluate(() => player.small)).toBe(true);

  await page.evaluate(() => {
    const f = items.find((i) => i.type === "flower");
    player.x = f.x - player.w / 2;
    player.y = f.y - player.h / 2;
    player.vy = 0;
  });
  await expect.poll(() => page.evaluate(() => player.small)).toBe(false);
});

test("thắng thì gửi điểm lên bảng xếp hạng và thấy tên mình", async ({ page, request }) => {
  const name = uniqueName();
  await openAndStart(page);
  await page.evaluate(() => { score = 4321; win(); });

  const panel = page.locator("#lb");
  await expect(panel).toBeVisible();
  await expect(page.locator("#lb-sub")).toContainText("4321");

  await page.locator("#lb-name").fill(name);
  await page.locator("#lb-send").click();
  await expect(page.locator("#lb-msg")).toHaveText("Đã gửi điểm!");
  await expect(page.locator("#lb-list li.mine")).toContainText(name);
  await expect(page.locator("#lb-list li.mine")).toContainText("4321");

  // Dữ liệu thật sự nằm trong D1: đọc lại trực tiếp qua API
  const body = await (await request.get("/api/scores")).json();
  expect(body.scores).toContainEqual(expect.objectContaining({ name, score: 4321 }));

  await page.locator("#lb-restart").click();
  await expect(panel).toBeHidden();
  await expect.poll(() => page.evaluate(() => state)).toBe("play");
});

test("hết mạng cũng hiện bảng xếp hạng", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => { lives = 1; player.inv = 0; die(); });
  await expect(page.locator("#lb")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#lb-title")).toContainText("HẾT MẠNG");
});

test("gõ tên có chữ r và dấu cách không kích hoạt phím điều khiển game", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => win());
  await expect(page.locator("#lb")).toBeVisible();

  await page.locator("#lb-name").fill("");
  await page.locator("#lb-name").pressSequentially("r r");
  await expect(page.locator("#lb-name")).toHaveValue("r r");
  expect(await page.evaluate(() => state)).toBe("win");
});

test("tên không hợp lệ thì báo lỗi và cho gửi lại", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => win());
  await page.locator("#lb-name").fill("   ");
  await page.locator("#lb-send").click();
  await expect(page.locator("#lb-msg")).toContainText("Tên không hợp lệ");
  await expect(page.locator("#lb-send")).toBeEnabled();
});

test("tên chứa thẻ HTML được hiện như chữ thường", async ({ page }) => {
  await openAndStart(page);
  await page.evaluate(() => { score = 77; win(); });
  await page.locator("#lb-name").fill("<i>hi</i>");
  await page.locator("#lb-send").click();
  await expect(page.locator("#lb-msg")).toHaveText("Đã gửi điểm!");
  await expect(page.locator("#lb-list li.mine .who")).toHaveText("<i>hi</i>");
  expect(await page.locator("#lb-list i").count()).toBe(0);
});

test("khi server bảng xếp hạng lỗi thì game vẫn chơi được bình thường", async ({ page }) => {
  await page.route("**/api/scores", (route) => route.abort());
  await openAndStart(page);
  await page.evaluate(() => win());
  await page.waitForTimeout(500);
  await expect(page.locator("#lb")).toBeHidden();
  expect(await page.evaluate(() => state)).toBe("win");

  await page.keyboard.press("r");
  await expect.poll(() => page.evaluate(() => state)).toBe("play");
});
