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
        final File cacheDirectory = getContext().getCacheDir();
        final Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            try {
                MediaInfo sourceInfo = inspectMedia(source);
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
                        startMs, sourceInfo.durationMs, expectedDurationMs, mainHandler));
            } catch (Exception error) {
                Log.e(TAG, "Could not inspect the Android recording before export.", error);
                String message = error instanceof MediaPreparationException
                        ? error.getMessage()
                        : "Android could not read this recording's duration or media tracks. The original is unchanged. Try again with a shorter recording.";
                mainHandler.post(() -> call.reject(message, "recording_export_failed"));
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
            Handler mainHandler
    ) {
        try {
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
                            validateAndResolvePreparedMedia(
                                    call, output, audioOnly, sourceInfo.hasAudio,
                                    expectedDurationMs, mainHandler);
                        }

                        @Override
                        public void onError(Composition composition, ExportResult exportResult, ExportException exception) {
                            Log.e(TAG, "Media3 could not convert the Android recording.", exception);
                            output.delete();
                            call.reject("Android could not convert this recording. Your original is unchanged. Try again with a shorter recording.", "recording_export_failed");
                        }
                    })
                    .build();
            transformer.start(editedMediaItem, output.getAbsolutePath());
        } catch (Exception error) {
            Log.e(TAG, "Could not start the Android media export.", error);
            output.delete();
            call.reject("Android could not start the recording export. Your original is unchanged. Try again.", "recording_export_failed");
        }
    }

    private void validateAndResolvePreparedMedia(
            PluginCall call,
            File output,
            boolean audioOnly,
            boolean sourceHadAudio,
            long expectedDurationMs,
            Handler mainHandler
    ) {
        new Thread(() -> {
            try {
                if (!output.isFile() || output.length() <= 0 || !hasMp4FileTypeBox(output)) {
                    throw new MediaPreparationException("Android did not produce a valid MP4 file. The original is unchanged. Try again.");
                }

                MediaInfo outputInfo = inspectMedia(output);
                if (audioOnly) {
                    if (!outputInfo.hasAudio || outputInfo.hasVideo || !outputInfo.hasAacAudio) {
                        throw new MediaPreparationException("The audio export did not contain a valid AAC track. The original is unchanged. Try again.");
                    }
                } else if (!outputInfo.hasVideo || !outputInfo.hasH264Video
                        || (sourceHadAudio && (!outputInfo.hasAudio || !outputInfo.hasAacAudio))) {
                    throw new MediaPreparationException("The video export did not contain the expected MP4 tracks. The original is unchanged. Try again.");
                }

                if (Math.abs(outputInfo.durationMs - expectedDurationMs) > DURATION_TOLERANCE_MS) {
                    throw new MediaPreparationException("The prepared clip did not match its expected duration. The original is unchanged. Try again with a shorter recording.");
                }

                JSObject result = new JSObject();
                result.put("filePath", Uri.fromFile(output).toString());
                result.put("mimeType", audioOnly ? "audio/mp4" : "video/mp4");
                result.put("durationMs", outputInfo.durationMs);
                mainHandler.post(() -> call.resolve(result));
            } catch (Exception error) {
                Log.e(TAG, "The Android media export failed validation.", error);
                output.delete();
                String message = error instanceof MediaPreparationException
                        ? error.getMessage()
                        : "Android could not verify the exported recording. The original is unchanged. Try again with a shorter recording.";
                mainHandler.post(() -> call.reject(message, "recording_export_failed"));
            }
        }, "ages-media-validation").start();
    }

    private MediaInfo inspectMedia(File file) throws Exception {
        long durationMs = readMetadataDurationMs(file);
        boolean hasAudio = false;
        boolean hasVideo = false;
        boolean hasAacAudio = false;
        boolean hasH264Video = false;
        long trackDurationUs = 0L;
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(file.getAbsolutePath());
            int trackCount = extractor.getTrackCount();
            for (int i = 0; i < trackCount; i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null) continue;
                boolean audioTrack = mime.startsWith("audio/");
                boolean videoTrack = mime.startsWith("video/");
                if (audioTrack || videoTrack) {
                    extractor.selectTrack(i);
                    if (format.containsKey(MediaFormat.KEY_DURATION)) {
                        trackDurationUs = Math.max(trackDurationUs, format.getLong(MediaFormat.KEY_DURATION));
                    }
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
            if (durationMs <= 0 && trackDurationUs > 0) durationMs = trackDurationUs / 1000L;
            if (durationMs <= 0) durationMs = scanDurationMs(extractor);
        } catch (MediaPreparationException error) {
            throw error;
        } catch (Exception error) {
            throw new MediaPreparationException("The recording could not be read on this Android device. The original is unchanged. Try again with a shorter recording.", error);
        } finally {
            extractor.release();
        }

        if (durationMs <= 0) {
            throw new MediaPreparationException("Android could not determine the recording duration. The original is unchanged. Try again with a shorter recording.");
        }
        return new MediaInfo(durationMs, hasAudio, hasVideo, hasAacAudio, hasH264Video);
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
            } catch (RuntimeException ignored) {
                // Keep the original metadata result if release fails.
            }
        }
        return 0L;
    }

    private long scanDurationMs(MediaExtractor extractor) throws MediaPreparationException {
        long lastSampleTimeUs = 0L;
        int sampleCount = 0;
        while (extractor.getSampleTime() >= 0) {
            lastSampleTimeUs = Math.max(lastSampleTimeUs, extractor.getSampleTime());
            sampleCount++;
            if (sampleCount > MAX_DURATION_SCAN_SAMPLES) {
                throw new MediaPreparationException("This recording is too long to inspect safely on this device. The original is unchanged. Try a shorter recording.");
            }
            if (!extractor.advance()) break;
        }
        return lastSampleTimeUs / 1000L;
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
        final boolean hasAudio;
        final boolean hasVideo;
        final boolean hasAacAudio;
        final boolean hasH264Video;

        MediaInfo(long durationMs, boolean hasAudio, boolean hasVideo, boolean hasAacAudio, boolean hasH264Video) {
            this.durationMs = durationMs;
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
            call.reject("File not found: " + file.getAbsolutePath());
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

        try {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, displayName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, subDir);
            }

            Uri uri = resolver.insert(collection, values);
            if (uri == null) {
                call.reject("MediaStore insert returned null");
                return;
            }

            try (InputStream in = new FileInputStream(file);
                 OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    call.reject("Could not open output stream for MediaStore URI");
                    return;
                }
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) > 0) {
                    out.write(buf, 0, len);
                }
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to save to MediaStore: " + e.getMessage());
        }
    }
}