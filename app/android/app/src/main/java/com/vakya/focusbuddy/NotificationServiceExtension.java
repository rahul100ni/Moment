package com.vakya.focusbuddy;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

import com.onesignal.OSNotification;
import com.onesignal.OSNotificationReceivedEvent;
import com.onesignal.OneSignal.OSRemoteNotificationReceivedHandler;

import org.json.JSONObject;

public class NotificationServiceExtension implements OSRemoteNotificationReceivedHandler {

    private static final String NUDGE_CHANNEL_ID = "nudge_channel_v2";
    private static final String CHECKIN_CHANNEL_ID = "checkin_channel_v2";
    private static final int NOTIF_ID_NUDGE = 7001;
    private static final int NOTIF_ID_CHECKIN = 7002;

    @Override
    public void remoteNotificationReceived(Context context, OSNotificationReceivedEvent notificationReceivedEvent) {
        OSNotification notification = notificationReceivedEvent.getNotification();
        JSONObject data = notification.getAdditionalData();

        if (data != null) {
            String type = data.optString("type", "");

            if ("emergency_ring".equals(type)) {
                TimerNotificationPlugin.playAlarmInternal(context, "🎉 Moment Complete!", "Session done — check in!");
                notificationReceivedEvent.complete(null);
                return;
            }

            if ("nudge".equals(type)) {
                String body = data.optString("body", notification.getBody());
                if (body == null || body.isEmpty()) body = "Time for your focus block.";
                postStickyNotification(context, NUDGE_CHANNEL_ID, NOTIF_ID_NUDGE, "⏱ Focus Reminder", body, "nudge_sound");
                notificationReceivedEvent.complete(null);
                return;
            }

            if ("checkin".equals(type)) {
                String body = data.optString("body", notification.getBody());
                if (body == null || body.isEmpty()) body = "How is your session going?";
                postStickyNotification(context, CHECKIN_CHANNEL_ID, NOTIF_ID_CHECKIN, "💜 Moment", body, "checkin_sound");
                notificationReceivedEvent.complete(null);
                return;
            }
        }

        notificationReceivedEvent.complete(notification);
    }

    private void postStickyNotification(Context context, String channelId, int notifId, String title, String body, String soundName) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            Uri soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/raw/" + soundName);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = manager.getNotificationChannel(channelId);
                if (channel == null) {
                    String name = NUDGE_CHANNEL_ID.equals(channelId) ? "Focus Reminders" : "Session Check-Ins";
                    String desc = NUDGE_CHANNEL_ID.equals(channelId) ? "Reminders to keep your focus sessions on track" : "Mid-session check-ins from Moment";
                    channel = new NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH);
                    channel.setDescription(desc);
                    channel.enableLights(true);

                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .build();
                    channel.setSound(soundUri, audioAttributes);
                    manager.createNotificationChannel(channel);
                }
            }

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, openIntent, piFlags);

            int iconRes = context.getResources().getIdentifier("ic_stat_timer", "drawable", context.getPackageName());
            if (iconRes == 0) iconRes = context.getApplicationInfo().icon;
            if (iconRes == 0) iconRes = android.R.drawable.sym_def_app_icon;

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                    .setSmallIcon(iconRes)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setColor(0xFF8B5CF6)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(pendingIntent)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setSound(soundUri)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            manager.notify(notifId, builder.build());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
