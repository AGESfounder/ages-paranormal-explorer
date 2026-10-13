package com.ages.explorer;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * AGES environment-sensor module (Android).
 *
 * Reads the phone's magnetic-field sensor and barometer and hands the web layer one
 * combined reading: the field vector in microtesla, the barometric pressure in
 * hectopascal, and how far the phone is from rest. The web layer compares each
 * channel against its own measured baseline (see src/lib/environmentAnalysis.js) and
 * draws it — this module reports raw sensor values and makes no judgement about them.
 *
 * The plugin's contract (jsName, methods, reading shape) is identical to the iOS
 * module, so src/lib/nativeSensors.js drives both platforms unchanged. Android
 * reports pressure in hectopascal and magnetic field in microtesla directly.
 *
 * Honest capability note: neither sensor is on every phone — the magnetic-field
 * sensor is common, the barometer is not — and the field reading carries a large
 * device-specific offset (the phone's own speaker magnet sits beside the sensor).
 * isSupported() tells the web layer which of the two this device actually has, and
 * the tool reports both channels only as departures from the room's own start.
 */
@CapacitorPlugin(name = "AgesSensors")
public class AgesSensorsPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor magnetometer;
    private Sensor barometer;
    private Sensor accelerometer;

    private boolean streaming = false;
    private long emitIntervalMs = 100;
    private long lastEmit = 0;
    private float[] fieldValues = null;   // x, y, z in microtesla
    private Float pressureValue = null;   // hectopascal
    private float movement = 0;           // m/s² from rest

    // Sensors are resolved once and kept: looking them up on every start is wasted
    // work, and a missing sensor is a permanent property of the device.
    private void load() {
        if (sensorManager != null) return;
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) return;
        magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        barometer = sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE);
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        load();
        JSObject result = new JSObject();
        result.put("magnetometer", magnetometer != null);
        result.put("barometer", barometer != null);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        load();
        Double fps = call.getDouble("fps");
        double rate = fps == null ? 10 : Math.max(2, Math.min(20, fps));
        emitIntervalMs = (long) (1000 / rate);
        lastEmit = 0;
        streaming = true;
        // A device with neither sensor still resolves: the web layer reads what is
        // present from isSupported() and says so on screen.
        if (sensorManager != null) {
            if (magnetometer != null) sensorManager.registerListener(this, magnetometer, SensorManager.SENSOR_DELAY_UI);
            if (barometer != null) sensorManager.registerListener(this, barometer, SensorManager.SENSOR_DELAY_UI);
            // The phone's own movement is read alongside the sensors: barometric
            // pressure changes with height, so a phone being lifted or carried
            // reports movement, not the room, and the web layer holds that channel.
            if (accelerometer != null) sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
        }
        JSObject result = new JSObject();
        result.put("running", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        streaming = false;
        if (sensorManager != null) sensorManager.unregisterListener(this);
        fieldValues = null;
        pressureValue = null;
        movement = 0;
        JSObject result = new JSObject();
        result.put("running", false);
        call.resolve(result);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!streaming) return;
        switch (event.sensor.getType()) {
            case Sensor.TYPE_MAGNETIC_FIELD:
                fieldValues = event.values.clone();
                break;
            case Sensor.TYPE_PRESSURE:
                pressureValue = event.values[0];
                break;
            case Sensor.TYPE_ACCELEROMETER: {
                float magnitude = (float) Math.sqrt(
                    event.values[0] * event.values[0]
                        + event.values[1] * event.values[1]
                        + event.values[2] * event.values[2]);
                movement = Math.abs(magnitude - 9.81f);
                break;
            }
            default:
                return;
        }
        emit();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Deliberately unused: thresholds are set from the room's measured spread,
        // never from a reported accuracy level.
    }

    // One throttle for both sources, so a slow barometer and a fast magnetometer
    // arrive as a steady stream rather than in bursts.
    private void emit() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastEmit < emitIntervalMs) return;
        lastEmit = now;

        JSObject payload = new JSObject();
        payload.put("movement", (double) movement);
        if (fieldValues != null && fieldValues.length >= 3) {
            double x = fieldValues[0];
            double y = fieldValues[1];
            double z = fieldValues[2];
            JSObject magnetic = new JSObject();
            magnetic.put("x", x);
            magnetic.put("y", y);
            magnetic.put("z", z);
            magnetic.put("total", Math.sqrt(x * x + y * y + z * z));
            payload.put("magnetic", magnetic);
        }
        if (pressureValue != null) {
            payload.put("pressure", (double) pressureValue);
        }
        notifyListeners("reading", payload);
    }
}