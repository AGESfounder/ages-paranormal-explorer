import Foundation
import Capacitor
import Photos
import UIKit
import AVFoundation

// AGES save-to-device module (iOS).
//
// Saves a recording file (video or image) from the app's cache directory into
// the user's Photo Library (Camera Roll), so evidence captured during a field
// investigation with no cell service is kept somewhere the user can actually
// find it — the Photos app — and uploaded to the Journal later.
//
// Video transcoding: the in-app recorder may produce webM, which the Photo
// Library cannot play. Before saving, the plugin transcodes the file to MP4
// using AVAssetExportSession — entirely on-device, no network needed. If
// trimSeconds is provided, the export is trimmed to the last N seconds at the
// same time, so the "Brief" and "Standard" save options work on iOS even though
// client-side chunk-based trimming does not (iOS WKWebView delivers one chunk
// at stop, so there are no periodic chunks to filter).
//
// If transcoding fails (unsupported codec, corrupted file), the original file
// is saved to the app's Documents directory instead, which is visible in the
// Files app under the app name.
//
// Audio cannot go to the Photo Library (Photos stores no audio assets), so
// audio saves go to Documents directly.
//
// Registration: the app-local AgesBridgeViewController (declared in
// AppDelegate.swift) registers one instance of this class with the Capacitor
// bridge in capacitorDidLoad(). The web side (src/lib/saveToDevice.js) calls
// this by jsName "AgesSaveToDevice".
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
        let trimSeconds = call.getDouble("trimSeconds")
        let displayName = call.getString("displayName") ?? "AGES_\(Int(Date().timeIntervalSince1970))"

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
        // directory instead, which is visible in the Files app under the app name.
        if mediaType == "audio" {
            saveToDocuments(fileURL: fileURL, displayName: displayName, call: call)
            return
        }

        // Images go straight to Photos — no transcoding needed.
        if mediaType == "image" {
            saveImageToPhotos(fileURL: fileURL, call: call)
            return
        }

        // Video: transcode to MP4 (Photos can't play webM) with optional trim.
        // This runs entirely on-device — no network needed.
        transcodeVideo(fileURL: fileURL, displayName: displayName, trimSeconds: trimSeconds, call: call)
    }

    // ── Video: transcode to MP4 + optional trim, then save to Photos ────────
    private func transcodeVideo(fileURL: URL, displayName: String, trimSeconds: Double?, call: CAPPluginCall) {
        let asset = AVAsset(url: fileURL)

        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
            // Can't create an export session — fall back to Documents.
            saveToDocuments(fileURL: fileURL, displayName: displayName, call: call)
            return
        }

        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("ages_transcode_\(Int(Date().timeIntervalSince1970)).mp4")
        try? FileManager.default.removeItem(at: tempURL)

        exportSession.outputURL = tempURL
        exportSession.outputFileType = .mp4

        // Apply trim if requested — keep the last N seconds. This is the
        // on-device equivalent of the chunk-based trim that works on Android
        // and desktop: iOS WKWebView delivers one chunk at stop, so there are
        // no periodic chunks to filter client-side. The trim happens here
        // instead, during the transcode, with no network.
        if let trim = trimSeconds, trim > 0 {
            let duration = CMTimeGetSeconds(asset.duration)
            if duration > trim {
                let start = duration - trim
                exportSession.timeRange = CMTimeRange(
                    start: CMTime(seconds: start, preferredTimescale: 600),
                    end: CMTime(seconds: duration, preferredTimescale: 600)
                )
            }
        }

        exportSession.exportAsynchronously {
            switch exportSession.status {
            case .completed:
                // Save the transcoded MP4 to Photos.
                self.saveVideoToPhotos(fileURL: tempURL, call: call, cleanup: tempURL)
            default:
                // Transcoding failed (unsupported codec, e.g. VP8 webM that
                // AVAsset cannot read). Fall back to saving the original to
                // Documents so the evidence is not lost.
                try? FileManager.default.removeItem(at: tempURL)
                self.saveToDocuments(fileURL: fileURL, displayName: displayName, call: call)
            }
        }
    }

    // ── Photo Library saves ────────────────────────────────────────────────
    private func saveVideoToPhotos(fileURL: URL, call: CAPPluginCall, cleanup: URL?) {
        PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            request.addResource(with: .video, fileURL: fileURL, options: nil)
        } completionHandler: { success, error in
            if let cleanup = cleanup { try? FileManager.default.removeItem(at: cleanup) }
            DispatchQueue.main.async {
                if success {
                    call.resolve(["success": true])
                } else {
                    call.reject("Could not save to Photo Library: \(error?.localizedDescription ?? "unknown error")")
                }
            }
        }
    }

    private func saveImageToPhotos(fileURL: URL, call: CAPPluginCall) {
        PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            request.addResource(with: .photo, fileURL: fileURL, options: nil)
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

    // ── Documents fallback (visible in the Files app) ──────────────────────
    private func saveToDocuments(fileURL: URL, displayName: String, call: CAPPluginCall) {
        do {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                ?? FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first!
            let dest = docs.appendingPathComponent(displayName)
            if FileManager.default.fileExists(atPath: dest.path) {
                try FileManager.default.removeItem(at: dest)
            }
            try FileManager.default.copyItem(at: fileURL, to: dest)
            call.resolve(["success": true, "note": "Saved to Files app — Photos could not accept this format."])
        } catch {
            call.reject("Could not save: \(error.localizedDescription)")
        }
    }
}