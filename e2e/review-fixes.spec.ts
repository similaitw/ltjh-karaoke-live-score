import { expect, test } from "@playwright/test";

test("1, 20 and 40 cards print four per A4 page", async ({ page }) => {
  await page.goto("/cards");
  await expect(page.locator(".cards-grid")).toHaveAttribute(
    "data-cards-per-page",
    "4",
  );
  for (const count of [1, 20, 40]) {
    await page.getByLabel("圖卡數量").fill(String(count));
    await expect(page.locator(".print-card")).toHaveCount(count);
    await expect(page.locator(".print-card").last()).toContainText(
      `ID ${count - 1}`,
    );
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(
      Math.ceil(count / 4),
    );
  }
  await expect(page.locator(".print-card").first()).toContainText("B · 85");
  await expect(page.locator(".print-card").first()).toContainText("C · 70");
  await expect(page.locator(".print-card").first()).toContainText("D · 55");
});

test("settings, confirmed reset, repoll, publication and weight unlocking", async ({
  page,
}) => {
  await page.goto("/admin");
  for (const weight of [100, 70, 50, 30, 0]) {
    await page
      .getByRole("button", { name: `${weight} / ${100 - weight}`, exact: true })
      .click();
    await expect(page.getByLabel("評分權重")).toHaveValue(String(weight));
  }
  for (const [answer, points] of [
    ["A", 100],
    ["B", 85],
    ["C", 70],
    ["D", 55],
  ] as const)
    await expect(
      page.getByLabel(`${answer} 分數`, { exact: true }),
    ).toHaveValue(String(points));
  await page.getByLabel("B 分數", { exact: true }).fill("86");
  await page.getByRole("button", { name: "儲存觀眾分數" }).click();
  await page.goto("/cards");
  await expect(page.locator(".print-card").first()).toContainText("B · 86");
  await page.goto("/admin");
  await page.getByLabel("B 分數", { exact: true }).fill("85");
  await page.getByRole("button", { name: "儲存觀眾分數" }).click();
  await page.getByRole("button", { name: "開放觀眾投票", exact: true }).click();
  await expect(page.getByLabel("評分權重")).toBeDisabled();
  await expect(page.getByLabel("B 分數", { exact: true })).toBeDisabled();
  await page.goto("/judge");
  await expect(
    page.getByText("目前為 0/100 全觀眾模式，可略過評審流程。"),
  ).toBeVisible();
  await page.goto("/scan");
  await page.getByRole("button", { name: "加入 20 張示範票" }).click();
  await page.getByRole("button", { name: "完成並鎖票", exact: true }).click();
  await page.getByRole("button", { name: "確認鎖票", exact: true }).click();
  await page.goto("/admin");
  await page.getByRole("button", { name: "重新開票／清除本輪" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "清除這位選手本輪所有觀眾票",
  );
  await page.getByRole("button", { name: "取消操作" }).click();
  await expect(page.getByText("已鎖票", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重新開票／清除本輪" }).click();
  await page.getByRole("button", { name: "確認執行" }).click();
  await page.goto("/scan");
  await expect(page.locator(".vote-total")).toHaveText("0/ 40");
  await expect(page.getByLabel("修改卡 1 答案", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "加入 20 張示範票" }).click();
  await page.getByRole("button", { name: "完成並鎖票", exact: true }).click();
  await page.getByRole("button", { name: "確認鎖票", exact: true }).click();
  await page.goto("/admin");
  await page.getByRole("button", { name: "公布最終成績", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重新開票／清除本輪" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消公布，繼續編輯" }).click();
  await expect(
    page.getByRole("heading", { name: "成績已正式公布" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "確認執行" }).click();
  await page.getByRole("button", { name: "解鎖權重", exact: true }).click();
  await expect(page.getByLabel("評分權重")).toBeDisabled();
  await page.getByRole("button", { name: "確認執行" }).click();
  await page.getByRole("button", { name: "30 / 70", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("重新計算");
  await page.getByRole("button", { name: "確認執行" }).click();
  await expect(page.getByLabel("評分權重")).toBeDisabled();
  await expect(page.getByLabel("評分權重")).toHaveValue("30");
  await expect(
    page.getByText("評審 0% → 30%；重新計算未公布結果", { exact: false }),
  ).toBeVisible();
});

test("rubric fields enforce maximums, replace existing scores and show admin details", async ({
  page,
}) => {
  await page.goto("/judge");
  for (const [label, max] of [
    ["音準", 25],
    ["節奏", 20],
    ["歌唱技巧", 20],
    ["情感表達", 20],
    ["舞台表現", 15],
  ] as const) {
    await expect(page.getByLabel(label)).toHaveAttribute("max", String(max));
    await page.getByLabel(label).fill(String(max));
  }
  await page.getByLabel("音準").fill("26");
  await page.getByRole("button", { name: "送出評分" }).click();
  await expect(
    page.getByText("你的評分尚未送出", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("音準").fill("25");
  await expect(page.getByLabel("評審總分")).toHaveText("100");
  await page.getByRole("button", { name: "送出評分" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "評分已儲存" }),
  ).toContainText("評分已儲存");
  await page.getByLabel("舞台表現").fill("10");
  await page.getByRole("button", { name: "更新評分" }).click();
  await expect(
    page.getByText("你的已存分數：95", { exact: true }),
  ).toBeVisible();
  await page.goto("/admin");
  await page
    .getByText("林語晴", { exact: true })
    .filter({ hasNot: page.locator("strong") })
    .last()
    .click();
  await expect(
    page.getByText("音樂老師：音準 25/25", { exact: false }),
  ).toContainText("舞台表現 10/15 · 總分 95/100");
});
