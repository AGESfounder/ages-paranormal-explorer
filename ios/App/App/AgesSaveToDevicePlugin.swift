import Foundation
import Capacitor
import Photos
import UIKit
import AVFoundation

// One local export prepares the complete recording (or its final N seconds).
// The web layer uses that exact finished file for preview, Journal and Photos.
@objc(AgesSaveToDevicePlugin)
public class AgesSaveToDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgesSaveToDevicePlugin"
    public let jsName = "AgesSaveToDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareMedia", returnType: CAPPluginReturnPromise)
    ]

    private func inputURL(_ call: CAPPluginCall) -> URL? {
        guard let path = call.getString("filePath") else {
            call.reject("The recording file is missing.")
            return nil
        }
        let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
        guard let url = url, FileManager.default.fileExists(atPath: url.path) else {
            call.reject("The recording file could not be found.")
            return nil
        }
        return url
    }

    @objc func prepareMedia(_ call: CAPPluginCall) {
        guard let source = inputURL(call) else { return }
        let audioOnly = call.getString("mediaType") == "audio"
        exportRecording(source: source, audioOnly: audioOnly, trimSeconds: call.getDouble("trimSeconds")) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let output):
                    call.resolve(["filePath": output.absoluteString, "mimeType": audioOnly ? "audio/mp4" : "video/mp4"])
                case .failure(let error):
                    call.reject(error.localizedDescription, "recording_export_failed")
                }
            }
        }
    }

    private func exportRecording(source: URL, audioOnly: Bool, trimSeconds: Double?, completion: @escaping (Result<URL, Error>) -> Void) {
        let asset = AVURLAsset(url: source, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        asset.loadValuesAsynchronously(forKeys: ["duration", "tracks"]) {
            var loadError: NSError?
            guard asset.statusOfValue(forKey: "duration", error: &loadError) == .loaded,
                  asset.statusOfValue(forKey: "tracks", error: &loadError) == .loaded else {
                completion(.failure(loadError ?? self.exportError("This recording format could not be read. The original has not been changed.")))
                return
            }
            let duration = CMTimeGetSeconds(asset.duration)
            guard duration.isFinite, duration > 0,
                  !asset.tracks(withMediaType: audioOnly ? .audio : .video).isEmpty else {
                completion(.failure(self.exportError("The recording has no readable media or duration. The original has not been changed.")))
                return
            }
            let preset = audioOnly ? AVAssetExportPresetAppleM4A : AVAssetExportPresetHighestQuality
            let fileType: AVFileType = audioOnly ? .m4a : .mp4
            guard let exporter = AVAssetExportSession(asset: asset, presetName: preset), exporter.supportedFileTypes.contains(fileType) else {
                completion(.failure(self.exportError("This recording cannot be converted on this device. The original has not been changed.")))
                return
            }
            let output = FileManager.default.temporaryDirectory.appendingPathComponent("ages_export_\(UUID().uuidString).\(audioOnly ? "m4a" : "mp4")")
            let kept = trimSeconds.flatMap { $0.isFinite && $0 > 0 ? min(duration, $0) : nil } ?? duration
            exporter.outputURL = output
            exporter.outputFileType = fileType
            exporter.shouldOptimizeForNetworkUse = true
            exporter.timeRange = CMTimeRange(start: CMTime(seconds: max(0, duration - kept), preferredTimescale: 60000), duration: CMTime(seconds: kept, preferredTimescale: 60000))
            exporter.exportAsynchronously {
                guard exporter.status == .completed else {
                    try? FileManager.default.removeItem(at: output)
                    completion(.failure(exporter.error ?? self.exportError("The recording could not be exported. The original has not been changed.")))
                    return
                }
                let finished = AVURLAsset(url: output)
                finished.loadValuesAsynchronously(forKeys: ["duration", "tracks"]) {
                    let actual = CMTimeGetSeconds(finished.duration)
                    guard actual.isFinite, actual > 0, abs(actual - kept) < 0.75,
                          !finished.tracks(withMediaType: audioOnly ? .audio : .video).isEmpty else {
                        try? FileManager.default.removeItem(at: output)
                        completion(.failure(self.exportError("The exported clip did not match its requested duration. The original has not been changed.")))
                        return
                    }
                    completion(.success(output))
                }
            }
        }
    }

    private func exportError(_ message: String) -> NSError {
        NSError(domain: "AGESRecording", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    @objc func saveMedia(_ call: CAPPluginCall) {
        guard let source = inputURL(call) else { return }
        let type = call.getString("mediaType") ?? "video"
        let name = call.getString("displayName") ?? "AGES_\(UUID().uuidString).\(source.pathExtension)"
        if type == "audio" {
            saveToDocuments(source: source, displayName: name, call: call)
        } else if type == "image" {
            saveToPhotos(source: source, image: true, cleanup: false, call: call)
        } else if call.getBool("prepared") == true {
            saveToPhotos(source: source, image: false, cleanup: false, call: call)
        } else {
            exportRecording(source: source, audioOnly: false, trimSeconds: call.getDouble("trimSeconds")) { result in
                switch result {
                case .success(let output): self.saveToPhotos(source: output, image: false, cleanup: true, call: call)
                case .failure:
                    // Rescue the original without falsely changing its format/name.
                    let originalName = URL(fileURLWithPath: name).deletingPathExtension().lastPathComponent + "." + source.pathExtension
                    self.saveToDocuments(source: source, displayName: originalName, call: call)
                }
            }
        }
    }

    private func saveToPhotos(source: URL, image: Bool, cleanup: Bool, call: CAPPluginCall) {
        let save: (PHAuthorizationStatus) -> Void = { status in
            guard status == .authorized || status == .limited else {
                if cleanup { try? FileManager.default.removeItem(at: source) }
                DispatchQueue.main.async { call.reject("Photos access was denied. Allow this app to add photos in Settings, then try again.", "photos_permission_denied") }
                return
            }
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: image ? .photo : .video, fileURL: source, options: nil)
            } completionHandler: { success, error in
                if cleanup { try? FileManager.default.removeItem(at: source) }
                DispatchQueue.main.async {
                    if success { call.resolve(["success": true, "destination": "photos", "note": "Saved to Photos."]) }
                    else { call.reject("Could not save to Photos: \(error?.localizedDescription ?? "unknown error")") }
                }
            }
        }
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if status == .notDetermined { PHPhotoLibrary.requestAuthorization(for: .addOnly, handler: save) }
        else { save(status) }
    }

    private func saveToDocuments(source: URL, displayName: String, call: CAPPluginCall) {
        do {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let safeName = URL(fileURLWithPath: displayName).lastPathComponent
            let destination = docs.appendingPathComponent(safeName)
            if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
            try FileManager.default.copyItem(at: source, to: destination)
            let appName = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "AGES"
            DispatchQueue.main.async { call.resolve(["success": true, "destination": "files", "note": "Saved to Files, under On My iPhone / \(appName), not Photos."]) }
        } catch {
            DispatchQueue.main.async { call.reject("Could not save to Files: \(error.localizedDescription)") }
        }
    }
}