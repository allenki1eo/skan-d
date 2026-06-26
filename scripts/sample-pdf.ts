/**
 * Generate a sample TCB-style PDF for testing BaleTrack Pro.
 *
 * Each page contains a grid of fake "TCB" QR codes (URLs pointing to
 * https://tcb.go.tz/bale/<random-id>) so the engine can decode them.
 *
 * Usage: bun run scripts/sample-pdf.ts [pages] [outputPath]
 *   pages defaults to 5, outputPath defaults to /home/z/my-project/download/sample-tcb-dispatch.pdf
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const pages = Number(process.argv[2] || 5)
  const outPath = process.argv[3] || '/home/z/my-project/download/sample-tcb-dispatch.pdf'

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_W = 595.28 // A4
  const PAGE_H = 841.89
  const MARGIN = 40
  const COLS = 3
  const ROWS = 5 // 15 QR codes per page → 5 pages = 75 codes total

  for (let p = 1; p <= pages; p++) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H])

    // Header
    page.drawText('TANZANIA COTTON BOARD — BALE DISPATCH QR SHEET', {
      x: MARGIN,
      y: PAGE_H - 30,
      size: 11,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    })
    page.drawText(`Page ${p} of ${pages}  |  Lot: TCB-2026-W${p}`, {
      x: MARGIN,
      y: PAGE_H - 46,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })

    const gridW = PAGE_W - MARGIN * 2
    const gridH = PAGE_H - 120
    const cellW = gridW / COLS
    const cellH = gridH / ROWS
    const qrSize = Math.min(cellW, cellH) - 30

    for (let i = 0; i < COLS * ROWS; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cellX = MARGIN + col * cellW
      const cellY = PAGE_H - 80 - (row + 1) * cellH
      const qrX = cellX + (cellW - qrSize) / 2
      const qrY = cellY + cellH - qrSize - 4

      const baleId = `TCB-${String(p).padStart(2, '0')}${String(i + 1).padStart(3, '0')}-${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`
      const url = `https://tcb.go.tz/bale/${baleId}?p=${p}&n=${i + 1}`

      // Generate QR as PNG bytes, embed in PDF
      const pngBytes = await QRCode.toBuffer(url, {
        margin: 1,
        width: Math.floor(qrSize),
        errorCorrectionLevel: 'M',
      })
      const img = await pdfDoc.embedPng(pngBytes)
      page.drawImage(img, { x: qrX, y: qrY, width: qrSize, height: qrSize })

      // Caption below QR
      page.drawText(baleId, {
        x: cellX + (cellW - font.widthOfTextAtSize(baleId, 7)) / 2,
        y: cellY + 6,
        size: 7,
        font,
        color: rgb(0.2, 0.2, 0.2),
      })
    }

    // Footer
    page.drawText('Generated sample for BaleTrack Pro demo — not a real TCB document.', {
      x: MARGIN,
      y: 20,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, await pdfDoc.save())
  console.log(`✅ Sample PDF written: ${outPath}`)
  console.log(`   Pages: ${pages}, QR codes per page: ${COLS * ROWS}, total: ${pages * COLS * ROWS}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
