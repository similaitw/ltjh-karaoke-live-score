import { expect, test } from "@playwright/test";

test("complete demo, cross-tab sync, correction, locking and publishing", async ({
  page,
  context,
}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "賽事控制." })).toBeVisible();
  const display = await context.newPage();
  await display.goto("/display");
  await page.getByRole("button", { name: "50 / 50", exact: true }).click();
  await expect(display.getByText("評審 50% / 觀眾 50%")).toBeVisible();
  await page.getByRole("button", { name: "開放觀眾投票", exact: true }).click();
  await page.goto("/scan");
  await page.getByRole("button", { name: "加入 20 張示範票" }).click();
  await expect(page.getByLabel("修改卡 1 答案", { exact: true })).toHaveValue(
    "A",
  );
  await page.getByLabel("修改卡 1 答案", { exact: true }).selectOption("D");
  await expect(page.getByLabel("修改卡 1 答案", { exact: true })).toHaveValue(
    "D",
  );
  await expect(display.locator(".on-air-count")).toContainText("20");
  await page.getByRole("button", { name: "完成並鎖票", exact: true }).click();
  await page.getByRole("button", { name: "確認鎖票", exact: true }).click();
  await expect(
    page.getByLabel("修改卡 1 答案", { exact: true }),
  ).toBeDisabled();
  await page.goto("/judge");
  for (const [judge, value] of [
    ["j1", "90"],
    ["j2", "80"],
    ["j3", "100"],
  ]) {
    await page.getByLabel("評審身分").selectOption(judge);
    await page.getByLabel("整體分數").fill(value);
    await page.getByRole("button", { name: "送出評分" }).click();
    await expect(page.getByRole("status")).toContainText("評分已儲存");
  }
  await expect(display.getByTestId("score-c1").locator(".total")).toHaveText(
    "78.50",
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "公布最終成績", exact: true }).click();
  await expect(display.getByText("正式成績", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "成績已正式公布" }),
  ).toBeVisible();
  await page.goto("/cards");
  await expect(page.locator(".print-card")).toHaveCount(20);
  await expect(page.locator(".marker svg")).toHaveCount(20);
  const printed = await page.pdf({ preferCSSPageSize: true });
  expect(printed.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(10);
});

test("camera permission failure is actionable; no layout overflow on all routes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "開放觀眾投票", exact: true }).click();
  await page.goto("/scan");
  await page.getByRole("button", { name: "啟動相機", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "相機權限未開放",
  );
  for (const route of [
    "/",
    "/admin",
    "/judge",
    "/scan",
    "/display",
    "/cards",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("real video frames decode multiple cards and release camera on navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let stopped = false;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 400;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 400);
        for (let id = 0; id < 4; id++) {
          const img = new Image();
          img.src = `/cards/${id}.svg`;
          await img.decode();
          ctx.save();
          ctx.translate(90 + (id % 2) * 300, 90 + Math.floor(id / 2) * 200);
          ctx.rotate((id * Math.PI) / 2);
          ctx.drawImage(img, -70, -70, 140, 140);
          ctx.restore();
        }
        const media = canvas.captureStream(10);
        const track = media.getVideoTracks()[0];
        const original = track.stop.bind(track);
        track.stop = () => {
          stopped = true;
          original();
        };
        Object.defineProperty(window, "__cameraStopped", {
          get: () => stopped,
          configurable: true,
        });
        return media;
      },
    });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      value: async () => [],
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "開放觀眾投票", exact: true }).click();
  await page.getByRole("link", { name: "圖卡掃描", exact: true }).click();
  await page.getByRole("button", { name: "啟動相機", exact: true }).click();
  for (let n = 1; n <= 4; n++)
    await expect(
      page.getByLabel(`修改卡 ${n} 答案`, { exact: true }),
    ).toHaveValue(["A", "B", "C", "D"][n - 1]);
  await page.getByRole("link", { name: "評審席", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __cameraStopped: boolean }).__cameraStopped,
      ),
    )
    .toBe(true);
});
