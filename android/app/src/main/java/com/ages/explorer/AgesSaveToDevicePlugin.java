package com.ages.explorer;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.Transformer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * AGES save-to-device module (Android).
 *
 * Saves a recording file (video or image) from the app's cache directory into
 * the system MediaStore — the Movies or Pictures collection — so evidence
 * captured during a field investigation with no cell service is kept somewhere
 * the user can actually find it (the Gallery / Photos app) and uploaded to the
 * Journal later.
 *
 * Registration: MainActivity registers this class before super.onCreate().
 * The web side (src/lib/saveToDevice.js) calls it by jsName "AgesSaveToDevice".
 *
 * Uses scoped storage (API 29+): the file is inserted into MediaStore with a
 * relative path under Movies/AGES, Pictures/AGES, or Music/AGES, so no
 * WRITE_EXTERNAL_STORAGE permission is needed on modern devices. Android
 * recordings are prepared as validated MP4/AAC before device saves.
 */
@CapacitorPlugin(
    name = "AgesSaveToDevice",
    permissions = {
        @Permission(alias = "legacyStorage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
@UnstableApi
public class AgesSaveToDevicePlugin extends Plugin {
    private static final String TAG = "AgesSaveToDevice";
    private static final long DURATION_TOLERANCE_MS = 750L;
    private static final int MAX_DURATION_SCAN_SAMPLES = 100000;
    private static final long MAX_UNSEEKABLE_PREFIX_BYTES = 64L * 1024L * 1024L;

    @PluginMethod
    public void getSaveInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("androidApi", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    private JSObject saveDiagnostics(String stage) {
        JSObject data = new JSObject();
        data.put("androidApi", Build.VERSION.SDK_INT);
        data.put("stage", stage);
        return data;
    }

    private void addMediaMetrics(JSObject data, String prefix, MediaInfo info, File file) {
        if (info.durationMs > 0) data.put(prefix + "DurationMs", info.durationMs);
        data.put(prefix + "Bytes", file.length());
        data.put(prefix + "HasAudio", info.hasAudio);
        data.put(prefix + "HasVideo", info.hasVideo);
        data.put(prefix + "HasAacAudio", info.hasAacAudio);
        data.put(prefix + "HasH264Video", info.hasH264Video);
    }

    @PermissionCallback
    private void legacyStoragePermissionCallback(PluginCall call) {
        if (getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            call.reject("Storage permission was denied. Allow storage access in app settings to save to the Gallery.");
            return;
        }
        saveMedia(call);
    }

    @PluginMethod
    public void prepareMedia(PluginCall call) {
        String filePath = call.getString("filePath");
        String mediaType = call.getString("mediaType");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("The recording file is missing.", "recording_export_failed");
            return;
        }
        boolean audioOnly = "audio".equals(mediaType);
        if (!audioOnly && !"video".equals(mediaType)) {
            call.reject("Only audio and video recordings can be prepared.", "recording_export_failed");
            return;
        }

        File source = fileFromPath(filePath);
        if (!source.isFile() || source.length() <= 0) {
            call.reject("The recording file could not be found or is empty.", "recording_export_failed");
            return;
        }
        Double trimSeconds = call.getDouble("trimSeconds");
        if (trimSeconds != null && (!Double.isFinite(trimSeconds) || trimSeconds < 0)) {
            call.reject("The selected trim duration is invalid. The original recording is unchanged.", "recording_export_failed");
            return;
        }
        long trimMs = trimSeconds == null || trimSeconds <= 0
                ? 0L
                : trimSeconds >= Long.MAX_VALUE / 1000.0
                        ? Long.MAX_VALUE
                        : Math.max(1L, Math.round(trimSeconds * 1000.0));

        final long requestedTrimMs = trimMs;
        final JSObject diagnostics = saveDiagnostics("inspection");
        String suppliedTrimMode = call.getString("trimMode");
        String trimMode = "brief".equals(suppliedTrimMode) || "standard".equals(suppliedTrimMode)
                || "full".equals(suppliedTrimMode) ? suppliedTrimMode : "unknown";
        diagnostics.put("trimMode", trimMode);
        diagnostics.put("requestedTrimMs", requestedTrimMs);
        if (("brief".equals(trimMode) && (trimSeconds == null || trimSeconds != 30.0))
                || ("standard".equals(trimMode) && (trimSeconds == null || trimSeconds != 90.0))
                || ("full".equals(trimMode) && requestedTrimMs != 0)) {
            diagnostics.put("stage", "trimIntent");
            call.reject("The selected trim duration is invalid. The original recording is unchanged.", "recording_export_failed", diagnostics);
            return;
        }
        final File cacheDirectory = getContext().getCacheDir();
        final Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            try {
                // Full exports need readable tracks, not exact source duration.
                // Trims still require the existing corroborated timeline evidence.
                MediaInfo sourceInfo = inspectMedia(source, "source", requestedTrimMs > 0);
                addMediaMetrics(diagnostics, "source", sourceInfo, source);
                if (audioOnly && !sourceInfo.hasAudio) {
                    throw new MediaPreparationException("This recording has no readable audio track. The original is unchanged.");
                }
                if (!audioOnly && !sourceInfo.hasVideo) {
                    throw new MediaPreparationException("This recording has no readable video track. The original is unchanged.");
                }

                long expectedDurationMs = requestedTrimMs > 0
                        ? Math.min(requestedTrimMs, sourceInfo.durationMs)
                        : sourceInfo.durationMs;
                long startMs = Math.max(0L, sourceInfo.durationMs - expectedDurationMs);
                if (expectedDurationMs > 0) diagnostics.put("expectedDurationMs", expectedDurationMs);
                if (requestedTrimMs > 0) {
                    diagnostics.put("requestedStartMs", startMs);
                    diagnostics.put("requestedEndMs", sourceInfo.durationMs);
                }
                Log.i(TAG, "Preparation: audioOnly=" + audioOnly + " requestedTrimMs=" + requestedTrimMs
                        + " clip=" + (requestedTrimMs > 0) + " startMs=" + startMs
                        + " endMs=" + sourceInfo.durationMs + " expectedDurationMs=" + expectedDurationMs);
                if (requestedTrimMs > 0 && startMs > 0 && source.getName().endsWith(".webm")) {
                    double estimatedPrefixBytes = source.length() * (startMs / (double) sourceInfo.durationMs);
                    if (estimatedPrefixBytes > MAX_UNSEEKABLE_PREFIX_BYTES) {
                        throw new MediaPreparationException("This WebM trim is too large to process safely on this device. The original is unchanged. Try a shorter recording.");
                    }
                }
                String extension = audioOnly ? "m4a" : "mp4";
                File output = new File(cacheDirectory, "ages_export_" + java.util.UUID.randomUUID() + "." + extension);
                mainHandler.post(() -> startMediaTransformation(
                        call, source, output, sourceInfo, audioOnly, requestedTrimMs > 0,
                        startMs, sourceInfo.durationMs, expectedDurationMs, mainHandler, diagnostics));
            } catch (Exception error) {
                Log.e(TAG, "Could not inspect the Android recording before export.");
                String message = error instanceof MediaPreparationException
                        ? error.getMessage()
                        : "Android could not read this recording's duration or media tracks. The original is unchanged. Try again with a shorter recording.";
                mainHandler.post(() -> call.reject(message, "recording_export_failed", diagnostics));
            }
        }, "ages-media-inspection").start();
    }

    private File fileFromPath(String filePath) {
        if (filePath.startsWith("file://")) {
            String decodedPath = Uri.parse(filePath).getPath();
            if (decodedPath != null) return new File(decodedPath);
        }
        return new File(filePath);
    }

    private void startMediaTransformation(
            PluginCall call,
            File source,
            File output,
            MediaInfo sourceInfo,
            boolean audioOnly,
            boolean trimRequested,
            long startMs,
            long endMs,
            long expectedDurationMs,
            Handler mainHandler,
            JSObject diagnostics
    ) {
        try {
            diagnostics.put("stage", "transformation");
            MediaItem.Builder mediaItemBuilder = new MediaItem.Builder().setUri(Uri.fromFile(source));
            if (trimRequested) {
                MediaItem.ClippingConfiguration.Builder clippingBuilder = new MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs(startMs)
                        .setEndPositionMs(endMs);
                if (startMs > 0) clippingBuilder.setAllowUnseekableMedia(true);
                mediaItemBuilder.setClippingConfiguration(clippingBuilder.build());
            }

            EditedMediaItem editedMediaItem = new EditedMediaItem.Builder(mediaItemBuilder.build())
                    .setRemoveVideo(audioOnly)
                    .build();
            Transformer transformer = new Transformer.Builder(getContext())
                    .setVideoMimeType(MimeTypes.VIDEO_H264)
                    .setAudioMimeType(MimeTypes.AUDIO_AAC)
                    .addListener(new Transformer.Listener() {
                        @Override
                        public void onCompleted(Composition composition, ExportResult exportResult) {
                            Log.i(TAG, "Media3 approximateDurationMs=" + (exportResult.approximateDurationMs >= 0
                                    ? Long.toString(exportResult.approximateDurationMs) : "unset"));
                            validateAndResolvePreparedMedia(
                                    call, output, audioOnly, sourceInfo.hasAudio,
                                    expectedDurationMs, trimRequested, mainHandler, diagnostics);
                        }

                        @Override
                        public void onError(Composition composition, ExportResult exportResult, ExportException exception) {
                            Log.e(TAG, "Media3 could not convert the Android recording.");
                            output.delete();
                            diagnostics.put("exportErrorCode", exception.errorCode);
                            call.reject("Android could not convert this recording. Your original is unchanged. Try again with a shorter recording.", "recording_export_failed", diagnostics);
                        }
                    })
                    .build();
            transformer.start(editedMediaItem, output.getAbsolutePath());
        } catch (Exception error) {
            Log.e(TAG, "Could not start the Android media export.");
            output.delete();
            call.reject("Android could not start the recording export. Your original is unchanged. Try again.", "recording_export_failed", diagnostics);
        }
    }

    private void validateAndResolvePreparedMedia(
            PluginCall call,
            File output,
            boolean audioOnly,
            boolean sourceHadAudio,
            long expectedDurationMs,
            boolean trimRequested,
            Handler mainHandler,
            JSObject diagnostics
    ) {
        new Thread(() -> {
            try {
                diagnostics.put("stage", "validation");
                diagnostics.put("outputBytes", output.length());
                if (!output.isFile() || output.length() <= 0 || !hasMp4FileTypeBox(output)) {
                    throw new MediaPreparationException("Android did not produce a valid MP4 file. The original is unchanged. Try again.");
                }

                MediaInfo outputInfo = inspectMedia(output, "output", trimRequested);
                addMediaMetrics(diagnostics, "output", outputInfo, output);
                if (outputInfo.durationMs <= 0) {
                    throw new MediaPreparationException("Android could not verify a positive export duration. The original is unchanged. Try again.");
                }
                if (audioOnly) {
                    if (!outputInfo.hasAudio || outputInfo.hasVideo || !outputInfo.hasAacAudio) {
                        throw new MediaPreparationException("The audio export did not contain a valid AAC track. The original is unchanged. Try again.");
                    }
                } else if (!outputInfo.hasVideo || !outputInfo.hasH264Video
                        || (sourceHadAudio && (!outputInfo.hasAudio || !outputInfo.hasAacAudio))) {
                    throw new MediaPreparationException("The video export did not contain the expected MP4 tracks. The original is unchanged. Try again.");
                }

                // The exported clip's own container duration is its exact length; the
                // sample timeline is the fallback when the container states none.
                // Preferring the container keeps a clipped export honest whether the
                // converter rebases timestamps to zero or keeps the original offset.
                long measuredDurationMs = outputInfo.declaredDurationMs > 0
                        ? outputInfo.declaredDurationMs
                        : outputInfo.durationMs;
                diagnostics.put("comparisonDurationMs", measuredDurationMs);
                if (expectedDurationMs > 0) {
                    diagnostics.put("durationDifferenceMs", measuredDurationMs - expectedDurationMs);
                }
                if (trimRequested) diagnostics.put("durationToleranceMs", DURATION_TOLERANCE_MS);
                Log.i(TAG, "Validation: expectedDurationMs=" + expectedDurationMs
                        + " measuredDurationMs=" + measuredDurationMs
                        + " outputDurationMs=" + outputInfo.durationMs + " outputBytes=" + output.length()
                        + " deltaMs=" + (measuredDurationMs - expectedDurationMs));
                if (trimRequested && Math.abs(measuredDurationMs - expectedDurationMs) > DURATION_TOLERANCE_MS) {
                    throw new MediaPreparationException("The prepared clip did not match its expected duration. The original is unchanged. Try again with a shorter recording.");
                }

                JSObject result = new JSObject();
                result.put("filePath", Uri.fromFile(output).toString());
                result.put("mimeType", audioOnly ? "audio/mp4" : "video/mp4");
                result.put("durationMs", outputInfo.durationMs);
                result.put("diagnostics", diagnostics);
                mainHandler.post(() -> call.resolve(result));
            } catch (Exception error) {
                Log.e(TAG, "The Android media export failed validation.");
                output.delete();
                String message = error instanceof MediaPreparationException
                        ? error.getMessage()
                        : "Android could not verify the exported recording. The original is unchanged. Try again with a shorter recording.";
                mainHandler.post(() -> call.reject(message, "recording_export_failed", diagnostics));
            }
        }, "ages-media-validation").start();
    }

    private MediaInfo inspectMedia(File file, String stage, boolean requireExactDuration) throws Exception {
        long containerDurationMs = readMetadataDurationMs(file);
        boolean hasAudio = false;
        boolean hasVideo = false;
        boolean hasAacAudio = false;
        boolean hasH264Video = false;
        List<TrackTimeline> tracks = new ArrayList<>();
        long durationMs;
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(file.getAbsolutePath());
            int trackCount = extractor.getTrackCount();
            if (trackCount > 32) throw durationEvidenceError();
            for (int i = 0; i < trackCount; i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null) continue;
                boolean audioTrack = mime.startsWith("audio/");
                boolean videoTrack = mime.startsWith("video/");
                if (audioTrack || videoTrack) {
                    extractor.selectTrack(i);
                    long declaredDurationUs = format.containsKey(MediaFormat.KEY_DURATION)
                            ? format.getLong(MediaFormat.KEY_DURATION) : 0L;
                    tracks.add(new TrackTimeline(i, mime, declaredDurationUs));
                }
                if (audioTrack) {
                    hasAudio = true;
                    hasAacAudio |= MediaFormat.MIMETYPE_AUDIO_AAC.equals(mime);
                } else if (videoTrack) {
                    hasVideo = true;
                    hasH264Video |= MediaFormat.MIMETYPE_VIDEO_AVC.equals(mime);
                }
            }

            if (!hasAudio && !hasVideo) {
                throw new MediaPreparationException("The recording has no readable audio or video tracks. The original is unchanged.");
            }
            Log.i(TAG, stage + ": containerDurationMs=" + containerDurationMs + " bytes=" + file.length());
            durationMs = Math.max(0L, containerDurationMs);
            if (requireExactDuration) {
                scanTimelines(extractor, tracks);
                for (TrackTimeline track : tracks) {
                    Log.i(TAG, stage + ": track=" + track.index + " mime=" + track.mime
                            + " declaredDurationUs=" + track.declaredDurationUs + " samples=" + track.sampleCount
                            + " firstPtsUs=" + track.firstPtsUs + " lastPtsUs=" + track.lastPtsUs
                            + " maxForwardGapUs=" + track.maxForwardGapUs);
                }
                durationMs = resolveDurationMs(containerDurationMs, tracks, stage);
            }
        } catch (MediaPreparationException error) {
            throw error;
        } catch (Exception error) {
            throw new MediaPreparationException("The recording could not be read on this Android device. The original is unchanged. Try again with a shorter recording.", error);
        } finally {
            extractor.release();
        }

        return new MediaInfo(durationMs, containerDurationMs, hasAudio, hasVideo, hasAacAudio, hasH264Video);
    }

    private long readMetadataDurationMs(File file) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(file.getAbsolutePath());
            String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (duration != null) return Long.parseLong(duration);
        } catch (RuntimeException ignored) {
            // Some WebM recordings omit duration metadata. MediaExtractor below
            // can provide a track duration or a bounded sample scan instead.
        } finally {
            try {
                retriever.release();
            } catch (java.io.IOException | RuntimeException ignored) {
                // Keep the original metadata result if release fails.
            }
        }
        return 0L;
    }

    private void scanTimelines(MediaExtractor extractor, List<TrackTimeline> tracks) throws MediaPreparationException {
        int sampleCount = 0;
        while (extractor.getSampleTime() >= 0) {
            if (++sampleCount > MAX_DURATION_SCAN_SAMPLES) {
                throw new MediaPreparationException("This recording is too long to inspect safely on this device. The original is unchanged. Try a shorter recording.");
            }
            int trackIndex = extractor.getSampleTrackIndex();
            for (TrackTimeline track : tracks) {
                if (track.index == trackIndex) {
                    track.addSample(extractor.getSampleTime());
                    break;
                }
            }
            if (!extractor.advance()) break;
        }
    }

    private long resolveDurationMs(long containerMs, List<TrackTimeline> tracks, String stage)
            throws MediaPreparationException {
        long resolvedMs = 0L;
        for (TrackTimeline track : tracks) {
            // A track can only be measured if its scan produced a real span: at least
            // two samples, ending after it starts. Anything less is not evidence, and
            // one unmeasurable track does not invalidate the others.
            if (track.sampleCount < 2 || track.lastPtsUs <= track.firstPtsUs) {
                Log.w(TAG, stage + ": track=" + track.index + " skipped, no usable sample span (samples="
                        + track.sampleCount + " firstPtsUs=" + track.firstPtsUs + " lastPtsUs=" + track.lastPtsUs + ")");
                continue;
            }
            if (track.maxForwardGapUs > DURATION_TOLERANCE_MS * 1000L) {
                // A phone recorder that stalls, or a low-rate stream, leaves gaps. The
                // last sample still marks the end of the track, and the converted clip
                // is measured against the duration resolved here afterwards, so a gap
                // is recorded rather than treated as a corrupt file.
                Log.w(TAG, stage + ": track=" + track.index + " is sparse (maxForwardGapUs="
                        + track.maxForwardGapUs + "); using its sample timeline");
            }
            long timelineMs = track.lastPtsUs / 1000L;
            long declaredMs = track.declaredDurationUs / 1000L;
            long supportedMs;
            if (declaredMs > 0 && Math.abs(declaredMs - timelineMs) <= DURATION_TOLERANCE_MS) {
                supportedMs = declaredMs;
            } else {
                // No usable declared duration, or one that contradicts the samples. A
                // phone recording is written live, so the file often states no duration
                // at all; the last sample's position is then the only duration evidence
                // that exists. It can understate the track by a single frame, which the
                // post-conversion check absorbs.
                if (declaredMs > 0) {
                    Log.w(TAG, stage + ": track=" + track.index + " declaredDurationMs=" + declaredMs
                            + " contradicts its sample timeline " + timelineMs + "ms; using the timeline");
                }
                supportedMs = timelineMs;
            }
            resolvedMs = Math.max(resolvedMs, supportedMs);
        }
        // Nothing in the file could be measured, so its length cannot be trusted and
        // the original is kept untouched for a retry.
        if (resolvedMs <= 0) throw durationEvidenceError();
        if (containerMs > 0 && Math.abs(containerMs - resolvedMs) > DURATION_TOLERANCE_MS) {
            // The container header is advisory: on live recordings it is often absent,
            // stale, or clipped. The sample-backed length above wins, and the converted
            // clip is measured against it afterwards.
            Log.w(TAG, stage + ": containerDurationMs=" + containerMs + " disagrees with the sample-backed "
                    + resolvedMs + "ms; using the sample-backed duration");
        }
        Log.i(TAG, stage + ": resolvedDurationMs=" + resolvedMs + " containerDurationMs=" + containerMs);
        return resolvedMs;
    }

    private MediaPreparationException durationEvidenceError() {
        return new MediaPreparationException("Android could not reconcile this recording's duration metadata and sample timeline. The original is unchanged. Try again with a shorter recording.");
    }

    private static final class TrackTimeline {
        final int index;
        final String mime;
        final long declaredDurationUs;
        long firstPtsUs = Long.MAX_VALUE;
        long lastPtsUs = -1L;
        long maxForwardGapUs = 0L;
        int sampleCount = 0;

        TrackTimeline(int index, String mime, long declaredDurationUs) {
            this.index = index;
            this.mime = mime;
            this.declaredDurationUs = declaredDurationUs;
        }

        void addSample(long ptsUs) {
            // Keep presentation bounds despite small decode-order reordering.
            if (sampleCount > 0 && ptsUs > lastPtsUs) {
                maxForwardGapUs = Math.max(maxForwardGapUs, ptsUs - lastPtsUs);
            }
            firstPtsUs = Math.min(firstPtsUs, ptsUs);
            lastPtsUs = Math.max(lastPtsUs, ptsUs);
            sampleCount++;
        }
    }

    private boolean hasMp4FileTypeBox(File file) throws java.io.IOException {
        byte[] header = new byte[8];
        int totalRead = 0;
        try (InputStream input = new FileInputStream(file)) {
            while (totalRead < header.length) {
                int read = input.read(header, totalRead, header.length - totalRead);
                if (read < 0) break;
                totalRead += read;
            }
        }
        return totalRead == header.length
                && header[4] == 'f' && header[5] == 't' && header[6] == 'y' && header[7] == 'p';
    }

    private static final class MediaInfo {
        final long durationMs;
        final long declaredDurationMs;
        final boolean hasAudio;
        final boolean hasVideo;
        final boolean hasAacAudio;
        final boolean hasH264Video;

        MediaInfo(long durationMs, long declaredDurationMs, boolean hasAudio, boolean hasVideo, boolean hasAacAudio, boolean hasH264Video) {
            this.durationMs = durationMs;
            this.declaredDurationMs = declaredDurationMs;
            this.hasAudio = hasAudio;
            this.hasVideo = hasVideo;
            this.hasAacAudio = hasAacAudio;
            this.hasH264Video = hasH264Video;
        }
    }

    private static final class MediaPreparationException extends Exception {
        MediaPreparationException(String message) {
            super(message);
        }

        MediaPreparationException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    @PluginMethod
    public void saveMedia(PluginCall call) {
        // Only API 24–28 needs a runtime write grant; API 29+ keeps scoped storage.
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyStorage", call, "legacyStoragePermissionCallback");
            return;
        }

        String filePath = call.getString("filePath");
        String mediaType = call.getString("mediaType");
        String displayName = call.getString("displayName");

        if (filePath == null) {
            call.reject("filePath is required");
            return;
        }
        if (displayName == null) {
            displayName = "AGES_" + System.currentTimeMillis();
        }

        File file;
        if (filePath.startsWith("file://")) {
            file = new File(Uri.parse(filePath).getPath());
        } else {
            file = new File(filePath);
        }

        if (!file.exists()) {
            call.reject("The staged recording could not be found. Your original is unchanged. Try again.", "media_store_failed", saveDiagnostics("mediaStore"));
            return;
        }

        boolean isImage = "image".equals(mediaType);
        boolean isAudio = "audio".equals(mediaType);
        String subDir;
        Uri collection;
        if (isImage) {
            subDir = Environment.DIRECTORY_PICTURES + "/AGES";
            collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        } else if (isAudio) {
            subDir = Environment.DIRECTORY_MUSIC + "/AGES";
            collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        } else {
            subDir = Environment.DIRECTORY_MOVIES + "/AGES";
            collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        }

        // Detect mime type from the file extension for accuracy.
        String mimeType;
        if (displayName.endsWith(".webm")) {
            mimeType = isAudio ? "audio/webm" : (isImage ? "image/webp" : "video/webm");
        } else if (displayName.endsWith(".mp4") || displayName.endsWith(".m4a")) {
            mimeType = isAudio ? "audio/mp4" : (isImage ? "image/jpeg" : "video/mp4");
        } else {
            mimeType = isAudio ? "audio/mp4" : (isImage ? "image/jpeg" : "video/mp4");
        }

        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, displayName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, subDir);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }

            uri = resolver.insert(collection, values);
            if (uri == null) {
                throw new java.io.IOException("MediaStore insert returned null");
            }

            try (InputStream in = new FileInputStream(file);
                 OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    throw new java.io.IOException("Could not open MediaStore output stream");
                }
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) > 0) {
                    out.write(buf, 0, len);
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues published = new ContentValues();
                published.put(MediaStore.MediaColumns.IS_PENDING, 0);
                if (resolver.update(uri, published, null, null) != 1) {
                    throw new java.io.IOException("MediaStore did not publish the recording");
                }
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("uri", uri.toString());
            result.put("destination", isAudio ? "music" : "gallery");
            result.put("note", isAudio
                    ? (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? "Saved to Music/AGES." : "Saved to your device's Music collection.")
                    : "Saved to your device's Gallery.");
            call.resolve(result);
        } catch (Exception e) {
            JSObject diagnostics = saveDiagnostics("mediaStore");
            if (uri != null) {
                try {
                    diagnostics.put("partialRowDeleted", resolver.delete(uri, null, null) > 0);
                } catch (Exception cleanupError) {
                    diagnostics.put("partialRowDeleted", false);
                    Log.e(TAG, "Could not remove an incomplete MediaStore row.", cleanupError);
                }
            }
            Log.e(TAG, "Failed to save to MediaStore.", e);
            call.reject("Android could not save the recording to its media collection. Your original is unchanged. Check storage space and try again.", "media_store_failed", diagnostics);
        }
    }
}