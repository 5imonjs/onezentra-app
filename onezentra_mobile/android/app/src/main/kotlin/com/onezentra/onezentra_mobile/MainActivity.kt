package com.onezentra.onezentra_mobile

import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    /// Kanal untuk membuka URL APK dari server (update tanpa store) di
    /// browser/instaler sistem — tanpa plugin url_launcher.
    private val updatesChannelName = "onezentra_mobile/updates"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, updatesChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openUpdateUrl" -> {
                        val url = call.argument<String>("url")
                        if (url.isNullOrBlank()) {
                            result.error("INVALID_URL", "URL APK tidak boleh kosong", null)
                        } else {
                            startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                },
                            )
                            result.success(null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
