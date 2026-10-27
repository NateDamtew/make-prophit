const TELEGRAM_WEB_APP_SRC = 'https://telegram.org/js/telegram-web-app.js'
const TMA_SESSION_KEY = 'prophit:tma'

/**
 * FORK: loads Telegram's Mini App script only when the page is running as a
 * Telegram Mini App, instead of on every page view (it cost ~240 ms of main
 * thread on the public site, where it only creates a stub `Telegram.WebApp`).
 *
 * Signals (see `src/lib/tma.ts`): a `tma.*` host, Telegram's launch parameters
 * (`tgWebApp…`) in the URL, Telegram's WebView bridge, or an earlier detection
 * in the same tab (in-app reloads can drop the launch parameters).
 *
 * The script is written synchronously from this parser-inserted inline script
 * so it still runs before the app hydrates, as `beforeInteractive` guaranteed.
 */
const script = `(function(){try{var l=window.location,s=window.sessionStorage,h=l.hostname;var tma=h.indexOf('tma')!==-1||/tgWebApp/.test(l.hash+l.search)||typeof window.TelegramWebviewProxy!=='undefined'||s.getItem('${TMA_SESSION_KEY}')==='1';if(!tma)return;s.setItem('${TMA_SESSION_KEY}','1');document.write('<script src="${TELEGRAM_WEB_APP_SRC}"><\\/script>')}catch(e){}})();`

export default function TelegramWebAppScript() {
  return <script id="telegram-web-app-loader" dangerouslySetInnerHTML={{ __html: script }} />
}
