const { chromium } = require('playwright');
const jwt = require('../../backend/node_modules/jsonwebtoken');
const Database = require('../../backend/node_modules/better-sqlite3');
const fs = require('fs');
const path = require('path');
require('../../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

async function main() {
  const db = new Database(path.join(__dirname, '../../backend/db/itech.db'), { readonly: true });
  const user = db.prepare("SELECT id, session_version FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1").get();
  db.close();
  const token = jwt.sign({ id: user.id, session_version: user.session_version }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [];
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
      await context.addInitScript(({ authToken, userId }) => {
        localStorage.setItem('itech_token', authToken);
        localStorage.setItem('itech_user', JSON.stringify({ id: userId, role: 'admin', full_name: 'Teste visual' }));
      }, { authToken: token, userId: user.id });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:3001/estoque');
      await page.getByRole('heading', { name: 'Controle de Estoque', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cadastrar Produto' }).click();
      const productDialog = page.getByRole('dialog').first();
      await productDialog.getByText('Foto do produto', { exact: true }).waitFor();
      await productDialog.getByRole('button', { name: /Gerenciar/ }).first().waitFor({ state: 'attached' });
      await productDialog.locator('input[type=file][capture]').setInputFiles(path.join(__dirname, 'photo.png'));
      await productDialog.locator('img[alt="Prévia do produto"]').waitFor();
      await productDialog.getByRole('button', { name: /Gerenciar/ }).last().scrollIntoViewIfNeeded();
      await productDialog.getByRole('button', { name: /Gerenciar/ }).last().click();
      const supplierDialog = page.getByRole('dialog').last();
      await supplierDialog.getByRole('heading', { name: 'Gerenciar Fornecedores' }).waitFor();
      await supplierDialog.getByPlaceholder('Telefone/WhatsApp').waitFor();
      await page.screenshot({ path: path.join(__dirname, `screenshots/stock-supplier-${viewport.width}.png`), fullPage: true });
      await supplierDialog.getByRole('button', { name: 'Fechar' }).click();
      await productDialog.getByRole('button', { name: /Gerenciar/ }).first().scrollIntoViewIfNeeded();
      await productDialog.getByRole('button', { name: /Gerenciar/ }).first().click();
      const categoryDialog = page.getByRole('dialog').last();
      await categoryDialog.getByRole('heading', { name: 'Gerenciar Categorias' }).waitFor();
      await page.screenshot({ path: path.join(__dirname, `screenshots/stock-category-${viewport.width}.png`), fullPage: true });
      const metrics = await categoryDialog.evaluate(element => ({
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      }));
      results.push({ viewport, metrics, errors });
      if (metrics.top < -1 || metrics.bottom > metrics.viewportHeight + 1) throw new Error(`Modal fora da tela: ${JSON.stringify(metrics)}`);
      if (metrics.documentWidth > metrics.viewportWidth + 2) throw new Error(`Overflow horizontal: ${JSON.stringify(metrics)}`);
      if (errors.length) throw new Error(`Erros JS: ${errors.join('; ')}`);
      await categoryDialog.getByRole('button', { name: 'Fechar' }).click();
      await productDialog.getByRole('button', { name: 'Fechar' }).click();
      const testRow = page.locator('tbody tr').filter({ hasText: 'Produto Teste Foto Cloudinary' }).first();
      await testRow.getByTitle('Editar').click();
      const editDialog = page.getByRole('dialog').first();
      await editDialog.getByRole('heading', { name: 'Editar Produto' }).waitFor();
      await editDialog.getByText('Foto do produto', { exact: true }).waitFor();
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
