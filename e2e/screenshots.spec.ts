import { expect, test } from '@playwright/test'
import path from 'node:path'

/** Reference screenshots, only when SCREENSHOT_DIR is set (SCREENSHOT_DIR=… npm run test:e2e). */
const dir = process.env.SCREENSHOT_DIR ?? ''

test.skip(!dir, 'set SCREENSHOT_DIR to capture screenshots')
test.use({ viewport: { width: 1536, height: 1024 } })

test('editor screenshots', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('piece-outline')).toHaveCount(2)
  const front = page.getByTestId('piece-item').filter({ hasText: 'Delantero' })
  await front.click()
  await page.mouse.move(700, 500)
  await page.screenshot({ path: path.join(dir, 'f2a-editor.png') })

  await front.click()
  await page.getByRole('checkbox', { name: 'Tallas' }).check()
  await expect(page.getByTestId('layer-sizes')).toHaveCount(1)
  await page.screenshot({ path: path.join(dir, 'f2a-sizes.png') })
})
