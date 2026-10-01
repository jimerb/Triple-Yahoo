import {newId} from './client.mjs';
import {CastConnection,castFailure} from './cast-connection.mjs';
export const NAMESPACE = 'urn:x-cast:com.tripleyahoo.trial';
export async function setupCast({ packet, status, readyButton, sessionChanged=()=>{} }) {
  const { appId } = await fetch('/api/config').then(r => r.json());
  if (!appId) { status('For TV casting, open the online trial. This home-network preview can still play and show a separate board.'); return { configured: false, stop() {} }; }
  if (!/^[A-F0-9]{8}$/i.test(appId)) { status('The trial casting configuration needs attention.'); return { configured: false, stop() {} }; }
  if (!window.isSecureContext) { status('For TV casting, open the secure online trial. This home-network preview can still play and show a separate board.'); return { configured: false, stop() {} }; }
  let context, choosing=false, launchFailure='';
  const connection=new CastConnection({namespace:NAMESPACE,status,makeId:newId});
  const failure=error=>{if(error?.code!=='stopped'&&!connection.stopping){launchFailure=castFailure(error);status(launchFailure);}};
  const attach=()=>{
    const session=context.getCurrentSession();sessionChanged(!!session);
    return session?connection.attach(session,packet()):Promise.reject(Error('No TV session is connected. Tap Show on TV and choose your display.'));
  };
  window.__onGCastApiAvailable = available => {
    if (!available) { status('Casting is unavailable in this browser. Your game can continue here.'); return; }
    context = cast.framework.CastContext.getInstance();
    context.setOptions({ receiverApplicationId: appId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED, resumeSavedSession: true });
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
      if ([cast.framework.SessionState.SESSION_STARTED,cast.framework.SessionState.SESSION_RESUMED].includes(event.sessionState)) attach().catch(failure);
      if(event.sessionState===cast.framework.SessionState.SESSION_ENDED){connection.ended();sessionChanged(false);status('TV casting stopped. Phone sound returns after the display disconnects, or tap Play sound here.');}
      if(event.sessionState===cast.framework.SessionState.SESSION_START_FAILED){connection.ended();sessionChanged(false);status(launchFailure||'The TV could not start Triple Yahoo. Tap Show on TV to try again.');}
    });
    readyButton(async () => {
      if(choosing)return;choosing=true;launchFailure='';
      try{
        if(!context.getCurrentSession()){status('Choose your TV. Waiting for casting to start…');await context.requestSession();}
        await attach();
      }catch(error){failure(error);}finally{choosing=false;}
    });
    status('Tap Show on TV and select your display.');
    if (context.getCurrentSession()) attach().catch(failure);
  };
  const script = document.createElement('script'); script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  script.onerror = () => status('Casting could not load. Check your connection; your game can continue here.'); document.head.append(script);
  setTimeout(() => { if (!context) status('Casting is not available yet in this browser. Your game can continue here.'); }, 12000);
  return { configured: true, stop() { return connection.stop(()=>context?.getCurrentSession()); } };
}
