package expo.modules.crashlog

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Notes down why Love Birds last closed, so the app can report it the next time it opens.
 * - A Java/Kotlin crash: its stack trace, written to a file just before Android ends the app.
 * - Android's own record of recent exits (crashes, native crashes, "not responding", out of memory).
 */
class CrashLogModule : Module() {
  companion object {
    @Volatile private var installed = false
    private const val FILE = "love-birds-last-crash.txt"
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext

  private fun install() {
    val ctx = context() ?: return
    synchronized(CrashLogModule::class.java) {
      if (installed) return
      installed = true
    }
    val file = File(ctx.filesDir, FILE)
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        file.writeText("${System.currentTimeMillis()}\n${thread.name}\n${Log.getStackTraceString(error).take(12000)}")
      } catch (_: Throwable) {
      }
      previous?.uncaughtException(thread, error)
    }
  }

  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
    ApplicationExitInfo.REASON_ANR -> "not responding"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "out of memory"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "failed to start"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "used too much"
    else -> "other"
  }

  override fun definition() = ModuleDefinition {
    Name("CrashLog")

    OnCreate {
      try {
        install()
      } catch (_: Throwable) {
      }
    }

    Function("install") {
      install()
    }

    /** The stack trace saved by the last crash, then forgotten. Null if there wasn't one. */
    AsyncFunction("takeLastCrash") {
      val ctx = context() ?: return@AsyncFunction null
      val file = File(ctx.filesDir, FILE)
      if (!file.exists()) return@AsyncFunction null
      val text = try { file.readText() } catch (_: Throwable) { null }
      file.delete()
      text
    }

    /** Android's record of how the app ended, newer than `since` (milliseconds). Android 11 and later. */
    AsyncFunction("exitsSince") { since: Double ->
      val out = mutableListOf<Map<String, Any?>>()
      val ctx = context() ?: return@AsyncFunction out
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@AsyncFunction out
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return@AsyncFunction out
      val wanted = setOf(
        ApplicationExitInfo.REASON_CRASH,
        ApplicationExitInfo.REASON_CRASH_NATIVE,
        ApplicationExitInfo.REASON_ANR,
        ApplicationExitInfo.REASON_LOW_MEMORY,
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE,
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE,
      )
      for (info in am.getHistoricalProcessExitReasons(ctx.packageName, 0, 10)) {
        if (info.timestamp <= since.toLong() || info.reason !in wanted) continue
        var trace: String? = null
        if (info.reason == ApplicationExitInfo.REASON_ANR) {
          trace = try {
            info.traceInputStream?.use { it.readBytes().decodeToString().take(6000) }
          } catch (_: Throwable) {
            null
          }
        }
        out.add(
          mapOf(
            "time" to info.timestamp.toDouble(),
            "reason" to reasonName(info.reason),
            "description" to info.description,
            "importance" to info.importance,
            "trace" to trace,
          ),
        )
      }
      out
    }
  }
}
