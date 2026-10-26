import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { load(it) }
    }
}

// Release build tidak boleh memakai debug key. File key.properties dan
// keystore tidak pernah di-commit; lihat key.properties.example.
if (!keystorePropertiesFile.exists()) {
    logger.lifecycle("key.properties tidak ditemukan: build release akan gagal sampai keystore produksi dikonfigurasi.")
}

android {
    namespace = "com.onezentra.onezentra_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.onezentra.onezentra_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // Jangan fallback ke debug signing. Tanpa keystore, release build
            // memang harus gagal agar APK tidak pernah terbit dengan debug key.
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

gradle.taskGraph.whenReady {
    val releaseRequested = allTasks.any { task ->
        task.name.contains("Release", ignoreCase = true)
    }
    if (releaseRequested && !keystorePropertiesFile.exists()) {
        throw GradleException(
            "Release build membutuhkan onezentra_mobile/android/key.properties dan keystore produksi. " +
                "Salin key.properties.example lalu isi nilainya."
        )
    }
}

flutter {
    source = "../.."
}
