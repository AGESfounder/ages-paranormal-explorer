package com.ages.explorer;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens Android Settings screens that no installed Capacitor plugin can reach.
 *   kind = "location" -> system Location (device-level) switch
 *   kind = "app"      -> this app's App Info / permissions page
 */
@CapacitorPlugin(name = "AgesSettings")
public class AgesSettingsPlugin extends Plugin {

    @PluginMethod
    public void openSettings(PluginCall call) {
        String kind = call.getString("kind", "app");
        try {
            if ("location".equals(kind)) {
                try {
                    launch(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
                    call.resolve();
                    return;
                } catch (Exception ignored) {
                    // Fall through to the app settings page.
                }
            }
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            launch(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open settings", e);
        }
    }

    private void launch(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}