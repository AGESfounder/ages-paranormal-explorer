import Foundation
import QuartzCore
import Capacitor
import CoreMotion

// AGES environment-sensor module (iOS).
//
// Reads the phone's magnetic-field sensor and barometer and hands the web layer one
// combined reading: the field vector in microtesla, the barometric pressure in
// hectopascal, and how far the phone is from rest. The web layer compares each
// channel against its own measured baseline (see src/lib/environmentAnalysis.js) and
// draws it — this module reports raw sensor values and makes no judgement about them.
//
// Registration is automatic: Capacitor discovers any class in the app target that
// conforms to CAPBridgedPlugin, so nothing in AppDelegate changes. The web side
// (src/lib/nativeSensors.js) calls this by jsName "AgesSensors", asks isSupported()
// which of the two sensors the device actually has, and says so on screen rather than
// showing a meter that measures nothing — so devices without a barometer (most iPads)
// and every web build are unaffected.
//
// Honest capability note: the field reading carries a large device-specific offset
// (the phone's own speaker magnet sits beside the sensor), and pressure changes with
// height as well as weather. Both channels are therefore only ever reported as
// departures from the room's own start, never as absolute measurements.
@objc(AgesSensorsPlugin)
public class AgesSensorsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgesSensorsPlugin"
    public let jsName = "AgesSensors"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let motion = CMMotionManager()
    private let altimeter = CMAltimeter()
    private var streaming = false
    private var emitInterval: TimeInterval = 0.1
    private var lastEmit: TimeInterval = 0
    private var lastField: CMMagneticField?
    private var lastPressure: Double?
    private var lastMovement: Double = 0

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve([
            "magnetometer": motion.isMagnetometerAvailable,
            "barometer": CMAltimeter.isRelativeAltitudeAvailable()
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        let fps = call.getDouble("fps") ?? 10
        let interval = 1.0 / max(2.0, min(20.0, fps))
        DispatchQueue.main.async {
            self.emitInterval = interval
            self.lastEmit = 0
            self.streaming = true

            if self.motion.isMagnetometerAvailable {
                self.motion.magnetometerUpdateInterval = interval
                self.motion.startMagnetometerUpdates(to: .main) { [weak self] data, _ in
                    guard let self, let data else { return }
                    self.lastField = data.magneticField
                    self.emit()
                }
            }

            // The phone's own movement is read alongside the sensors: barometric
            // pressure changes with height, so a phone being lifted or carried
            // reports movement, not the room, and the web layer holds that channel.
            if self.motion.isAccelerometerAvailable {
                self.motion.accelerometerUpdateInterval = 0.1
                self.motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
                    guard let self, let acceleration = data?.acceleration else { return }
                    let magnitude = sqrt(acceleration.x * acceleration.x
                        + acceleration.y * acceleration.y
                        + acceleration.z * acceleration.z)
                    self.lastMovement = abs(magnitude - 1.0) * 9.81
                }
            }

            if CMAltimeter.isRelativeAltitudeAvailable() {
                self.altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, _ in
                    guard let self, let data else { return }
                    // CoreMotion reports pressure in kilopascal; the tool works in
                    // hectopascal (millibar), the unit weather and field notes use.
                    self.lastPressure = data.pressure.doubleValue * 10
                    self.emit()
                }
            }

            call.resolve(["running": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.streaming = false
            self.motion.stopMagnetometerUpdates()
            self.motion.stopAccelerometerUpdates()
            self.altimeter.stopRelativeAltitudeUpdates()
            self.lastField = nil
            self.lastPressure = nil
            self.lastMovement = 0
            call.resolve(["running": false])
        }
    }

    // One throttle for both sources, so a slow barometer and a fast magnetometer
    // arrive as a steady stream rather than in bursts.
    private func emit() {
        guard streaming else { return }
        let now = CACurrentMediaTime()
        guard now - lastEmit >= emitInterval else { return }
        lastEmit = now

        var payload: [String: Any] = ["movement": lastMovement]
        if let field = lastField {
            let total = sqrt(field.x * field.x + field.y * field.y + field.z * field.z)
            payload["magnetic"] = ["x": field.x, "y": field.y, "z": field.z, "total": total]
        }
        if let pressure = lastPressure {
            payload["pressure"] = pressure
        }
        notifyListeners("reading", data: payload)
    }
}