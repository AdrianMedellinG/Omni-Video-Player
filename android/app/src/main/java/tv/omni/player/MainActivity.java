package tv.omni.player;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isMediaKey(event.getKeyCode())) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('android-media-key',{detail:{key:'"
                            + mediaKeyName(event.getKeyCode())
                            + "'}}));",
                        null
                    );
                }
                return true;
            }
        }

        return super.dispatchKeyEvent(event);
    }

    private boolean isMediaKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_STOP:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
            case KeyEvent.KEYCODE_CHANNEL_UP:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                return true;
            default:
                return false;
        }
    }

    private String mediaKeyName(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                return "MediaPlay";
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                return "MediaPause";
            case KeyEvent.KEYCODE_MEDIA_STOP:
                return "MediaStop";
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                return "MediaRewind";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                return "MediaFastForward";
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                return "MediaTrackNext";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return "MediaTrackPrevious";
            case KeyEvent.KEYCODE_CHANNEL_UP:
                return "ChannelUp";
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                return "ChannelDown";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            default:
                return "MediaPlayPause";
        }
    }
}
