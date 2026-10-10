import Foundation
import CoreText
import CoreGraphics

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let destination = URL(fileURLWithPath: CommandLine.arguments[2])
let items = try JSONSerialization.jsonObject(with: Data(contentsOf: source)) as! [[String: Any]]
var result: [[String: Any]] = []
func n(_ value: CGFloat) -> String { String(format: "%.3f", Double(value)) }
for item in items {
    let value = item["text"] as! String
    let size = item["size"] as! Double
    let font = CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: value, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font]))
    var d = ""
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let count = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: count)
        var positions = [CGPoint](repeating: .zero, count: count)
        CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
        let attrs = CTRunGetAttributes(run) as NSDictionary
        let runFont = attrs[kCTFontAttributeName] as! CTFont
        for i in 0..<count {
            var transform = CGAffineTransform(translationX: positions[i].x, y: positions[i].y)
            guard let path = CTFontCreatePathForGlyph(runFont, glyphs[i], &transform) else { continue }
            path.applyWithBlock { pointer in
                let e = pointer.pointee
                switch e.type {
                case .moveToPoint: d += "M\(n(e.points[0].x)),\(n(e.points[0].y))"
                case .addLineToPoint: d += "L\(n(e.points[0].x)),\(n(e.points[0].y))"
                case .addQuadCurveToPoint: d += "Q\(n(e.points[0].x)),\(n(e.points[0].y)) \(n(e.points[1].x)),\(n(e.points[1].y))"
                case .addCurveToPoint: d += "C\(n(e.points[0].x)),\(n(e.points[0].y)) \(n(e.points[1].x)),\(n(e.points[1].y)) \(n(e.points[2].x)),\(n(e.points[2].y))"
                case .closeSubpath: d += "Z"
                @unknown default: break
                }
            }
        }
    }
    result.append(["text": value, "size": size, "path": d, "width": CTLineGetTypographicBounds(line, nil, nil, nil)])
}
try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]).write(to: destination)
