import Foundation
import Capacitor
import Photos
import UIKit

// AGES save-to-device module (iOS).
//
// Saves a recording file (video or image) from the app's cache directory into
// the user's Photo Library (Camera Roll), so evidence captured during a field
// investigation with no cell service is kept somewhere the user can actually
// find it — the Photos app — and uploaded to the Journal later.
//
// Registration: the app-local AgesBridgeViewController (declared in
// AppDelegate.swift) registers one instance of this class with the Capacitor
// bridge in capacitorDidLoad(). The web side (src/lib/saveToDevice.js) calls
// this by jsName "AgesSaveToDevice".
//
// Audio cannot go to the Photo Library (Photos stores no audio assets), so
// audio saves are rejected here and the JS layer falls back to the web-style
// download. The permission prompt ("…add photos to your Photo Library") is
// shown automatically by iOS the first time performChanges runs; the usage
// description is set in Info.plist under NSPhotoLibraryAddUsageDescription.
@objc(AgesSaveToDevicePlugin)
public class AgesSaveToDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgesSaveToDevicePlugin"
    public let jsName = "AgesSaveToDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveMedia", returnType: CAPPluginReturnPromise)
    ]

    @objc func saveMedia(_ call: CAPPluginCall) {
        guard let path = call.getString("filePath") else {
            call.reject("filePath is required")
            return
        }
        let mediaType = call.getString("mediaType") ?? "video"

        // Capacitor Filesystem returns a "file://" URI; accept bare paths too.
        let fileURL: URL
        if path.hasPrefix("file://") {
            guard let parsed = URL(string: path) else {
                call.reject("Invalid file URL")
                return
            }
            fileURL = parsed
        } else {
            fileURL = URL(fileURLWithPath: path)
        }

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            call.reject("File not found at path: \(fileURL.path)")
            return
        }

        // Audio can't go to the Photo Library — save it to the app's Documents
        // directory instead, which is visible in the Files app under the app name
        // (requires UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace in
        // Info.plist).
        if mediaType == "audio" {
            let displayName = call.getString("displayName") ?? "AGES_\(Int(Date().timeIntervalSince1970)).m4a"
            do {
                let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                    ?? FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first!
                let dest = docs.appendingPathComponent(displayName)
                if FileManager.default.fileExists(atPath: dest.path) {
                    try FileManager.default.removeItem(at: dest)
                }
                try FileManager.default.copyItem(at: fileURL, to: dest)
                call.resolve(["success": true])
            } catch {
                call.reject("Could not save audio to Documents: \(error.localizedDescription)")
            }
            return
        }

        PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            if mediaType == "image" {
                request.addResource(with: .photo, fileURL: fileURL, options: nil)
            } else {
                request.addResource(with: .video, fileURL: fileURL, options: nil)
            }
        } completionHandler: { success, error in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["success": true])
                } else {
                    call.reject("Could not save to Photo Library: \(error?.localizedDescription ?? "unknown error")")
                }
            }
        }
    }
}