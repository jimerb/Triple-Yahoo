import {newId} from './client.mjs';
import {CastConnection,CastLaunch,castFailure,useFreshTvConnection,resetTvConnection} from './cast-connection.mjs';
export const NAMESPACE = 'urn:x-cast:com.tripleyahoo.trial';
export async function setupCast({ packet, status, readyButton, sessionChanged=()=>{}, busyChanged=()=>{}, recovery=()=>{} }) {
  const { appId } = await fetch('/api/config').then(r => r.json());
  if (!appId) { status('TV setup is still being completed for this trial. You can play and open the board preview.'); return { configured: false, stop() {} }; }
  if (!/^[A-F0-9]{8}$/i.test(appId)) { status('The trial casting configuration needs attention.'); return { configured: false, stop() {} }; }
  if (!window.isSecureContext) { status('Open the secure trial link to use Show on TV.'); return { configured: false, stop() {} }; }
  let context, launch, choosing=false;
  const connection=new CastConnection({namespace:NAMESPACE,status,makeId:newId});
  const trace=(stage,error)=>{const p=packet();const code=typeof error==='string'?error:error?.code;
    void fetch(`/api/rooms/${p.roomId}/cast-event`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+p.displayToken},body:JSON.stringify({stage,code:typeof code==='string'&&/^[a-z_]{1,40}$/.test(code)?code:''})}).catch(()=>{});
  };
  const failure=error=>{trace('failed',error);if(error?.code!=='stopped'&&!connection.stopping){status(castFailure(error));if(error!=='cancel'&&error?.code!=='cancel')recovery(true);}};
  const attach=(session=context.getCurrentSession())=>{
    sessionChanged(!!session);
    return session?connection.attach(session,packet()):Promise.reject(Error('No TV session is connected. Tap Show on TV and choose your display.'));
  };
  window.__onGCastApiAvailable = available => {
    if (!available) { status('Casting is unavailable in this browser. Your game can continue here.'); return; }
    context = cast.framework.CastContext.getInstance();
    let fresh=false;try{fresh=useFreshTvConnection(window.sessionStorage);}catch{}
    context.setOptions({ receiverApplicationId: appId, autoJoinPolicy: fresh?chrome.cast.AutoJoinPolicy.PAGE_SCOPED:chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED, resumeSavedSession: !fresh });
    launch=new CastLaunch({requestSession:()=>context.requestSession(),getSession:()=>context.getCurrentSession(),status,recovery});
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
      trace(event.sessionState,event.errorCode);
      if(event.sessionState===cast.framework.SessionState.SESSION_STARTING)launch.starting();
      if ([cast.framework.SessionState.SESSION_STARTED,cast.framework.SessionState.SESSION_RESUMED].includes(event.sessionState)) {
        const session=event.session||context.getCurrentSession();if(!launch.started(session))attach(session).catch(failure);
      }
      if(event.sessionState===cast.framework.SessionState.SESSION_ENDED){launch.cancel();connection.ended();sessionChanged(false);status('TV casting stopped. Phone sound returns after the display disconnects, or tap Play sound here.');}
      if(event.sessionState===cast.framework.SessionState.SESSION_START_FAILED){
        connection.ended();sessionChanged(false);
        const reason=event.errorCode||Error('The TV could not start Triple Yahoo. Tap Reset TV connection, then try again.');
        if(!launch.failed(reason))failure(reason);
      }
    });
    readyButton(async () => {
      if(choosing)return;choosing=true;busyChanged(true);
      try{
        trace('requested');
        await attach(await launch.start());
        trace('attached');recovery(false);
      }catch(error){failure(error);}finally{choosing=false;busyChanged(false);}
    });
    status('Tap Show on TV and select your display.');
    if (launch.connected(context.getCurrentSession())) attach().catch(failure);
  };
  const script = document.createElement('script'); script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  script.onerror = () => status('Casting could not load. Check your connection; your game can continue here.'); document.head.append(script);
  setTimeout(() => { if (!context) status('Casting is not available yet in this browser. Your game can continue here.'); }, 12000);
  return { configured: true, stop() { launch?.cancel();return connection.stop(()=>context?.getCurrentSession()); },
    async reset(storage,reload) {
      trace('reset');busyChanged(true);launch?.cancel();
      return resetTvConnection({stop:()=>connection.stop(()=>context?.getCurrentSession()),storage,reload,
        onStopFailure:error=>{status('Google did not confirm stopping the old session. Reloading casting while keeping your game.');trace('reset_stop_failed',error);}});
    }
  };
}
