import { test, expect } from '@playwright/test'

// Regression: ISSUE-006 — admin panel accessible without auth
// Found by /qa on 2026-04-18
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-18.md
test('admin panel blocked for unauthenticated users', async ({ page }) => {
  await page.goto('/?admin=1')
  await expect(page.getByText('You must be signed in as an admin')).toBeVisible()
})

// Regression: ISSUE-002 — empty sign-in form gave no feedback
// Found by /qa on 2026-04-18
test('sign-in empty form shows error toast', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign In' }).first().click()
  // Modal is open — click the Sign In submit button inside the form
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByText(/please enter your email and password/i)).toBeVisible({ timeout: 3000 })
})

test('homepage loads with canvas and toolbar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  await expect(page.getByRole('button', { name: /box/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /save/i })).toBeVisible()
  await expect(page.getByText('AI Chat')).toBeVisible()
})

test('save button shows saved toast', async ({ page }) => {
  await page.goto('/')
  await page.locator('button', { hasText: 'Save' }).click()
  await expect(page.getByText('Saved')).toBeVisible()
})

test('sign-in modal opens and closes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign In' }).first().click()
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  // Close via backdrop click
  await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } })
  await expect(page.getByRole('heading', { name: 'Sign In' })).not.toBeVisible()
})
