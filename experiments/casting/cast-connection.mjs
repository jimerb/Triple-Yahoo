// A sent Cast message is not proof that the board accepted the invitation.
export class CastConnection {
  constructor({namespace, status, makeId, timeoutMs=12000, stopTimeoutMs=6000}) {
    Object.assign(this,{namespace,status,makeId,timeoutMs,stopTimeoutMs});
    this.session=null;this.listener=null;this.pending=null;this.stopping=null;
  }
  attach(session, packet) {
    if(this.pending?.session===session&&this.pending.roomId===packet.roomId)return this.pending.promise;
    this.detach();this.session=session;
    const attempt=this.makeId();let finish;
    const promise=new Promise((resolve,reject)=>{finish=error=>{clearTimeout(timer);if(this.pending?.attempt===attempt)this.pending=null;error?reject(error):resolve();};});
    const timer=setTimeout(()=>finish(Error('The TV did not respond. Tap Stop TV, then Show on TV to reconnect.')),this.timeoutMs);
    this.pending={session,roomId:packet.roomId,attempt,promise,finish};
    this.listener=(_namespace,raw)=>{
      let data;try{data=typeof raw==='string'?JSON.parse(raw):raw;}catch{return;}
      if(data?.roomId!==packet.roomId||(data.attempt&&data.attempt!==attempt))return;
      if(data.type==='error'){finish(Error(data.message||'The TV could not join this trial.'));return;}
      if(!['attached','ready','audio-blocked'].includes(data.type))return;
      this.status(data.type==='ready'?'TV board connected. Your phone controls stay here.':data.message||'TV board connected. Phone sound stays on until TV sound is ready.');
      finish();
    };
    session.addMessageListener(this.namespace,this.listener);
    this.status('TV board is connecting. Phone sound stays on until the TV is ready.');
    Promise.resolve().then(()=>session.sendMessage(this.namespace,{type:'attach',version:1,...packet,attempt})).catch(finish);
    return promise;
  }
  detach() {
    if(this.session&&this.listener)this.session.removeMessageListener(this.namespace,this.listener);
    this.listener=null;this.session=null;
    this.pending?.finish(Object.assign(Error('TV connection stopped.'),{code:'stopped'}));
  }
  ended() {this.detach();this.stopFinished?.();}
  stop(getSession) {
    if(this.stopping)return this.stopping;
    const session=getSession();if(!session){this.ended();return Promise.resolve();}
    this.detach();let settle;
    const wait=new Promise((resolve,reject)=>{settle=error=>error?reject(error):resolve();});
    this.stopping=wait;
    const timer=setTimeout(()=>settle(Error('The TV did not confirm stopping. Stop casting from the phone, then try New trial again.')),this.stopTimeoutMs);
    this.stopFinished=()=>settle();
    try{session.endSession(true);if(!getSession())this.ended();}catch(error){settle(error);}
    return wait.finally(()=>{clearTimeout(timer);this.stopFinished=null;this.stopping=null;});
  }
}

export function castFailure(error) {
  if(error?.message)return error.message;
  const code=typeof error==='string'?error:error?.code;
  if(code==='cancel')return 'TV selection was canceled. Tap Show on TV to try again.';
  if(code==='timeout')return 'The TV did not respond in time (timeout). Stop casting, then tap Show on TV again.';
  const detail=typeof code==='string'&&/^[a-z_]{1,40}$/.test(code)?' ('+code+')':'';
  return 'The TV could not start Triple Yahoo'+detail+'. Your game can continue here. Try Show on TV again.';
}

// Google may emit a session event without settling its selection promise.
// Wait for a real session, not just delivery of the launch request.
export class CastLaunch {
  constructor({requestSession,getSession,status,recovery=()=>{},timeoutMs=45000}) {
    Object.assign(this,{requestSession,getSession,status,recovery,timeoutMs});
    this.pending=null;this.needsReset=false;
  }
  start() {
    const current=this.getSession();if(current)return Promise.resolve(current);
    if(this.pending)return this.pending.promise;
    if(this.needsReset)return Promise.reject(this.timeoutError());
    const pending={phase:'choosing'};
    pending.promise=new Promise((resolve,reject)=>{pending.finish=(error,session)=>{
      if(this.pending!==pending)return;
      clearTimeout(pending.timer);this.pending=null;error?reject(error):resolve(session);
    };});
    this.pending=pending;this.recovery(false);
    this.status('Choose your TV in the casting list.');this.arm(pending);
    // Call synchronously within the button tap to preserve browser user activation.
    try{Promise.resolve(this.requestSession()).then(()=>{
      if(this.pending!==pending)return;
      if(!this.started(this.getSession()))this.starting();
    },error=>pending.finish(error));}catch(error){pending.finish(error);}
    return pending.promise;
  }
  arm(pending) {
    clearTimeout(pending.timer);pending.timer=setTimeout(()=>{
      if(this.pending!==pending)return;
      this.needsReset=true;this.recovery(true);pending.finish(this.timeoutError());
    },this.timeoutMs);
  }
  timeoutError() {
    return Object.assign(Error('Google did not finish connecting to the TV (launch_timeout). Tap Reset TV connection, then try Show on TV again. Your game stays here.'),{code:'launch_timeout'});
  }
  starting() {
    if(!this.pending||this.pending.phase==='starting')return;
    this.pending.phase='starting';this.status('TV selected. Starting Triple Yahoo on the TV…');this.arm(this.pending);
  }
  started(session) {
    if(!session)return false;
    this.needsReset=false;this.recovery(false);
    const pending=this.pending;pending?.finish(null,session);return !!pending;
  }
  failed(error) {const pending=this.pending;pending?.finish(error);return !!pending;}
  cancel() {this.failed(Object.assign(Error('TV connection stopped.'),{code:'stopped'}));}
}

export function reloadTvConnection(storage,reload) {
  try{storage.setItem('ty-cast-fresh-start','1');}catch{}
  reload();
}

export function useFreshTvConnection(storage) {
  try{const fresh=storage.getItem('ty-cast-fresh-start')==='1';storage.removeItem('ty-cast-fresh-start');return fresh;}catch{return false;}
}

export async function startAnotherTrial({stop,close,clear,reload}) {
  await stop();close();clear();reload();
}
