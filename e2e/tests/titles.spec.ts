import { expect } from '@playwright/test';
import { newContext, newUserPage, publishRecipe, test } from '../helpers';

test('page titles follow the route and the recipe', async ({ browser }, testInfo) => {
  const anon = await (await newContext(browser, testInfo)).newPage();
  await anon.goto('/login');
  await expect(anon).toHaveTitle('Log in · Ricettine');

  const { page: p } = await newUserPage(browser, testInfo, 'ttl');
  await p.goto('/cookbooks');
  await expect(p).toHaveTitle('Cookbooks · Ricettine');

  const name = `Title soup ${testInfo.project.name}`;
  const { shareUrl } = await publishRecipe(p, { title: name, ingredients: ['salt'], steps: ['Boil'] });
  await p.goto(new URL(shareUrl).pathname);
  await expect(p).toHaveTitle(`${name} · Ricettine`);
  await p.waitForTimeout(1000);
  await expect(p).toHaveTitle(`${name} · Ricettine`);

  await p.goto('/recipes');
  await expect(p).toHaveTitle('My recipes · Ricettine');
});

test('cold loads of /login and a /r/ link log no console or page errors', async ({ browser }, testInfo) => {
  const { page: author } = await newUserPage(browser, testInfo, 'ttlerr');
  const { shareUrl } = await publishRecipe(author, {
    title: `Quiet soup ${testInfo.project.name}`,
    ingredients: ['salt'],
    steps: ['Boil'],
  });

  const ctx = await newContext(browser, testInfo);
  const page = await ctx.newPage();
  const problems: string[] = [];
  page.on('console', (m) => {
    // an anonymous visitor's GET /api/me is a 401 by design, and the browser logs it; nothing else is filtered
    if (m.type() === 'error' && !/Failed to load resource.*\b401\b/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/login');
  await expect(page).toHaveTitle('Log in · Ricettine');
  await page.goto(new URL(shareUrl).pathname);
  await expect(page.getByRole('heading', { name: `Quiet soup ${testInfo.project.name}`, level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  expect(problems).toEqual([]);
});
