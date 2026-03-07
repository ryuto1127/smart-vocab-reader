import AppKit
import Foundation

let fileManager = FileManager.default
let workingDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let outputDirectory = workingDirectory.appendingPathComponent("assets/icons", isDirectory: true)
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let sizes = [16, 32, 48, 128]

let backgroundColor = NSColor(calibratedRed: 246 / 255, green: 238 / 255, blue: 226 / 255, alpha: 1)
let accentColor = NSColor(calibratedRed: 209 / 255, green: 101 / 255, blue: 41 / 255, alpha: 1)
let strokeColor = NSColor(calibratedRed: 31 / 255, green: 41 / 255, blue: 37 / 255, alpha: 1)
let textColor = strokeColor

func renderIcon(size: Int) -> NSImage {
  let imageSize = NSSize(width: size, height: size)
  let image = NSImage(size: imageSize)
  image.lockFocus()

  let rect = NSRect(origin: .zero, size: imageSize)
  NSColor.clear.setFill()
  rect.fill()

  let inset = CGFloat(size) * 0.06
  let cardRect = rect.insetBy(dx: inset, dy: inset)
  let cornerRadius = CGFloat(size) * 0.2

  let cardPath = NSBezierPath(roundedRect: cardRect, xRadius: cornerRadius, yRadius: cornerRadius)
  backgroundColor.setFill()
  cardPath.fill()

  strokeColor.withAlphaComponent(0.18).setStroke()
  cardPath.lineWidth = max(1, CGFloat(size) * 0.03)
  cardPath.stroke()

  let badgeSize = CGFloat(size) * 0.28
  let badgeRect = NSRect(
    x: cardRect.maxX - badgeSize - CGFloat(size) * 0.08,
    y: cardRect.maxY - badgeSize - CGFloat(size) * 0.08,
    width: badgeSize,
    height: badgeSize
  )
  let badgePath = NSBezierPath(roundedRect: badgeRect, xRadius: badgeSize / 2, yRadius: badgeSize / 2)
  accentColor.setFill()
  badgePath.fill()

  let titleFontSize = CGFloat(size) * 0.46
  let title = NSString(string: "Aa")
  let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: titleFontSize, weight: .bold),
    .foregroundColor: textColor
  ]
  let titleSize = title.size(withAttributes: titleAttributes)
  let titleOrigin = NSPoint(
    x: rect.midX - titleSize.width / 2,
    y: rect.midY - titleSize.height / 2 - CGFloat(size) * 0.05
  )
  title.draw(at: titleOrigin, withAttributes: titleAttributes)

  let lineWidth = CGFloat(size) * 0.48
  let lineHeight = max(1.5, CGFloat(size) * 0.045)
  let lineGap = CGFloat(size) * 0.045
  let firstLineY = cardRect.minY + CGFloat(size) * 0.2

  for index in 0..<2 {
    let lineRect = NSRect(
      x: rect.midX - lineWidth / 2,
      y: firstLineY + CGFloat(index) * (lineHeight + lineGap),
      width: lineWidth,
      height: lineHeight
    )
    let linePath = NSBezierPath(roundedRect: lineRect, xRadius: lineHeight / 2, yRadius: lineHeight / 2)
    strokeColor.withAlphaComponent(index == 0 ? 0.24 : 0.14).setFill()
    linePath.fill()
  }

  image.unlockFocus()
  return image
}

func writePNG(image: NSImage, url: URL) throws {
  guard
    let tiffData = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiffData),
    let pngData = bitmap.representation(using: .png, properties: [:])
  else {
    throw NSError(domain: "IconGeneration", code: 1)
  }

  try pngData.write(to: url)
}

for size in sizes {
  let image = renderIcon(size: size)
  let outputURL = outputDirectory.appendingPathComponent("icon-\(size).png")
  try writePNG(image: image, url: outputURL)
  print("Wrote \(outputURL.path)")
}
