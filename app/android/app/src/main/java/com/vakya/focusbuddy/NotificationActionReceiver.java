package com.vakya.focusbuddy;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if ("com.vakya.focusbuddy.ACTION_TOGGLE_PAUSE".equals(action)) {
            TimerNotificationPlugin.handleActionToggle();
        } else if ("com.vakya.focusbuddy.ACTION_ADD_MINUTE".equals(action)) {
            TimerNotificationPlugin.handleActionAddMinute();
        } else if ("com.vakya.focusbuddy.ACTION_STOP_ALARM".equals(action)) {
            TimerNotificationPlugin.handleActionStopAlarm();
        } else if ("com.vakya.focusbuddy.ACTION_TAP_ALARM".equals(action)) {
            TimerNotificationPlugin.handleActionStopAlarm();
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(launchIntent);
        }
    }
}