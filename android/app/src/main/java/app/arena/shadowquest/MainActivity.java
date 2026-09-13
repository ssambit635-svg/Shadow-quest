package app.arena.shadowquest;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * The shell. Two jobs beyond Capacitor's bridge: run edge-to-edge, and make
 * sure the WebView actually scrolls.
 *
 * Without edge-to-edge the WebView is laid out *inside* the system bars and
 * the CSS `env(safe-area-inset-*)` the whole mobile stylesheet keys off
 * resolves to zero — the app would sit in a letterbox with a grey band where
 * the status bar is. Edge-to-edge lets the ink run under the status and
 * navigation bars, and the WebView then reports the real insets so the
 * docked tab bar pads itself above the home gesture exactly as designed.
 *
 * Nested scrolling + overscroll must be on: a CoordinatorLayout parent (the
 * Capacitor default) otherwise eats the vertical drag, which is why the
 * *same* bundle scrolls in Chrome and sits frozen inside the APK.
 *
 * The status bar keeps *light* glyphs on the ink ground, matching
 * `apple-mobile-web-app-status-bar-style: black-translucent` on iOS.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    WindowInsetsControllerCompat insets = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
    insets.setAppearanceLightStatusBars(false);
    insets.setAppearanceLightNavigationBars(false);

    WebView web = getBridge() != null ? getBridge().getWebView() : null;
    if (web != null) {
      web.setNestedScrollingEnabled(true);
      web.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
      web.setVerticalScrollBarEnabled(true);
      web.setHorizontalScrollBarEnabled(false);
    }
  }
}
