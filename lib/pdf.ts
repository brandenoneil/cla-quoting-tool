import puppeteer from 'puppeteer'

export async function generateQuotePDF(quoteId: string, baseUrl: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 1600 })

    const url = `${baseUrl}/quotes/${quoteId}/preview?pdf=true`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })

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
