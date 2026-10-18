package com.ages.explorer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before super.onCreate().
        registerPlugin(AgesSettingsPlugin.class);
        registerPlugin(AgesDepthPlugin.class);
        registerPlugin(AgesSensorsPlugin.class);
        registerPlugin(AgesSaveToDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}