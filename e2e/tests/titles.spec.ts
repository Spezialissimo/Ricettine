import { expect, test } from '@playwright/test';
import { newContext, newUserPage, publishRecipe } from './helpers';

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
