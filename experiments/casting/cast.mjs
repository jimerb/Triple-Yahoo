export const NAMESPACE = 'urn:x-cast:com.tripleyahoo.trial';
export async function setupCast({ packet, status, readyButton }) {
  const { appId } = await fetch('/api/config').then(r => r.json());
  if (!appId) { status('For Show on TV, open the online casting trial using the link above. Start a new trial there. Board previews work here.'); return { configured: false, stop() {} }; }
  if (!/^[A-F0-9]{8}$/i.test(appId)) { status('The trial casting configuration needs attention.'); return { configured: false, stop() {} }; }
  if (!window.isSecureContext) { status('For Show on TV, open the online casting trial using the link above. Start a new trial there.'); return { configured: false, stop() {} }; }
  let context, session, listener;
  const attach = async () => {
    session = context.getCurrentSession(); if (!session) return;
    if (listener) session.removeMessageListener(NAMESPACE, listener);
    listener = (_ns, raw) => { try { const data = typeof raw === 'string' ? JSON.parse(raw) : raw; if (data.roomId === packet().roomId) status(data.type === 'ready' ? 'TV board connected. Your phone controls stay here.' : data.message || 'TV board is starting…'); } catch {} };
    session.addMessageListener(NAMESPACE, listener);
    await session.sendMessage(NAMESPACE, { type: 'attach', version: 1, ...packet() });
    status('TV board is connecting. Phone sound stays on until the TV is ready.');
  };
  window.__onGCastApiAvailable = available => {
    if (!available) { status('Casting is unavailable in this browser. Your game can continue here.'); return; }
    context = cast.framework.CastContext.getInstance();
    context.setOptions({ receiverApplicationId: appId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED, resumeSavedSession: true });
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
      if ([cast.framework.SessionState.SESSION_STARTED,cast.framework.SessionState.SESSION_RESUMED].includes(event.sessionState)) attach().catch(() => status('The TV board could not join. Keep playing here and retry Show on TV.'));
      if ([cast.framework.SessionState.SESSION_ENDED,cast.framework.SessionState.SESSION_START_FAILED].includes(event.sessionState)) {
        if (session && listener) session.removeMessageListener(NAMESPACE, listener);
        session = null; status('TV casting stopped. Phone sound returns after the display disconnects, or tap Play sound here.');
      }
    });
    readyButton(async () => {
      try { if (context.getCurrentSession()) await attach(); else await context.requestSession(); }
      catch { status('Casting did not start. Your game and phone sound are unchanged.'); }
    });
    status('Tap Show on TV and select your display.');
    if (context.getCurrentSession()) attach().catch(() => status('Could not resume the TV board. Try Show on TV.'));
  };
  const script = document.createElement('script'); script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  script.onerror = () => status('Casting could not load. Check your connection; your game can continue here.'); document.head.append(script);
  setTimeout(() => { if (!context) status('Casting is not available yet in this browser. Your game can continue here.'); }, 12000);
  return { configured: true, stop() { context?.getCurrentSession()?.endSession(true); } };
}
