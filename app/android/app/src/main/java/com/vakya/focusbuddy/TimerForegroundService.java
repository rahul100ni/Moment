package com.vakya.focusbuddy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.os.Build;
import android.os.IBinder;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StyleSpan;

import androidx.core.app.NotificationCompat;

public class TimerForegroundService extends Service {

    // Channel bumped to v11 so setLockscreenVisibility(VISIBILITY_PRIVATE)
    // takes effect on devices that had the old v10 channel cached.
    private static final String CHANNEL_ID = "focus_timer_permanent_channel_v11";
    private static final int NOTIF_ID = 1337;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "STOP".equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        String title        = intent.getStringExtra("title");
        String body         = intent.getStringExtra("body");
        long timestamp      = intent.getLongExtra("timestamp", 0);
        boolean countDown   = intent.getBooleanExtra("countDown", true);
        boolean isRunning   = intent.getBooleanExtra("isRunning", true);
        boolean dynamicIsland = intent.getBooleanExtra("dynamicIsland", true);

        // 1. Ensure Notification Channel exists
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Focus Study Timer",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Active study session timer");
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            // VISIBILITY_PRIVATE lets setPublicVersion() show a redacted card.
            // VISIBILITY_SECRET suppresses everything - that was the lock screen bug.
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }

        // 2. Intents for actions
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent openPendingIntent   = PendingIntent.getActivity(this, 0, openIntent, piFlags);

        Intent toggleIntent = new Intent(this, NotificationActionReceiver.class);
        toggleIntent.setAction("com.vakya.focusbuddy.ACTION_TOGGLE_PAUSE");
        PendingIntent togglePendingIntent = PendingIntent.getBroadcast(this, 100, toggleIntent, piFlags);

        Intent addMinIntent = new Intent(this, NotificationActionReceiver.class);
        addMinIntent.setAction("com.vakya.focusbuddy.ACTION_ADD_MINUTE");
        PendingIntent addMinPendingIntent = PendingIntent.getBroadcast(this, 101, addMinIntent, piFlags);

        // 3. Small icon + LargeIcon
        int iconRes = getResources().getIdentifier("ic_stat_timer", "drawable", getPackageName());
        if (iconRes == 0) iconRes = getApplicationInfo().icon;
        if (iconRes == 0) iconRes = android.R.drawable.sym_def_app_icon;

        Bitmap largeIconBitmap = null;
        try {
            largeIconBitmap = BitmapFactory.decodeResource(getResources(), getApplicationInfo().icon);
        } catch (Exception ignored) {}

        // 4. Bold title via SpannableString
        String rawTitle = (title != null) ? title : "Moment";
        CharSequence styledTitle;
        try {
            SpannableString ss = new SpannableString(rawTitle);
            ss.setSpan(new StyleSpan(Typeface.BOLD), 0, ss.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            styledTitle = ss;
        } catch (Exception e) {
            styledTitle = rawTitle;
        }

        // 5. Action labels
        String pauseLabel = isRunning ? "Pause" : "Resume";
        int pauseIcon = isRunning
                ? android.R.drawable.ic_media_pause
                : android.R.drawable.ic_media_play;

        // 6. Build the notification
        //
        // TIER A - Android 16+ (API 36 / BAKLAVA):
        //   Notification.ProgressStyle + setRequestPromotedOngoing(true)
        //   This is the ONLY reliable path for:
        //     - Android 16 Live Updates status-bar chip
        //     - OriginOS 6 Origin Island on iQOO 13
        //     - OxygenOS Fluid Cloud on Android 16 builds
        //
        // TIER B - Android 8-15 (API 26-35):
        //   CATEGORY_STOPWATCH hooks into OEM dynamic-island implementations
        //   that existed before Android 16 standardised Live Updates.
        //
        // TIER C - Below Android 8: plain ongoing notification, no channels.
        //

        if (Build.VERSION.SDK_INT >= 36 && dynamicIsland) {
            // TIER A: Android 16 Live Updates (Origin Island / Fluid Cloud)
            //
            // Notification.ProgressStyle is the MANDATORY style marker that tells
            // the OS this notification is eligible for Live Updates promotion.
            // Without it, FLAG_PROMOTED_ONGOING is silently ignored by the OS.
            Notification.ProgressStyle progressStyle = new Notification.ProgressStyle();
            // setStyledByProgress(false) = no filled bar — only the tracker dot is visible
            progressStyle.setStyledByProgress(false);
            try {
                // Tracker dot: a plain white filled circle (24 × 24 px, ARGB_8888).
                // We draw it programmatically so it is literally just a dot — no logo,
                // no icon shape, no branding. Clean and minimal on the progress rail.
                int dotSizePx = 24;
                Bitmap dotBitmap = Bitmap.createBitmap(dotSizePx, dotSizePx, Bitmap.Config.ARGB_8888);
                android.graphics.Canvas dotCanvas = new android.graphics.Canvas(dotBitmap);
                android.graphics.Paint dotPaint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
                dotPaint.setColor(android.graphics.Color.WHITE);
                dotCanvas.drawCircle(dotSizePx / 2f, dotSizePx / 2f, dotSizePx / 2f, dotPaint);
                progressStyle.setProgressTrackerIcon(
                        android.graphics.drawable.Icon.createWithBitmap(dotBitmap)
                );
            } catch (Exception ignored) {}

            Notification.Builder platformBuilder = new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(iconRes)
                    .setContentTitle(styledTitle)
                    .setContentText(body != null ? body : "Timer active")
                    .setContentIntent(openPendingIntent)
                    .setColor(0xFF8B5CF6)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setOnlyAlertOnce(true)
                    .setStyle(progressStyle)          // Required for Live Updates eligibility
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .setCategory(Notification.CATEGORY_STOPWATCH);

            // Chronometer in the expanded header: the OS natively ticks this live.
            // setUsesChronometer(true) + setShowWhen(true) + setWhen(targetMs):
            //   - For countdown: setChronometerCountDown(true), setWhen = end timestamp → counts down.
            //   - For stopwatch: setChronometerCountDown(false), setWhen = start timestamp → counts up.
            // When paused: setUsesChronometer(false) + setWhen = frozen timestamp (shows static time).
            if (isRunning) {
                platformBuilder
                        .setShowWhen(true)
                        .setUsesChronometer(true)
                        .setWhen(timestamp)
                        .setChronometerCountDown(countDown);
            } else {
                platformBuilder
                        .setShowWhen(true)
                        .setUsesChronometer(false)
                        .setWhen(timestamp);
            }

            // Actions: Pause/Resume always shown; +1 Min only for countdown sessions.
            platformBuilder.addAction(new Notification.Action.Builder(
                    android.graphics.drawable.Icon.createWithResource(this, pauseIcon),
                    pauseLabel, togglePendingIntent).build());
            if (countDown) {
                platformBuilder.addAction(new Notification.Action.Builder(
                        null, "+1 Min", addMinPendingIntent).build());
            }

            if (largeIconBitmap != null) {
                platformBuilder.setLargeIcon(largeIconBitmap);
            }

            // Public lock-screen version: plain + static.
            // No ProgressStyle, no chronometer — keeps the lock screen redacted and simple.
            Notification publicNotif = new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(iconRes)
                    .setContentTitle("Focus Active")
                    .setContentText("Session in progress")
                    .setContentIntent(openPendingIntent)
                    .setColor(0xFF8B5CF6)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setOnlyAlertOnce(true)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .build();
            platformBuilder.setPublicVersion(publicNotif);

            Notification notification = platformBuilder.build();
            // FLAG_ONGOING_EVENT   — pinned, cannot be swiped away by the user
            // FLAG_NO_CLEAR        — survives the "Clear all" swipe
            // FLAG_PROMOTED_ONGOING — requests Live Updates rail + Origin Island promotion
            notification.flags |= Notification.FLAG_ONGOING_EVENT
                    | Notification.FLAG_NO_CLEAR
                    | Notification.FLAG_PROMOTED_ONGOING;
            startForeground(NOTIF_ID, notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);

        } else {
            // TIER B/C: Android 8-15 (CATEGORY_STOPWATCH) or DI disabled
            String category = dynamicIsland
                    ? NotificationCompat.CATEGORY_STOPWATCH
                    : NotificationCompat.CATEGORY_STATUS;

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(iconRes)
                    .setContentTitle(styledTitle)
                    .setContentText(body != null ? body : "Timer active")
                    .setContentIntent(openPendingIntent)
                    .setColor(0xFF8B5CF6)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setCategory(category)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .addAction(pauseIcon, pauseLabel, togglePendingIntent);

            if (largeIconBitmap != null) {
                builder.setLargeIcon(largeIconBitmap);
            }

            // Plain static public version - no chronometer, no compat style.
            NotificationCompat.Builder publicBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(iconRes)
                    .setContentTitle("Focus Active")
                    .setContentText("Session in progress")
                    .setContentIntent(openPendingIntent)
                    .setColor(0xFF8B5CF6)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            builder.setPublicVersion(publicBuilder.build());

            if (countDown) {
                builder.addAction(0, "+1 Min", addMinPendingIntent);
            }

            if (isRunning) {
                builder.setShowWhen(true)
                       .setUsesChronometer(true)
                       .setWhen(timestamp);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && countDown) {
                    builder.setChronometerCountDown(true);
                }
            } else {
                builder.setShowWhen(true)
                       .setUsesChronometer(false)
                       .setWhen(timestamp);
            }

            Notification notification = builder.build();
            notification.flags |= Notification.FLAG_ONGOING_EVENT | Notification.FLAG_NO_CLEAR;

            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF_ID, notification,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        }

        return START_STICKY;
    }
}
