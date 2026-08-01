package expo.modules.nativelocation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

private const val LOCATION_TIMEOUT_MS = 15_000L

private val FOREGROUND_PERMISSIONS = arrayOf(
  Manifest.permission.ACCESS_FINE_LOCATION,
  Manifest.permission.ACCESS_COARSE_LOCATION
)

class CoordinatesParams : Record {
  @Field val latitude: Double = 0.0
  @Field val longitude: Double = 0.0
}

class PermissionStatusResult(@Field val status: String) : Record

class Coordinates(
  @Field val latitude: Double,
  @Field val longitude: Double,
  @Field val accuracy: Double?
) : Record

class PositionResult(@Field val coords: Coordinates) : Record

class GeocodedAddress(
  @Field val city: String?,
  @Field val subregion: String?,
  @Field val district: String?,
  @Field val country: String?
) : Record

/**
 * Pure-AOSP stand-in for the slice of `expo-location`'s API this app uses.
 * `expo-location`'s Android module has a hard dependency on the proprietary
 * com.google.android.gms:play-services-location (Fused Location Provider),
 * which is incompatible with F-Droid distribution and unavailable on
 * de-Googled devices. This module sources the same data from
 * android.location.LocationManager / Geocoder, which ship on every Android
 * device regardless of Play Services availability.
 */
class NativeLocationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NativeLocation")

    AsyncFunction("getForegroundPermissionsAsync") Coroutine { ->
      readPermissionStatus { promise ->
        Permissions.getPermissionsWithPermissionsManager(permissionsManager(), promise, *FOREGROUND_PERMISSIONS)
      }
    }

    AsyncFunction("requestForegroundPermissionsAsync") Coroutine { ->
      readPermissionStatus { promise ->
        Permissions.askForPermissionsWithPermissionsManager(permissionsManager(), promise, *FOREGROUND_PERMISSIONS)
      }
    }

    AsyncFunction("getCurrentPositionAsync") Coroutine { ->
      getCurrentPosition()
    }

    AsyncFunction("reverseGeocodeAsync") Coroutine { params: CoordinatesParams ->
      reverseGeocode(params.latitude, params.longitude)
    }
  }

  private val reactContext: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun permissionsManager(): Permissions =
    appContext.permissions ?: throw CodedException("ERR_NO_PERMISSIONS", "Permissions module is not available", null)

  private suspend fun readPermissionStatus(request: (promise: Promise) -> Unit): PermissionStatusResult =
    suspendCoroutine { continuation ->
      request(object : Promise {
        override fun resolve(value: Any?) {
          val status = (value as? Bundle)?.getString("status") ?: "undetermined"
          continuation.resume(PermissionStatusResult(status))
        }

        override fun reject(code: String?, message: String?, cause: Throwable?) {
          continuation.resumeWithException(CodedException(code, message, cause))
        }
      })
    }

  private fun hasForegroundPermission(): Boolean =
    FOREGROUND_PERMISSIONS.any {
      ContextCompat.checkSelfPermission(reactContext, it) == PackageManager.PERMISSION_GRANTED
    }

  private suspend fun getCurrentPosition(): PositionResult {
    if (!hasForegroundPermission()) {
      throw CodedException("ERR_LOCATION_UNAUTHORIZED", "Location permission has not been granted", null)
    }

    val manager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val provider = bestAvailableProvider(manager)
      ?: throw CodedException("ERR_LOCATION_UNAVAILABLE", "No location provider is enabled", null)

    val location = requestSingleLocationUpdate(manager, provider)
      ?: manager.getLastKnownLocation(provider)
      ?: throw CodedException("ERR_LOCATION_UNAVAILABLE", "Could not determine the current location", null)

    val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null
    return PositionResult(Coordinates(location.latitude, location.longitude, accuracy))
  }

  private fun bestAvailableProvider(manager: LocationManager): String? = when {
    manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
    manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
    else -> null
  }

  // requestSingleUpdate (rather than the API 30+ getCurrentLocation) covers every
  // Android version this app supports with one code path. A timeout falls back to
  // the provider's last known fix so the screen never spins forever indoors/underground.
  private suspend fun requestSingleLocationUpdate(manager: LocationManager, provider: String): Location? =
    suspendCancellableCoroutine { continuation ->
      val handler = Handler(Looper.getMainLooper())
      val finished = AtomicBoolean(false)
      lateinit var listener: LocationListener

      fun finish(location: Location?) {
        if (!finished.compareAndSet(false, true)) return
        handler.removeCallbacksAndMessages(null)
        manager.removeUpdates(listener)
        if (continuation.isActive) continuation.resume(location)
      }

      listener = object : LocationListener {
        override fun onLocationChanged(location: Location) = finish(location)
        override fun onProviderDisabled(provider: String) = finish(null)
        override fun onProviderEnabled(provider: String) {}

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
      }

      handler.postDelayed({ finish(null) }, LOCATION_TIMEOUT_MS)
      try {
        manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
      } catch (e: SecurityException) {
        finish(null)
      }

      continuation.invokeOnCancellation {
        handler.removeCallbacksAndMessages(null)
        manager.removeUpdates(listener)
      }
    }

  private suspend fun reverseGeocode(latitude: Double, longitude: Double): List<GeocodedAddress> {
    if (!Geocoder.isPresent()) return emptyList()
    val geocoder = Geocoder(reactContext, Locale.getDefault())

    val addresses = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      suspendCancellableCoroutine<List<Address>> { continuation ->
        geocoder.getFromLocation(latitude, longitude, 1) { continuation.resume(it) }
      }
    } else {
      @Suppress("DEPRECATION")
      geocoder.getFromLocation(latitude, longitude, 1) ?: emptyList()
    }

    return addresses.map {
      GeocodedAddress(
        city = it.locality,
        subregion = it.subAdminArea,
        district = it.subLocality,
        country = it.countryName
      )
    }
  }
}
