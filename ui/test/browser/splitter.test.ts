// The divider between the input and the output panels.
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Fixed repo stats, so the test does not depend on GitHub.
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ json: { stargazers_count: 1234, forks_count: 56 } }),
  );
  await page.goto("/");
});

async function box(page: Page, selector: string) {
  return (await page.locator(selector).boundingBox())!;
}

test("dragging the divider resizes the panels, and past the edge hides one", async ({ page }) => {
  const before = await box(page, ".panel-input");
  const splitter = await box(page, "#splitter");
  // Grab the divider away from its buttons, which sit in the middle.
  const x = splitter.x + splitter.width / 2;
  const y = splitter.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 200, y, { steps: 5 });
  await page.mouse.up();
  const after = await box(page, ".panel-input");
  expect(after.width).toBeLessThan(before.width - 150);

  await page.mouse.move(x - 200, y);
  await page.mouse.down();
  await page.mouse.move(5, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".panel-input")).toBeHidden();
  await expect(page.locator(".panel-output")).toBeVisible();
});

test("the arrow keys move the divider", async ({ page }) => {
  const before = await box(page, ".panel-input");
  await page.locator("#splitter").focus();
  await page.keyboard.press("ArrowRight");
  expect((await box(page, ".panel-input")).width).toBeGreaterThan(before.width);
  await page.keyboard.press("End");
  await expect(page.locator(".panel-output")).toBeHidden();
});

test("the triangles show one panel, then both again at their earlier sizes", async ({ page }) => {
  const both = await box(page, ".panel-input");
  await page.locator("#splitterToOutput").click();
  await expect(page.locator(".panel-input")).toBeHidden();
  await expect(page.locator("#splitterToOutput")).toBeHidden();
  const output = await box(page, ".panel-output");
  expect(output.width).toBeGreaterThan(both.width * 1.8);

  await page.locator("#splitterToInput").click();
  await expect(page.locator(".panel-input")).toBeVisible();
  await expect(page.locator(".panel-output")).toBeVisible();
  expect((await box(page, ".panel-input")).width).toBeCloseTo(both.width, 0);

  await page.locator("#splitterToInput").click();
  await expect(page.locator(".panel-output")).toBeHidden();
  await expect(page.locator("#splitterToInput")).toBeHidden();

  // The choice outlasts a reload.
  await page.reload();
  await expect(page.locator(".panel-output")).toBeHidden();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 760 } });

  test("the panels are stacked, and the triangles point up and down", async ({ page }) => {
    const input = await box(page, ".panel-input");
    const splitter = await box(page, "#splitter");
    const output = await box(page, ".panel-output");
    expect(splitter.y).toBeGreaterThanOrEqual(input.y + input.height - 1);
    expect(output.y).toBeGreaterThanOrEqual(splitter.y + splitter.height - 1);

    await page.locator("#splitterToOutput").click();
    await expect(page.locator(".panel-input")).toBeHidden();
    expect((await box(page, ".panel-output")).height).toBeGreaterThan(output.height * 1.8);

    const x = splitter.x + 20;
    const top = (await box(page, "#splitter")).y + 5;
    await page.mouse.move(x, top);
    await page.mouse.down();
    await page.mouse.move(x, top + 300, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(".panel-input")).toBeVisible();
    expect((await box(page, ".panel-input")).height).toBeGreaterThan(200);
  });
});
