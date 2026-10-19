package com.ages.explorer;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

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
 * relative path under Movies/AGES or Pictures/AGES, so no WRITE_EXTERNAL_STORAGE
 * permission is needed on modern devices. Audio is rejected (the JS layer
 * falls back to the web-style download for audio recordings).
 */
@CapacitorPlugin(
    name = "AgesSaveToDevice",
    permissions = {
        @Permission(alias = "legacyStorage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class AgesSaveToDevicePlugin extends Plugin {

    @PermissionCallback
    private void legacyStoragePermissionCallback(PluginCall call) {
        if (getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            call.reject("Storage permission was denied. Allow storage access in app settings to save to the Gallery.");
            return;
        }
        saveMedia(call);
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