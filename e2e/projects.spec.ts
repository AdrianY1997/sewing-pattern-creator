import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1536, height: 1024 } })

const title = (page: Page) => page.getByLabel('Título del patrón')
const saved = (page: Page) =>
  expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')

const rename = async (page: Page, name: string) => {
  await title(page).fill(name)
  await expect(page.getByTestId('save-status')).toHaveText('Guardando…')
  await saved(page)
}

const openProjects = async (page: Page) => {
  await page.getByRole('button', { name: 'Mis patrones' }).click()
  await expect(page.getByRole('dialog', { name: 'Mis patrones' })).toBeVisible()
}

test('an edit is autosaved and kept after reloading', async ({ page }) => {
  await page.goto('./')
  await saved(page)
  await rename(page, 'Mi cuerpo')
  await page.getByTestId('size-select').selectOption('14')
  await expect(page.getByTestId('save-status')).toHaveText('Guardando…')
  await saved(page)
  await page.reload()
  await expect(title(page)).toHaveValue('Mi cuerpo')
  await expect(page.getByTestId('size-select')).toHaveValue('14')
})

test('several projects: create, switch, export and import', async ({ page }) => {
  await page.goto('./')
  await saved(page)
  await rename(page, 'Primero')

  await page.getByRole('button', { name: 'Nuevo patrón' }).click()
  await expect(title(page)).toHaveValue('Cuerpo base mujer')
  await rename(page, 'Segundo')

  await openProjects(page)
  const cards = page.getByTestId('project-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: 'Primero' }).locator('img')).toBeVisible()

  // Switch to the first project.
  await cards.filter({ hasText: 'Primero' }).getByRole('button', { name: 'Abrir' }).click()
  await expect(title(page)).toHaveValue('Primero')

  // Export it and import the file: a third project, the originals untouched.
  await openProjects(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    cards.filter({ hasText: 'Primero' }).getByRole('button', { name: 'Exportar' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('primero.json')
  const path = await download.path()
  await page.getByTestId('import-project-input').setInputFiles(path)
  await expect(cards).toHaveCount(3)
  await expect(cards.filter({ hasText: 'Primero' })).toHaveCount(2)

  // Rename, duplicate and delete (with confirmation).
  const second = cards.filter({ hasText: 'Segundo' })
  await second.getByRole('button', { name: 'Duplicar' }).click()
  await expect(cards.filter({ hasText: 'Segundo (copia)' })).toHaveCount(1)
  await cards
    .filter({ hasText: 'Segundo (copia)' })
    .getByRole('button', { name: 'Eliminar' })
    .click()
  await page.getByRole('button', { name: 'Sí, eliminar' }).click()
  await expect(cards).toHaveCount(3)
})

test('importing a newer or malformed file shows an error and changes nothing', async ({ page }) => {
  await page.goto('./')
  await saved(page)
  await openProjects(page)
  const input = page.getByTestId('import-project-input')
  const file = (body: string) => ({
    name: 'p.json',
    mimeType: 'application/json',
    buffer: Buffer.from(body),
  })
  await input.setInputFiles(file('{ not json'))
  await expect(page.locator('.project-notice')).toContainText('JSON válido')
  await input.setInputFiles(
    file(
      JSON.stringify({
        app: 'sewing-pattern-creator',
        schemaVersion: 99,
        project: { schemaVersion: 99, blockId: 'women-bodice' },
      }),
    ),
  )
  await expect(page.locator('.project-notice')).toContainText('versión más reciente')
  await expect(page.getByTestId('project-card')).toHaveCount(1)
})

test('projects page screenshot', async ({ page }) => {
  test.skip(!process.env.SCREENSHOT_DIR, 'set SCREENSHOT_DIR to capture screenshots')
  await page.goto('./')
  await saved(page)
  await rename(page, 'Cuerpo de prueba')
  await page.getByRole('button', { name: 'Nuevo patrón' }).click()
  await page.getByTestId('block-select').selectOption('women-sleeve')
  await rename(page, 'Manga mujer')
  await openProjects(page)
  await expect(page.getByTestId('project-card')).toHaveCount(2)
  await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/projects.png` })
})
