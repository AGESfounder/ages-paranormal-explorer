import Foundation
import Capacitor
import ARKit
import UIKit

// AGES depth module.
//
// Reads the iPhone's LiDAR depth sensor through ARKit (sceneDepth) and hands the
// web layer colourised depth frames plus any solid, figure-sized form standing
// out from the background. The web layer draws those frames onto the canvas the
// Anomaly Camera already records, so a depth session saves as evidence through
// exactly the same path as a contrast session — one recording pipeline, both
// methods.
//
// Registration is automatic: Capacitor discovers any class in the app target that
// conforms to CAPBridgedPlugin, so nothing in AppDelegate changes. The web side
// (src/lib/nativeDepth.js) calls this by jsName "AgesDepth" and hides the depth
// method entirely when isSupported() says no, so devices without a depth sensor —
// and every web build — are unaffected.
//
// Honest capability note: depth reads PHYSICAL surfaces. A form it outlines is
// really there in the space (a person, or an object shaped like one), and unlike
// the contrast scan it does not need light, because the LiDAR sensor supplies its
// own.
@objc(AgesDepthPlugin)
public class AgesDepthPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "AgesDepthPlugin"
    public let jsName = "AgesDepth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDetection", returnType: CAPPluginReturnPromise)
    ]

    // The depth map arrives at 256 x 192. Frames go to the web layer a few times a
    // second (a depth scan does not need more) and detection runs on a coarser
    // 4:1 grid.
    private static let gridStep = 4
    // Detection gates. The live gates hold the defaults and are moved at runtime by
    // the web layer's two depth controls (see setDetection): a form must stand this
    // far in front of the background surface to count, and fill at least this much
    // of the frame height. The width and cell gates follow the height gate, so that
    // one slider is the whole size control.
    private var liveProtrusion: Float = 0.35
    private var liveFigureHeight: Double = 0.30
    private var liveFigureWidth: Double = 0.08
    private var liveFigureCells: Int = 10
    // Not wall-wide, and no more than this many forms per frame.
    private static let maxFigureWidth = 0.75
    private static let maxFigures = 4

    private var session: ARSession?
    private var streaming = false
    private var interval: TimeInterval = 1.0 / 8.0
    private var lastSent: TimeInterval = 0
    private let renderQueue = DispatchQueue(label: "com.ages.explorer.depth")

    // ── Plugin API ──────────────────────────────────────────────────────────

    // Both depth gates, set from the web layer's depth controls. Clamped here as
    // well as there, so a stray value can never switch detection off or flood it.
    // The height gate is the size control: the width and cell gates follow it, and
    // the wall-wide cap above stays fixed. Applies to the next frame.
    @objc func setDetection(_ call: CAPPluginCall) {
        if let protrusion = call.getDouble("protrusion") {
            liveProtrusion = Float(min(1.5, max(0.05, protrusion)))
        }
        if let minHeight = call.getDouble("minHeight") {
            liveFigureHeight = min(0.8, max(0.12, minHeight))
            let scale = liveFigureHeight / 0.30
            liveFigureWidth = 0.08 * scale
            liveFigureCells = max(4, Int((10.0 * scale).rounded()))
        }
        call.resolve([
            "protrusion": Double(liveProtrusion),
            "minHeight": liveFigureHeight
        ])
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.resolve(["supported": false, "detail": "This device does not support ARKit world tracking."])
            return
        }
        let supported = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        call.resolve([
            "supported": supported,
            "detail": supported ? "" : "This device has no LiDAR depth sensor."
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        let fps = call.getDouble("fps") ?? 8
        interval = 1.0 / max(2.0, min(15.0, fps))
        DispatchQueue.main.async {
            guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else {
                call.reject("This device has no depth sensor.")
                return
            }
            let session = self.session ?? ARSession()
            session.delegate = self
            self.session = session
            let config = ARWorldTrackingConfiguration()
            // Raw scene depth: responsive enough for a live outline. ARKit raises
            // the camera permission prompt on first run — the same prompt the
            // contrast camera already uses.
            config.frameSemantics = [.sceneDepth]
            self.streaming = true
            self.lastSent = 0
            session.run(config, options: [.resetTracking, .removeExistingAnchors])
            call.resolve(["running": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.streaming = false
            self.session?.pause()
            self.session = nil
            call.resolve(["running": false])
        }
    }

    // ── Session delegate ────────────────────────────────────────────────────

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard streaming else { return }
        let stamp = frame.timestamp
        guard stamp - lastSent >= interval else { return }
        lastSent = stamp
        guard let sceneDepth = frame.sceneDepth else { return }
        let depthMap = sceneDepth.depthMap
        let confidence = sceneDepth.confidenceMap
        // Colourising and detection run off the session queue so the camera feed
        // is never held up by them.
        renderQueue.async { [weak self] in
            self?.render(depthMap: depthMap, confidence: confidence)
        }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        streaming = false
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("error", data: ["message": error.localizedDescription])
        }
    }

    // ── Frame rendering and detection ───────────────────────────────────────

    private func render(depthMap: CVPixelBuffer, confidence: CVPixelBuffer?) {
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }

        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        let rowBytes = CVPixelBufferGetBytesPerRow(depthMap)
        guard width > 0, height > 0, let base = CVPixelBufferGetBaseAddress(depthMap) else { return }

        var confidenceBase: UnsafeMutablePointer<UInt8>? = nil
        var confidenceRowBytes = 0
        if let confidence = confidence {
            CVPixelBufferLockBaseAddress(confidence, .readOnly)
            confidenceBase = CVPixelBufferGetBaseAddress(confidence)?.assumingMemoryBound(to: UInt8.self)
            confidenceRowBytes = CVPixelBufferGetBytesPerRow(confidence)
        }
        defer { if let confidence = confidence { CVPixelBufferUnlockBaseAddress(confidence, .readOnly) } }

        let step = AgesDepthPlugin.gridStep
        let gw = max(1, width / step)
        let gh = max(1, height / step)
        let totalCells = gw * gh

        // ── The coarse grid: which cells hold a usable reading ──
        var cellDepth = [Float](repeating: 0, count: totalCells)
        var cellValid = [Bool](repeating: false, count: totalCells)
        var readable: [Float] = []
        readable.reserveCapacity(totalCells)
        for gy in 0..<gh {
            let y = min(height - 1, gy * step)
            let depthRow = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
            let confidenceRow = confidenceBase?.advanced(by: y * confidenceRowBytes)
            for gx in 0..<gw {
                let x = min(width - 1, gx * step)
                let reading = depthRow[x]
                let usable = reading.isFinite && reading > 0.05 && reading < 8.0
                if !usable { continue }
                // ARKit flagged this reading as low confidence: treat the cell as
                // unknown rather than as background.
                if let confidenceRow = confidenceRow, confidenceRow[x] == 0 { continue }
                let cell = gy * gw + gx
                cellDepth[cell] = reading
                cellValid[cell] = true
                readable.append(reading)
            }
        }

        guard readable.count >= max(12, totalCells / 8) else {
            // Not enough of the room is readable to say anything about it.
            return
        }
        readable.sort()
        let nearest = readable[0]
        // The background surface the room sits behind: the far end of the readable
        // depths, robust to a single odd reading at the extreme.
        let backgroundIndex = min(readable.count - 1, Int(Double(readable.count) * 0.75))
        let background = readable[backgroundIndex]
        let span = max(0.25, background - nearest)

        // ── A form has to stand out in front of that surface ──
        var mask = [Bool](repeating: false, count: totalCells)
        for i in 0..<totalCells where cellValid[i] {
            if cellDepth[i] < background - liveProtrusion { mask[i] = true }
        }

        var visited = [Bool](repeating: false, count: totalCells)
        var figureMask = [Bool](repeating: false, count: totalCells)
        var figures: [[String: Double]] = []
        for start in 0..<totalCells where mask[start] && !visited[start] {
            var cells: [Int] = [start]
            visited[start] = true
            var head = 0
            var minX = start % gw
            var maxX = minX
            var minY = start / gw
            var maxY = minY
            while head < cells.count {
                let index = cells[head]
                head += 1
                let x = index % gw
                let y = index / gw
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
                for neighbour in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] {
                    let nx = neighbour.0
                    let ny = neighbour.1
                    if nx < 0 || ny < 0 || nx >= gw || ny >= gh { continue }
                    let n = ny * gw + nx
                    if mask[n] && !visited[n] {
                        visited[n] = true
                        cells.append(n)
                    }
                }
            }
            let boxWidth = Double(maxX - minX + 1) / Double(gw)
            let boxHeight = Double(maxY - minY + 1) / Double(gh)
            let figureShaped = boxHeight >= liveFigureHeight
                && boxWidth >= liveFigureWidth
                && boxWidth <= AgesDepthPlugin.maxFigureWidth
                && cells.count >= liveFigureCells
            guard figureShaped, figures.count < AgesDepthPlugin.maxFigures else { continue }
            for cell in cells { figureMask[cell] = true }
            figures.append([
                "x": Double(minX) / Double(gw),
                "y": Double(minY) / Double(gh),
                "w": boxWidth,
                "h": boxHeight
            ])
        }

        // ── The colourised depth image: what the investigator sees, and what the
        // recording carries ──
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            let depthRow = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
            let gridRow = (y / step) * gw
            for x in 0..<width {
                let reading = depthRow[x]
                var closeness: Float = 0
                if reading.isFinite && reading > 0.05 && reading < 8.0 {
                    closeness = 1 - min(1, max(0, (reading - nearest) / span))
                }
                var r: Float = 6
                var g: Float = 16
                var b: Float = 26
                if closeness > 0.5 {
                    let t = (closeness - 0.5) / 0.5
                    r = 60 + t * 130
                    g = 190 + t * 65
                    b = 90 + t * 60
                } else {
                    let t = closeness / 0.5
                    r = 6 + t * 54
                    g = 16 + t * 174
                    b = 26 + t * 64
                }
                let cell = gridRow + (x / step)
                if cell < totalCells && figureMask[cell] {
                    // A detected form is lit brighter than its depth alone, so the
                    // recorded image shows the same shape its box marks.
                    r = 200
                    g = 255
                    b = 230
                }
                let offset = (y * width + x) * 4
                pixels[offset] = UInt8(max(0, min(255, r)))
                pixels[offset + 1] = UInt8(max(0, min(255, g)))
                pixels[offset + 2] = UInt8(max(0, min(255, b)))
                pixels[offset + 3] = 255
            }
        }

        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let depthImage = CGImage(
                width: width,
                height: height,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: false,
                intent: .defaultIntent
              ) else { return }

        // The depth map arrives in the sensor's landscape frame, so it is turned
        // upright through a UIImage orientation (the same route Apple's own depth
        // samples take) and scaled up, which keeps the depth cells crisp.
        let scale: CGFloat = 2
        let upright = UIImage(cgImage: depthImage, scale: 1, orientation: imageOrientation())
        let outSize = CGSize(width: upright.size.width * scale, height: upright.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: outSize, format: format)
        let rendered = renderer.image { _ in
            upright.draw(in: CGRect(origin: .zero, size: outSize))
        }
        guard let jpeg = rendered.jpegData(compressionQuality: 0.6) else { return }

        var centerDepth = 0.0
        let centerCell = (gh / 2) * gw + (gw / 2)
        if centerCell < totalCells && cellValid[centerCell] {
            centerDepth = Double(cellDepth[centerCell])
        }

        let payload: [String: Any] = [
            "image": "data:image/jpeg;base64," + jpeg.base64EncodedString(),
            "figures": figures,
            "background": Double(background),
            "nearest": Double(nearest),
            "centerDepth": centerDepth,
            "width": Double(rendered.size.width),
            "height": Double(rendered.size.height)
        ]
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("frame", data: payload)
        }
    }

    // Portrait is the case this tool is used in, and it follows Apple's depth
    // sample convention; the landscape mappings keep the image upright there too.
    private func imageOrientation() -> UIImage.Orientation {
        let orientation = bridge?.viewController?.view.window?.windowScene?.interfaceOrientation
        switch orientation {
        case .portraitUpsideDown: return .left
        case .landscapeLeft: return .up
        case .landscapeRight: return .down
        default: return .right
        }
    }
}