import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Tests ───────────────────────────────────────────────────────────────────

let testArtifactsDir: string;
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
let pageErrors: string[] = [];
let failedRequests: string[] = [];

test('smoke test - planner page loads', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Medical Desert Planner', level: 2 })).toBeVisible();
  await expect(page.getByText('Where are the highest-risk gaps in care')).toBeVisible();

  // Controls render without any data dependency.
  await expect(page.getByText('Capability', { exact: true })).toBeVisible();
  await expect(page.getByText('Care gaps')).toBeVisible();
  await expect(page.getByText('COPD risk is estimated from household solid-fuel exposure')).toBeVisible();
  await expect(page.getByText('COPD-care facilities')).toBeVisible();

  // Navigation.
  await expect(page.getByRole('link', { name: 'Planner' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved scenarios' })).toBeVisible();
});

test('smoke test - saved scenarios page loads', async ({ page }) => {
  await page.goto('/scenarios');

  await expect(page.getByRole('heading', { name: 'Saved planning scenarios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
});

test('smoke test - COPD district and facility evidence loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('COPD-care facilities')).toBeVisible();

  const districtResponse = page.waitForResponse((response) => response.url().includes('/district_coverage'));
  const partnerResponse = page.waitForResponse((response) => response.url().includes('/partner_candidates'));
  await page.getByRole('button').filter({ hasText: 'Maharashtra' }).click();
  expect((await districtResponse).ok()).toBe(true);
  expect((await partnerResponse).ok()).toBe(true);

  await expect(page.getByText('Maharashtra action brief')).toBeVisible();
  await expect(page.getByText('Top district interventions from current Unity Catalog evidence')).toBeVisible();
  await expect(page.getByText('Assess a new COPD care access point in Nandurbar')).toBeVisible();
  await expect(page.getByText('Verify care availability in Gadchiroli')).toBeVisible();
  await expect(page.getByText('Audit and upgrade COPD care in Washim')).toBeVisible();
  await expect(page.getByText('How gaps and actions are calculated')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to scenario' }).first()).toBeVisible();

  await expect(page.getByText('District COPD risk and care gaps')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'COPD risk' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Clean fuel' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Adult tobacco' })).toBeVisible();
  await expect(page.getByText('Facility evidence', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Add to scenario' }).first().click();
  await expect(page.getByRole('heading', { name: 'Save planning scenario' })).toBeVisible();
  await expect(page.getByLabel('Scenario name')).not.toHaveValue('');
  await expect(page.getByLabel('Planning notes')).toHaveValue(/Evidence confidence/);
});

// ── Lifecycle hooks ─────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  consoleLogs = [];
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];

  testArtifactsDir = join(process.cwd(), '.smoke-test');
  mkdirSync(testArtifactsDir, { recursive: true });

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (!text.trim() || /^%[osd]$/.test(text.trim())) return;
    const location = msg.location();
    const locationStr = location.url ? ` at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';
    consoleLogs.push(`[${type}] ${text}${locationStr}`);
    if (type === 'error') consoleErrors.push(`${text}${locationStr}`);
  });

  page.on('pageerror', (error) => {
    const errorDetails = `Page error: ${error.message}\nStack: ${error.stack || 'No stack trace available'}`;
    pageErrors.push(errorDetails);
    console.error('Page error detected:', errorDetails);
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(`Failed request: ${request.url()} - ${request.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const testName = testInfo.title.replace(/ /g, '-').toLowerCase();
  const screenshotPath = join(testArtifactsDir, `${testName}-app-screenshot.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const logsPath = join(testArtifactsDir, `${testName}-console-logs.txt`);
  const allLogs = [
    '=== Console Logs ===',
    ...consoleLogs,
    '\n=== Console Errors (React errors) ===',
    ...consoleErrors,
    '\n=== Page Errors ===',
    ...pageErrors,
    '\n=== Failed Requests ===',
    ...failedRequests,
  ];
  writeFileSync(logsPath, allLogs.join('\n'), 'utf-8');

  console.log(`Screenshot saved to: ${screenshotPath}`);
  console.log(`Console logs saved to: ${logsPath}`);
  if (consoleErrors.length > 0) console.log('Console errors detected:', consoleErrors);
  if (pageErrors.length > 0) console.log('Page errors detected:', pageErrors);
  if (failedRequests.length > 0) console.log('Failed requests detected:', failedRequests);

  await page.close();
});
