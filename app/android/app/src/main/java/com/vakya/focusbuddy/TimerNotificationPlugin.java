package com.vakya.focusbuddy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TimerNotification")
public class TimerNotificationPlugin extends Plugin {

    // v10: IMPORTANCE_LOW (no sound/buzz on update), permanent sticky regardless of pause state
    private static final String CHANNEL_ID = "focus_timer_permanent_channel_v10";
    private static final int NOTIF_ID = 1337;
    private static TimerNotificationPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void handleActionToggle() {
        if (instance != null) {
            JSObject ret = new JSObject();
            ret.put("action", "toggle");
            instance.notifyListeners("onNotificationAction", ret);
        }
    }

    public static void handleActionAddMinute() {
        if (instance != null) {
            JSObject ret = new JSObject();
            ret.put("action", "addMinute");
            instance.notifyListeners("onNotificationAction", ret);
        }
    }

    @PluginMethod
    public void showTimer(PluginCall call) {
        try {
            Context context = getContext();

            String title   = call.getString("title", "Focus");
            String body    = call.getString("body", "Session in progress");
            Long tsOpt     = call.getLong("timestamp");
            long targetTs  = tsOpt != null ? tsOpt : System.currentTimeMillis();
            Boolean cdOpt  = call.getBoolean("countDown");
            boolean countDown  = cdOpt != null ? cdOpt : true;
            Boolean runOpt = call.getBoolean("isRunning");
            boolean isRunning  = runOpt != null ? runOpt : true;
            Boolean diOpt  = call.getBoolean("dynamicIsland");
            boolean dynamicIsland = diOpt != null ? diOpt : true;

            Intent serviceIntent = new Intent(context, TimerForegroundService.class);
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("body", body);
            serviceIntent.putExtra("timestamp", targetTs);
            serviceIntent.putExtra("countDown", countDown);
            serviceIntent.putExtra("isRunning", isRunning);
            serviceIntent.putExtra("dynamicIsland", dynamicIsland);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            call.resolve();

        } catch (Exception e) {
            call.reject("Notification error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void hideTimer(PluginCall call) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, TimerForegroundService.class);
            serviceIntent.setAction("STOP");
            context.startService(serviceIntent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Hide error: " + e.getMessage());
        }
    }

    private static MediaPlayer mediaPlayer;

    public static void handleActionStopAlarm() {
        if (instance != null) {
            stopAlarmNative(instance.getContext());
            // Tell JS to dismiss the modal if it's open
            JSObject ret = new JSObject();
            ret.put("action", "dismissModal");
            instance.notifyListeners("onNotificationAction", ret);
        } else {
            stopAlarmNative(null);
        }
    }

    public static void stopAlarmNative(Context context) {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (context != null) {
            try {
                NotificationManagerCompat.from(context).cancel(NOTIF_ID + 1);
            } catch (Exception ignored) {}
        }
    }

    public static void playAlarmInternal(Context context, String title, String body) {
        try {
            stopAlarmNative(context); // stop any existing alarm first

            // 1. Create High-Priority Channel for Alarm
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        "focus_alarm_channel_v1",
                        "Session Alarms",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Rings when a session completes");
                channel.enableLights(true);
                channel.setSound(null, null); // We play sound manually with MediaPlayer to loop it

                NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) manager.createNotificationChannel(channel);
            }

            // 2. Intents for Tap and Swipe
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

            Intent tapIntent = new Intent(context, NotificationActionReceiver.class);
            tapIntent.setAction("com.vakya.focusbuddy.ACTION_TAP_ALARM");
            PendingIntent tapPendingIntent = PendingIntent.getBroadcast(context, 200, tapIntent, piFlags);

            Intent dismissIntent = new Intent(context, NotificationActionReceiver.class);
            dismissIntent.setAction("com.vakya.focusbuddy.ACTION_STOP_ALARM");
            PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(context, 201, dismissIntent, piFlags);

            // 3. Icon
            int iconRes = context.getResources().getIdentifier("ic_stat_timer", "drawable", context.getPackageName());
            if (iconRes == 0) iconRes = context.getApplicationInfo().icon;
            if (iconRes == 0) iconRes = android.R.drawable.sym_def_app_icon;

            // 4. Build Notification
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, "focus_alarm_channel_v1")
                    .setSmallIcon(iconRes)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setColor(0xFF8B5CF6)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setContentIntent(tapPendingIntent)
                    .setDeleteIntent(dismissPendingIntent)
                    .setAutoCancel(true)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            NotificationManagerCompat.from(context).notify(NOTIF_ID + 1, builder.build());

            // 5. Play the looping sound
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            mediaPlayer = new MediaPlayer();
            try {
                mediaPlayer.setDataSource(context, alarmUri);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();
                    mediaPlayer.setAudioAttributes(audioAttributes);
                } else {
                    mediaPlayer.setAudioStreamType(android.media.AudioManager.STREAM_ALARM);
                }
                mediaPlayer.setLooping(true);
                mediaPlayer.prepare();
                mediaPlayer.start();
            } catch (Exception e) {
                e.printStackTrace();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @PluginMethod
    public void playAlarm(PluginCall call) {
        try {
            Context context = getContext();
            String title = call.getString("title", "Focus Complete!");
            String body = call.getString("body", "Time for a break.");
            playAlarmInternal(context, title, body);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to play alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAlarm(PluginCall call) {
        try {
            stopAlarmNative(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop alarm: " + e.getMessage());
        }
    }
}
