import type { Browser } from 'puppeteer-core'

const IS_VERCEL = !!process.env.VERCEL

async function launchBrowser(): Promise<Browser> {
  if (IS_VERCEL) {
    const chromium = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')
    chromium.default.setGraphicsMode = false
    return puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: { width: 1200, height: 1600 },
      executablePath: await chromium.default.executablePath(),
      headless: true,
    })
  }

  const puppeteer = await import('puppeteer')
  return puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Browser
}

export async function generateQuotePDF(
  quoteId: string,
  baseUrl: string,
  cookieHeader?: string | null
): Promise<Buffer> {
  const browser = await launchBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 1600 })

    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader })
    }

    const url = `${baseUrl.replace(/\/$/, '')}/quotes/${quoteId}/preview?pdf=true`
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForSelector('#quote-document', { timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
