import Foundation
import Capacitor
import ARKit
import UIKit
import AVFoundation
import Vision

// AGES depth module.
//
// Reads the iPhone's LiDAR depth sensor through ARKit (sceneDepth) and hands the
// web layer colourised depth frames plus the FIGURES confirmed in them. A figure is
// a human body pose — found by the phone's own body-pose recognition on the same
// frame's camera image — standing as a form in front of the surface behind it. The
// web layer draws those frames onto the canvas the Anomaly Camera already records,
// so a depth session saves as evidence through exactly the same path as a contrast
// session: one recording pipeline, both methods.
//
// What the pose layer fixes: depth on its own can only say "something is here, and
// it is closer than the wall behind it", which is a chair, a doorway, a cabinet. A
// figure is now reported only when a body pose is confirmed on it, so an outline
// means a person-shaped body and never a piece of furniture. Everything else the
// sensor sees stays what it is — the room's own depth image.
//
// One space for both: the colourised image and every coordinate that comes with it
// are built in the upright space the phone is held in, so a skeleton and its box
// land on the body they belong to in portrait and in landscape alike. The depth
// detection still works on the sensor's own grid, and the rotation between the two
// is written down once, in DisplayTurn.
//
// Registration: the app-local AgesBridgeViewController (declared in
// AppDelegate.swift, instantiated by Main.storyboard) registers one instance of
// this class with the Capacitor bridge in capacitorDidLoad(). CAPBridgedPlugin
// alone is not registration — without that hook the class compiles but the web
// layer's calls fail as "not implemented". The web side
// (src/lib/nativeDepth.js) calls this by jsName "AgesDepth" and hides the depth
// method entirely when isSupported() says no, so devices without a depth sensor —
// and every web build — are unaffected.
//
// Honest capability note: depth reads PHYSICAL surfaces, and a confirmed pose is a
// real person-shaped body in the space. The pose needs some light on the subject:
// in the dark the depth image still shows the room, but no figure can be confirmed.
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
    // the web layer's two depth controls (see setDetection): a figure must stand this
    // far in front of the background surface to count, and fill at least this much of
    // the view height. The width and cell gates follow the height gate, so that one
    // slider is the whole size control. All of them are judged on screen, in display
    // space, so they mean what their controls say in portrait and in landscape alike.
    private var liveProtrusion: Float = 0.35
    private var liveFigureHeight: Double = 0.30
    private var liveFigureWidth: Double = 0.08
    private var liveFigureCells: Int = 10
    // Not view-wide.
    private static let maxFigureWidth = 0.75
    // Never more than this many confirmed figures in one frame.
    private static let maxBodies = 4

    // ── The pose layer ──────────────────────────────────────────────────────
    // The phone's own body-pose recognition, reading the camera image of the SAME
    // frame the depth map came from, so a pose and a depth form can be lined up.
    private static let jointNames: [(VNHumanBodyPoseObservation.JointName, String)] = [
        (.nose, "nose"),
        (.neck, "neck"),
        (.leftShoulder, "lShoulder"), (.rightShoulder, "rShoulder"),
        (.leftElbow, "lElbow"), (.rightElbow, "rElbow"),
        (.leftWrist, "lWrist"), (.rightWrist, "rWrist"),
        (.leftHip, "lHip"), (.rightHip, "rHip"),
        (.leftKnee, "lKnee"), (.rightKnee, "rKnee"),
        (.leftAnkle, "lAnkle"), (.rightAnkle, "rAnkle"),
    ]
    // A joint below this confidence is not reported: a wrong arm is worse than a
    // missing one, and the model finds more than a body ever shows at once.
    private static let jointConfidence: Float = 0.3
    // Poses are read a few times a second, not on every depth frame — the model is
    // far heavier than the depth pass, and a body does not change shape at 8 fps.
    // Between reads the last result is re-reported (see lastBodies), so a figure
    // stays a figure on every frame instead of blinking in and out.
    private static let poseInterval: TimeInterval = 0.3
    private static let poseHold: TimeInterval = 1.0

    private var lastPose: TimeInterval = -1
    private var lastBodies: [Body] = []
    private var lastBodiesAt: TimeInterval = -1

    private var session: ARSession?
    private var streaming = false
    private var interval: TimeInterval = 1.0 / 8.0
    private var lastSent: TimeInterval = 0
    private let renderQueue = DispatchQueue(label: "com.ages.explorer.depth")

    // ── How the sensor's raw frame sits upright on the screen ───────────────
    // One value, used for the colourised image AND for every coordinate that goes
    // with it, so the picture and the outlines over it can never disagree. `right`
    // and `left` are the quarter turns, clockwise and counter-clockwise; they swap
    // the frame's axes.
    private enum DisplayTurn {
        case up, down, left, right

        var visionOrientation: CGImagePropertyOrientation {
            switch self {
            case .up: return .up
            case .down: return .down
            case .left: return .left
            case .right: return .right
            }
        }

        func outputSize(rawWidth: Int, rawHeight: Int) -> (width: Int, height: Int) {
            (self == .left || self == .right) ? (rawHeight, rawWidth) : (rawWidth, rawHeight)
        }

        // The raw pixel a displayed pixel is read from.
        func rawPixel(outputX: Int, outputY: Int, rawWidth: Int, rawHeight: Int) -> (x: Int, y: Int) {
            switch self {
            case .up: return (outputX, outputY)
            case .down: return (rawWidth - 1 - outputX, rawHeight - 1 - outputY)
            case .right: return (outputY, rawHeight - 1 - outputX)
            case .left: return (rawWidth - 1 - outputY, outputX)
            }
        }

        // A point in display space (0-1, top-left origin) back in the depth grid's
        // own space (0-1, top-left origin).
        func rawPoint(x: Double, y: Double) -> (x: Double, y: Double) {
            switch self {
            case .up: return (x, y)
            case .down: return (1 - x, 1 - y)
            case .right: return (y, 1 - x)
            case .left: return (1 - y, x)
            }
        }

        // The other direction: a point in the grid's space as the investigator sees
        // it. Used to judge a depth form's size on screen rather than in the sensor's
        // frame, where a standing figure lies on its side.
        func outputPoint(x: Double, y: Double) -> (x: Double, y: Double) {
            switch self {
            case .up: return (x, y)
            case .down: return (1 - x, 1 - y)
            case .right: return (1 - y, x)
            case .left: return (y, 1 - x)
            }
        }
    }

    // Portrait is the case this tool is used in, and it follows Apple's depth sample
    // convention; the landscape mappings keep the image upright there too.
    private func displayTurn() -> DisplayTurn {
        let orientation = bridge?.viewController?.view.window?.windowScene?.interfaceOrientation
        switch orientation {
        case .portraitUpsideDown: return .left
        case .landscapeLeft: return .up
        case .landscapeRight: return .down
        default: return .right
        }
    }

    // One confirmed body: its box and joints as the investigator sees them (0-1 from
    // the top-left of the frame), and the depth-grid cells it covers, which is how it
    // is checked against the forms the depth pass found.
    private struct Body {
        var x: Double
        var y: Double
        var width: Double
        var height: Double
        var joints: [String: [Double]]
        var cellMinX: Int
        var cellMinY: Int
        var cellMaxX: Int
        var cellMaxY: Int

        var payload: [String: Any] {
            ["x": x, "y": y, "w": width, "h": height, "joints": joints]
        }
    }

    // ── Plugin API ──────────────────────────────────────────────────────────

    // Both depth gates, set from the web layer's depth controls. Clamped here as
    // well as there, so a stray value can never switch detection off or flood it.
    // The height gate is the size control: the width and cell gates follow it, and
    // the view-wide cap above stays fixed. Applies to the next frame.
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
            call.resolve(["supported": false, "detail": "This device does not support ARKit world tracking.", "camera": cameraAuthorization()])
            return
        }
        let supported = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        call.resolve([
            "supported": supported,
            "detail": supported ? "" : "This device has no LiDAR depth sensor.",
            // Additive: the camera permission snapshot, so the web layer can point
            // at Settings instead of guessing when a start goes wrong later.
            "camera": cameraAuthorization()
        ])
    }

    private func cameraAuthorization() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let fps = call.getDouble("fps") ?? 8
        interval = 1.0 / max(2.0, min(15.0, fps))
        DispatchQueue.main.async {
            guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else {
                call.reject("This device has no depth sensor.", "depth_unsupported")
                return
            }
            // A previously refused camera permission never reaches session.run —
            // ARKit would just fail the session asynchronously. Say so directly,
            // with a stable code the web layer maps to a Settings hint.
            let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
            if cameraStatus == .denied || cameraStatus == .restricted {
                call.reject("Camera access is denied. Allow camera access in Settings, then try again.", "camera_permission_denied")
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
            self.lastPose = -1
            self.lastBodies = []
            self.lastBodiesAt = -1
            session.run(config, options: [.resetTracking, .removeExistingAnchors])
            call.resolve(["running": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.streaming = false
            self.session?.pause()
            self.session = nil
            self.lastBodies = []
            self.lastBodiesAt = -1
            call.resolve(["running": false])
        }
    }

    // ── Session delegate ────────────────────────────────────────────────────

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard streaming else { return }
        let stamp = frame.timestamp
        guard stamp - lastSent >= interval else { return }
        lastSent = stamp
        guard frame.sceneDepth != nil else { return }
        // The whole frame is handed over, not just the depth map: the depth map is
        // colourised and the camera image is read for body poses, and both must come
        // from the same frame. ARFrame keeps its own buffers alive while it is held,
        // and the render queue is serial, so one frame is processed at a time.
        renderQueue.async { [weak self] in
            self?.render(frame: frame)
        }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        streaming = false
        // Classify at the native boundary so the web layer never has to guess what
        // an ARKit failure means: camera permission, unsupported hardware or
        // configuration, or a runtime session failure after the session started.
        var code = "arkit_runtime_failure"
        var category = "runtime"
        if let arError = error as? ARError {
            switch arError.code {
            case .cameraUnauthorized:
                code = "camera_permission_denied"
                category = "permission"
            case .sensorUnavailable, .unsupportedConfiguration:
                code = "depth_unsupported"
                category = "unsupported"
            default:
                break
            }
        }
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("error", data: ["code": code, "category": category, "message": error.localizedDescription])
        }
    }

    // ── Frame rendering and detection ───────────────────────────────────────

    private func render(frame: ARFrame) {
        guard let sceneDepth = frame.sceneDepth else { return }
        let depthMap = sceneDepth.depthMap
        let confidence = sceneDepth.confidenceMap
        let display = displayTurn()

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

        // ── Forms standing out in front of that surface ──
        // These are not reported as figures. They are the depth layer's own reading
        // of what comes forward, and a confirmed body has to be sitting on one of
        // them to count — which is what the stand-out distance control decides.
        var mask = [Bool](repeating: false, count: totalCells)
        for i in 0..<totalCells where cellValid[i] {
            if cellDepth[i] < background - liveProtrusion { mask[i] = true }
        }

        var visited = [Bool](repeating: false, count: totalCells)
        var forms: [(minX: Int, minY: Int, maxX: Int, maxY: Int)] = []
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
            // The gates are judged in display space: a standing figure lies across the
            // sensor's own frame, so its "height" there is its width on screen.
            let rawX = Double(minX) / Double(gw)
            let rawY = Double(minY) / Double(gh)
            let rawW = Double(maxX - minX + 1) / Double(gw)
            let rawH = Double(maxY - minY + 1) / Double(gh)
            let cornerA = display.outputPoint(x: rawX, y: rawY)
            let cornerB = display.outputPoint(x: rawX + rawW, y: rawY + rawH)
            let boxW = abs(cornerB.x - cornerA.x)
            let boxH = abs(cornerB.y - cornerA.y)
            let formShaped = boxH >= liveFigureHeight
                && boxW >= liveFigureWidth
                && boxW <= AgesDepthPlugin.maxFigureWidth
                && cells.count >= liveFigureCells
            guard formShaped else { continue }
            forms.append((minX, minY, maxX, maxY))
        }

        // ── Bodies: the pose layer decides what a figure is ──
        // Re-read a few times a second, and re-reported between reads, so a figure
        // stays a figure on every frame. The depth overlap is re-checked every frame
        // against the forms above, because the room can change in between.
        if lastPose < 0 || frame.timestamp - lastPose >= AgesDepthPlugin.poseInterval {
            lastPose = frame.timestamp
            lastBodies = confirmedBodies(frame: frame, display: display, gw: gw, gh: gh)
            lastBodiesAt = frame.timestamp
        }
        let held = (lastBodiesAt >= 0 && frame.timestamp - lastBodiesAt <= AgesDepthPlugin.poseHold) ? lastBodies : []
        let figures = held.filter { body in
            forms.contains { form in
                form.minX <= body.cellMaxX && form.maxX >= body.cellMinX
                    && form.minY <= body.cellMaxY && form.maxY >= body.cellMinY
            }
        }

        // The cells a confirmed figure covers are the cells lit in the image, so the
        // glow in the depth picture is the body the skeleton is drawn on.
        var lit = [Bool](repeating: false, count: totalCells)
        for body in figures {
            guard body.cellMinX <= body.cellMaxX, body.cellMinY <= body.cellMaxY else { continue }
            for gy in max(0, body.cellMinY)...min(gh - 1, body.cellMaxY) {
                for gx in max(0, body.cellMinX)...min(gw - 1, body.cellMaxX) {
                    lit[gy * gw + gx] = true
                }
            }
        }

        // ── The colourised depth image, built directly in display space ──
        // Sampled from the sensor's own frame through DisplayTurn, so the picture and
        // the figure coordinates are the same space by construction.
        let outSize = display.outputSize(rawWidth: width, rawHeight: height)
        let outW = outSize.width
        let outH = outSize.height
        var pixels = [UInt8](repeating: 0, count: outW * outH * 4)
        for oy in 0..<outH {
            for ox in 0..<outW {
                let source = display.rawPixel(outputX: ox, outputY: oy, rawWidth: width, rawHeight: height)
                let x = max(0, min(width - 1, source.x))
                let y = max(0, min(height - 1, source.y))
                let depthRow = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
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
                let cell = (y / step) * gw + (x / step)
                if cell < totalCells && lit[cell] {
                    // A confirmed figure is lit brighter than its depth alone, so the
                    // recorded image shows the same body its skeleton marks.
                    r = 200
                    g = 255
                    b = 230
                }
                let offset = (oy * outW + ox) * 4
                pixels[offset] = UInt8(max(0, min(255, r)))
                pixels[offset + 1] = UInt8(max(0, min(255, g)))
                pixels[offset + 2] = UInt8(max(0, min(255, b)))
                pixels[offset + 3] = 255
            }
        }

        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let depthImage = CGImage(
                width: outW,
                height: outH,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: outW * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: false,
                intent: .defaultIntent
              ) else { return }

        // The image is already upright, so it is only scaled up here, which keeps the
        // depth cells crisp. Nothing is rotated at this point: the rotation is done,
        // once, by the sampling loop above.
        let scale: CGFloat = 2
        let upright = UIImage(cgImage: depthImage, scale: 1, orientation: .up)
        let renderSize = CGSize(width: upright.size.width * scale, height: upright.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: renderSize, format: format)
        let rendered = renderer.image { _ in
            upright.draw(in: CGRect(origin: .zero, size: renderSize))
        }
        guard let jpeg = rendered.jpegData(compressionQuality: 0.6) else { return }

        var centerDepth = 0.0
        let centerCell = (gh / 2) * gw + (gw / 2)
        if centerCell < totalCells && cellValid[centerCell] {
            centerDepth = Double(cellDepth[centerCell])
        }

        let payload: [String: Any] = [
            "image": "data:image/jpeg;base64," + jpeg.base64EncodedString(),
            "figures": figures.map { $0.payload },
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

    // ── Body poses ──────────────────────────────────────────────────────────

    // Reads the camera image for human bodies and returns those that are at least
    // the smallest figure the investigator asked for, with the joints the model
    // actually confirmed. Everything is reported in display space, and the same box
    // is taken back into the depth grid's space so the depth pass can be asked
    // whether that body stands out from the surface behind it.
    private func confirmedBodies(frame: ARFrame, display: DisplayTurn, gw: Int, gh: Int) -> [Body] {
        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(
            cvPixelBuffer: frame.capturedImage,
            orientation: display.visionOrientation,
            options: [:]
        )
        do {
            try handler.perform([request])
        } catch {
            return []
        }
        guard let observations = request.results else { return [] }

        var bodies: [Body] = []
        for observation in observations {
            guard bodies.count < AgesDepthPlugin.maxBodies else { break }
            // Vision measures from the bottom-left of the frame it was handed; the web
            // layer draws from the top-left, which is also how the depth grid is
            // indexed. The flip happens here, once, for every joint.
            let points = (try? observation.recognizedPoints(.all)) ?? [:]
            var joints: [String: [Double]] = [:]
            for (name, key) in AgesDepthPlugin.jointNames {
                guard let point = points[name], point.confidence >= AgesDepthPlugin.jointConfidence else { continue }
                joints[key] = [
                    (Double(point.location.x) * 10000).rounded() / 10000,
                    ((1 - Double(point.location.y)) * 10000).rounded() / 10000,
                ]
            }
            guard !joints.isEmpty else { continue }

            // The body's own extent, taken from the joints that were actually
            // confirmed: the joints are what is measured on the body, so a box built
            // from them is the part of the body really in view.
            var boxX = 1.0
            var boxY = 1.0
            var boxMaxX = 0.0
            var boxMaxY = 0.0
            for joint in joints.values {
                boxX = min(boxX, joint[0])
                boxY = min(boxY, joint[1])
                boxMaxX = max(boxMaxX, joint[0])
                boxMaxY = max(boxMaxY, joint[1])
            }
            let boxW = boxMaxX - boxX
            let boxHeight = boxMaxY - boxY
            // The smallest figure the investigator asked to count.
            guard boxHeight >= liveFigureHeight else { continue }

            let cornerA = display.rawPoint(x: boxX, y: boxY)
            let cornerB = display.rawPoint(x: boxX + boxW, y: boxY + boxHeight)
            let cellMinX = max(0, min(gw - 1, Int((min(cornerA.x, cornerB.x) * Double(gw)).rounded(.down))))
            let cellMaxX = max(0, min(gw - 1, Int((max(cornerA.x, cornerB.x) * Double(gw)).rounded(.down))))
            let cellMinY = max(0, min(gh - 1, Int((min(cornerA.y, cornerB.y) * Double(gh)).rounded(.down))))
            let cellMaxY = max(0, min(gh - 1, Int((max(cornerA.y, cornerB.y) * Double(gh)).rounded(.down))))

            bodies.append(Body(
                x: boxX,
                y: boxY,
                width: boxW,
                height: boxHeight,
                joints: joints,
                cellMinX: cellMinX,
                cellMinY: cellMinY,
                cellMaxX: cellMaxX,
                cellMaxY: cellMaxY
            ))
        }
        return bodies
    }
}