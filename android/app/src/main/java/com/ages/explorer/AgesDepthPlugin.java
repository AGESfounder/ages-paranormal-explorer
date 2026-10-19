package com.ages.explorer;

import android.Manifest;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Surface;
import android.view.ViewGroup;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Session;
import com.google.ar.core.exceptions.NotYetAvailableException;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * AGES depth module (Android).
 *
 * Reads depth through Google Play Services for AR (ARCore) and hands the web layer
 * colourised depth frames plus any solid, figure-sized form standing out from the
 * background. The web layer draws those frames onto the canvas the Anomaly Camera
 * already records, so a depth session saves as evidence through exactly the same
 * path as a contrast session — one recording pipeline, both methods. The plugin's
 * contract (jsName, methods, frame payload) is identical to the iOS module, so
 * src/lib/nativeDepth.js drives both platforms unchanged.
 *
 * ARCore does not need a dedicated depth sensor: on a phone without one it derives
 * depth from the moving camera, which is why it needs a few seconds of the phone
 * being swept across the room before the first trustworthy reading (the plugin
 * simply sends nothing until then, and the web layer says so on screen).
 *
 * Honest capability note: depth reads PHYSICAL surfaces. A form it outlines is
 * really there in the space (a person, or an object shaped like one). Because
 * Android's depth estimation works from the camera image it needs some light.
 */
@CapacitorPlugin(
    name = "AgesDepth",
    permissions = { @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }) }
)
public class AgesDepthPlugin extends Plugin {

    private static final String TAG = "AgesDepth";

    // Detection gates, kept in step with the iOS module. The live gates hold the
    // defaults and are moved at runtime by the web layer's two depth controls (see
    // setDetection); the width and cell gates follow the height gate, so that one
    // slider is the whole size control.
    private static final int GRID_STEP = 4;
    private float liveProtrusion = 0.35f;
    private float liveFigureHeight = 0.30f;
    private float liveFigureWidth = 0.08f;
    private int liveFigureCells = 10;
    // Not wall-wide, and no more than this many forms per frame.
    private static final float MAX_FIGURE_WIDTH = 0.75f;
    private static final int MAX_FIGURES = 4;

    private Session session;
    private GLSurfaceView glView;
    private volatile boolean streaming = false;
    private int targetFps = 8;
    private long lastFrameAt = 0;

    // ── Plugin API ──────────────────────────────────────────────────────────

    /**
     * Both depth gates, set from the web layer's depth controls. Clamped here as
     * well as there, so a stray value can never switch detection off or flood it.
     * The height gate is the size control: the width and cell gates follow it, and
     * the wall-wide cap above stays fixed. Applies to the next frame.
     */
    @PluginMethod
    public void setDetection(PluginCall call) {
        Double protrusion = call.getDouble("protrusion");
        if (protrusion != null) {
            liveProtrusion = (float) Math.min(1.5, Math.max(0.05, protrusion));
        }
        Double minHeight = call.getDouble("minHeight");
        if (minHeight != null) {
            liveFigureHeight = (float) Math.min(0.8, Math.max(0.12, minHeight));
            float scale = liveFigureHeight / 0.30f;
            liveFigureWidth = 0.08f * scale;
            liveFigureCells = Math.max(4, Math.round(10f * scale));
        }
        JSObject result = new JSObject();
        result.put("protrusion", (double) liveProtrusion);
        result.put("minHeight", (double) liveFigureHeight);
        call.resolve(result);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        getActivity().runOnUiThread(() -> resolveSupport(call, 0));
    }

    private void resolveSupport(PluginCall call, int attempt) {
        JSObject result = new JSObject();
        try {
            ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getActivity());
            if (availability == ArCoreApk.Availability.UNKNOWN_CHECKING && attempt < 6) {
                // The first call starts the query; ask again shortly.
                new Handler(Looper.getMainLooper()).postDelayed(() -> resolveSupport(call, attempt + 1), 500);
                return;
            }
            if (!availability.isSupported()) {
                result.put("supported", false);
                result.put("detail", "This device is not supported by Google Play Services for AR.");
            } else if (availability == ArCoreApk.Availability.SUPPORTED_INSTALLED) {
                result.put("supported", true);
                result.put("detail", "");
            } else {
                // The hardware can do it, but the AR service has to be installed
                // first: starting the scan asks for it once.
                result.put("supported", true);
                result.put("detail", "Google Play Services for AR needs installing");
            }
        } catch (Exception e) {
            Log.w(TAG, "Depth support could not be checked", e);
            result.put("supported", false);
            result.put("detail", "Depth support could not be checked.");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }
        beginSession(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            beginSession(call);
        } else {
            call.reject("Camera permission is needed for the depth scan.");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopSession();
            JSObject result = new JSObject();
            result.put("running", false);
            call.resolve(result);
        });
    }

    private void beginSession(PluginCall call) {
        targetFps = Math.max(2, Math.min(15, call.getInt("fps", 8)));
        getActivity().runOnUiThread(() -> {
            try {
                ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getActivity());
                if (availability != ArCoreApk.Availability.SUPPORTED_INSTALLED) {
                    if (availability.isSupported()) {
                        try {
                            ArCoreApk.getInstance().requestInstall(getActivity(), false);
                            call.reject("Follow the prompt to install Google Play Services for AR, then start the depth scan again.");
                        } catch (Exception e) {
                            Log.w(TAG, "AR install prompt failed", e);
                            call.reject("Google Play Services for AR is needed for the depth scan and could not be installed.");
                        }
                    } else {
                        call.reject("Depth Scan is not supported on this device. Choose Contrast Scan or Device Camera.", "depth_unsupported");
                    }
                    return;
                }
                if (session == null) {
                    session = new Session(getActivity());
                }
                if (!session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    stopSession();
                    call.reject("Depth Scan is not supported on this device/camera configuration. Choose Contrast Scan or Device Camera.", "depth_unsupported");
                    return;
                }
                Config config = new Config(session);
                config.setDepthMode(Config.DepthMode.AUTOMATIC);
                session.configure(config);
                session.resume();
                applyDisplayGeometry();
                startSurface();
                streaming = true;
                lastFrameAt = 0;
                JSObject result = new JSObject();
                result.put("running", true);
                call.resolve(result);
            } catch (Exception e) {
                Log.w(TAG, "Depth session could not start", e);
                stopSession();
                call.reject("The depth sensor could not start on this device.");
            }
        });
    }

    private void stopSession() {
        streaming = false;
        if (session != null) {
            try {
                session.pause();
            } catch (Exception ignored) {
            }
            try {
                session.close();
            } catch (Exception ignored) {
            }
            session = null;
        }
        if (glView != null) {
            try {
                glView.onPause();
            } catch (Exception ignored) {
            }
            ViewGroup parent = (ViewGroup) glView.getParent();
            if (parent != null) parent.removeView(glView);
            glView = null;
        }
    }

    @Override
    protected void handleOnPause() {
        // ARCore releases the camera when the app goes to the background, so the
        // session is closed rather than left half-running.
        stopSession();
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        stopSession();
        super.handleOnDestroy();
    }

    // ── ARCore surface ──────────────────────────────────────────────────────
    // ARCore needs a GL context on the thread it updates from. This tiny offscreen
    // surface provides one; nothing is ever drawn to the screen from it, and the
    // depth frames come back through the CPU.

    private void startSurface() {
        if (glView != null) {
            glView.onResume();
            return;
        }
        glView = new GLSurfaceView(getActivity());
        glView.setEGLContextClientVersion(2);
        glView.setRenderer(new DepthRenderer());
        glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        ViewGroup root = (ViewGroup) getBridge().getWebView().getParent();
        root.addView(glView, 0, new ViewGroup.LayoutParams(1, 1));
        glView.onResume();
    }

    private class DepthRenderer implements GLSurfaceView.Renderer {

        @Override
        public void onSurfaceCreated(GL10 gl, EGLConfig eglConfig) {
            int[] textures = new int[1];
            GLES20.glGenTextures(1, textures, 0);
            if (session != null) {
                try {
                    session.setCameraTextureName(textures[0]);
                } catch (Exception ignored) {
                }
            }
        }

        @Override
        public void onSurfaceChanged(GL10 gl, int width, int height) {
            applyDisplayGeometry();
        }

        @Override
        public void onDrawFrame(GL10 gl) {
            Session current = session;
            if (current == null || !streaming) return;
            long now = System.currentTimeMillis();
            if (now - lastFrameAt < 1000 / targetFps) return;
            lastFrameAt = now;
            Frame frame;
            try {
                frame = current.update();
            } catch (Exception e) {
                // The camera is momentarily unavailable; the next frame retries.
                return;
            }
            try {
                deliver(frame);
            } catch (Exception e) {
                Log.w(TAG, "Depth frame could not be processed", e);
            }
        }
    }

    private void applyDisplayGeometry() {
        if (session == null) return;
        try {
            DisplayMetrics metrics = getContext().getResources().getDisplayMetrics();
            session.setDisplayGeometry(displayRotation(), metrics.widthPixels, metrics.heightPixels);
        } catch (Exception ignored) {
        }
    }

    // ── Frame handling ──────────────────────────────────────────────────────

    private void deliver(Frame frame) {
        android.media.Image depthImage;
        try {
            depthImage = frame.acquireDepthImage16Bits();
        } catch (NotYetAvailableException e) {
            // No trustworthy depth yet. On a phone without a dedicated depth sensor
            // this covers the first seconds while ARCore builds its map from the
            // camera as the phone is swept across the room.
            return;
        } catch (Exception e) {
            return;
        }

        try {
            final int width = depthImage.getWidth();
            final int height = depthImage.getHeight();
            final android.media.Image.Plane plane = depthImage.getPlanes()[0];
            final ByteBuffer buffer = plane.getBuffer();
            buffer.order(ByteOrder.LITTLE_ENDIAN);
            final int rowStride = plane.getRowStride();
            final int pixelStride = plane.getPixelStride();

            final int gridW = Math.max(1, width / GRID_STEP);
            final int gridH = Math.max(1, height / GRID_STEP);
            final int totalCells = gridW * gridH;

            // ── The coarse grid: which cells hold a usable reading ──
            float[] cellDepth = new float[totalCells];
            boolean[] cellValid = new boolean[totalCells];
            float[] readable = new float[totalCells];
            int readableCount = 0;
            for (int gy = 0; gy < gridH; gy++) {
                final int y = Math.min(height - 1, gy * GRID_STEP);
                for (int gx = 0; gx < gridW; gx++) {
                    final int x = Math.min(width - 1, gx * GRID_STEP);
                    final float metres = readDepth(buffer, y * rowStride + x * pixelStride, rowStride, pixelStride);
                    if (metres <= 0f) continue;
                    final int cell = gy * gridW + gx;
                    cellDepth[cell] = metres;
                    cellValid[cell] = true;
                    readable[readableCount++] = metres;
                }
            }
            if (readableCount < Math.max(12, totalCells / 8)) return;

            float[] sorted = Arrays.copyOf(readable, readableCount);
            Arrays.sort(sorted);
            final float nearest = sorted[0];
            // The background surface the room sits behind: the far end of the
            // readable depths, robust to one odd reading at the extreme.
            final float background = sorted[Math.min(readableCount - 1, (int) (readableCount * 0.75))];
            final float span = Math.max(0.25f, background - nearest);

            // ── A form has to stand out in front of that surface ──
            boolean[] mask = new boolean[totalCells];
            for (int i = 0; i < totalCells; i++) {
                if (cellValid[i] && cellDepth[i] < background - liveProtrusion) mask[i] = true;
            }

            boolean[] visited = new boolean[totalCells];
            boolean[] figureMask = new boolean[totalCells];
            JSArray figures = new JSArray();
            int[] queue = new int[totalCells];
            for (int start = 0; start < totalCells; start++) {
                if (!mask[start] || visited[start] || figures.length() >= MAX_FIGURES) continue;
                int head = 0;
                int tail = 0;
                queue[tail++] = start;
                visited[start] = true;
                ArrayList<Integer> cells = new ArrayList<>();
                int minX = start % gridW, maxX = minX, minY = start / gridW, maxY = minY;
                while (head < tail) {
                    final int index = queue[head++];
                    cells.add(index);
                    final int x = index % gridW;
                    final int y = index / gridW;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    if (x > 0) tail = enqueue(queue, tail, index - 1, mask, visited);
                    if (x < gridW - 1) tail = enqueue(queue, tail, index + 1, mask, visited);
                    if (y > 0) tail = enqueue(queue, tail, index - gridW, mask, visited);
                    if (y < gridH - 1) tail = enqueue(queue, tail, index + gridW, mask, visited);
                }
                final float boxWidth = (float) (maxX - minX + 1) / gridW;
                final float boxHeight = (float) (maxY - minY + 1) / gridH;
                final boolean figureShaped = boxHeight >= liveFigureHeight
                    && boxWidth >= liveFigureWidth
                    && boxWidth <= MAX_FIGURE_WIDTH
                    && cells.size() >= liveFigureCells;
                if (!figureShaped) continue;
                for (int cell : cells) figureMask[cell] = true;
                JSObject box = new JSObject();
                box.put("x", (double) minX / gridW);
                box.put("y", (double) minY / gridH);
                box.put("w", (double) boxWidth);
                box.put("h", (double) boxHeight);
                figures.put(box);
            }

            // ── The colourised depth image: what the investigator sees, and what
            // the recording carries ──
            int[] pixels = new int[width * height];
            for (int y = 0; y < height; y++) {
                final int gridRow = (y / GRID_STEP) * gridW;
                for (int x = 0; x < width; x++) {
                    final float metres = readDepth(buffer, y * rowStride + x * pixelStride, rowStride, pixelStride);
                    float closeness = 0f;
                    if (metres > 0f) {
                        closeness = 1f - Math.min(1f, Math.max(0f, (metres - nearest) / span));
                    }
                    float r;
                    float g;
                    float b;
                    if (closeness > 0.5f) {
                        final float t = (closeness - 0.5f) / 0.5f;
                        r = 60 + t * 130;
                        g = 190 + t * 65;
                        b = 90 + t * 60;
                    } else {
                        final float t = closeness / 0.5f;
                        r = 6 + t * 54;
                        g = 16 + t * 174;
                        b = 26 + t * 64;
                    }
                    final int cell = gridRow + (x / GRID_STEP);
                    if (cell < totalCells && figureMask[cell]) {
                        // A detected form is lit brighter than its depth alone, so
                        // the recorded image shows the same shape its box marks.
                        r = 200;
                        g = 255;
                        b = 230;
                    }
                    pixels[y * width + x] =
                        0xFF000000
                            | (((int) Math.max(0, Math.min(255, r))) << 16)
                            | (((int) Math.max(0, Math.min(255, g))) << 8)
                            | ((int) Math.max(0, Math.min(255, b)));
                }
            }

            // Scaled up (nearest neighbour) and turned to match how the phone is
            // held: ARCore hands back depth in the sensor's frame.
            Bitmap base = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888);
            Bitmap scaled = Bitmap.createScaledBitmap(base, width * 2, height * 2, false);
            Matrix matrix = new Matrix();
            matrix.postRotate(imageRotationDegrees());
            Bitmap rotated = Bitmap.createBitmap(scaled, 0, 0, scaled.getWidth(), scaled.getHeight(), matrix, false);

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            rotated.compress(Bitmap.CompressFormat.JPEG, 60, output);
            final String base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);

            double centerDepth = 0.0;
            final int centerCell = (gridH / 2) * gridW + (gridW / 2);
            if (centerCell < totalCells && cellValid[centerCell]) {
                centerDepth = cellDepth[centerCell];
            }

            final JSObject payload = new JSObject();
            payload.put("image", "data:image/jpeg;base64," + base64);
            payload.put("figures", figures);
            payload.put("background", (double) background);
            payload.put("nearest", (double) nearest);
            payload.put("centerDepth", centerDepth);
            payload.put("width", (double) rotated.getWidth());
            payload.put("height", (double) rotated.getHeight());
            getActivity().runOnUiThread(() -> notifyListeners("frame", payload));
        } finally {
            depthImage.close();
        }
    }

    /** Depth in metres from a DEPTH16 sample, or 0 when the reading is unusable. */
    private float readDepth(ByteBuffer buffer, int index, int rowStride, int pixelStride) {
        if (index + 1 >= buffer.limit()) return 0f;
        final int millimetres = (buffer.get(index) & 0xFF) | ((buffer.get(index + 1) & 0xFF) << 8);
        if (millimetres <= 0) return 0f;
        final float metres = millimetres / 1000f;
        return metres <= 8f ? metres : 0f;
    }

    private int enqueue(int[] queue, int tail, int index, boolean[] mask, boolean[] visited) {
        if (mask[index] && !visited[index]) {
            visited[index] = true;
            queue[tail++] = index;
        }
        return tail;
    }

    private int displayRotation() {
        return getActivity().getWindowManager().getDefaultDisplay().getRotation();
    }

    // Matches the depth image to the current display rotation.
    private int imageRotationDegrees() {
        switch (displayRotation()) {
            case Surface.ROTATION_90:
                return 0;
            case Surface.ROTATION_180:
                return 270;
            case Surface.ROTATION_270:
                return 180;
            default:
                return 90;
        }
    }
}