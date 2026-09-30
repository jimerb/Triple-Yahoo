// SDK contract checks with explicit test doubles. These never contact a TV.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.TRIAL_BROWSER||'chrome'});
  const base=process.env.TRIAL_URL||'http://127.0.0.1:4318';const context=await browser.newContext();
  try{
    await context.route('**/api/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({appId:'F00DCAFE'})}));
    await context.route('https://www.gstatic.com/cv/js/sender/**',route=>route.fulfill({contentType:'text/javascript',body:`
      const callbacks={};window.testCalls=[];let session=null;
      window.chrome.cast={AutoJoinPolicy:{ORIGIN_SCOPED:'origin'}};
      const context={setOptions(options){window.testOptions=options;},addEventListener(name,fn){callbacks[name]=fn;},getCurrentSession(){return session;},
      async requestSession(){session={addMessageListener(){},removeMessageListener(){},async sendMessage(namespace,packet){window.testCalls.push({namespace,packet});},endSession(){session=null;callbacks.changed({sessionState:'ended'});}};callbacks.changed({sessionState:'started'});}};
      window.cast={framework:{CastContext:{getInstance:()=>context},CastContextEventType:{SESSION_STATE_CHANGED:'changed'},SessionState:{SESSION_STARTED:'started',SESSION_RESUMED:'resumed',SESSION_ENDED:'ended',SESSION_START_FAILED:'failed'}}};
      window.__onGCastApiAvailable(true);
    `}));
    const phone=await context.newPage();await phone.goto(base);await phone.locator('#names').fill('Trial');await phone.locator('#create button').click();
    await phone.waitForFunction(()=>!document.querySelector('#cast').disabled);await phone.locator('#roll').click();
    await phone.waitForFunction(()=>document.querySelector('.roll-info').textContent.includes('Roll 1'));
    await phone.locator('#cast').click();await phone.waitForFunction(()=>window.testCalls.length===1);
    const result=await phone.evaluate(()=>({options:window.testOptions,call:window.testCalls[0]}));
    assert.equal(result.options.receiverApplicationId,'F00DCAFE');assert.equal(result.call.namespace,'urn:x-cast:com.tripleyahoo.trial');
    assert.equal(result.call.packet.version,1);assert.equal(result.call.packet.type,'attach');assert.ok(result.call.packet.displayToken);assert.equal(result.call.packet.controlToken,undefined);
    assert.equal(await phone.locator('#sound-status').innerText(),'Room sound: this phone','Session launch alone cannot mute phone');
    assert.match(await phone.locator('.roll-info').innerText(),/Roll 1/,'Session launch preserves playable phone state');
    const spare=await context.newPage();await spare.goto(base+await phone.locator('#display-link').getAttribute('href'));
    await spare.waitForFunction(()=>!document.querySelector('#cast').disabled);await spare.locator('#cast').click();await spare.waitForFunction(()=>window.testCalls.length===1);
    const sparePacket=await spare.evaluate(()=>window.testCalls[0].packet);assert.equal(sparePacket.roomId,result.call.packet.roomId);assert.equal(sparePacket.displayToken,result.call.packet.displayToken);
    assert.equal(await spare.locator('#roll').count(),0,'Spare Android has display controls without a player seat');
    const preview=new URL(base+await phone.locator('#preview').getAttribute('href'));
    const packet=JSON.parse(decodeURIComponent(preview.hash.slice(1)));
    await context.route('https://www.gstatic.com/cast/sdk/libs/caf_receiver/**',route=>route.fulfill({contentType:'text/javascript',body:`
      window.cast={framework:{system:{MessageType:{JSON:'json'}},CastReceiverContext:{getInstance:()=>({addCustomMessageListener(ns,fn){window.receiverListener=fn;window.receiverNamespace=ns;},sendCustomMessage(ns,sender,message){window.receiverReply=message;},start(options){window.receiverOptions=options;}})}}};
    `}));
    const receiver=await context.newPage();await receiver.goto(base+'/receiver.html');await receiver.waitForFunction(()=>!!window.receiverListener);
    await receiver.evaluate(packet=>window.receiverListener({senderId:'test-sender',data:{type:'attach',...packet}}),packet);
    await receiver.locator('#board h2').waitFor();
    const options=await receiver.evaluate(()=>window.receiverOptions);assert.equal(options.disableIdleTimeout,true);assert.equal(options.customNamespaces['urn:x-cast:com.tripleyahoo.trial'],'json');
    assert.equal(await receiver.locator('#board h2').innerText(),"Trial's turn");
    const other=await context.request.post(base+'/api/rooms',{data:{names:['Another trial']}});const otherKeys=await other.json();
    await receiver.evaluate(packet=>window.receiverListener({senderId:'second-sender',data:packet}),{type:'attach',version:1,roomId:otherKeys.roomId,displayToken:otherKeys.displayToken});
    await receiver.waitForFunction(()=>document.querySelector('#error').textContent.includes('already following'));
    assert.equal(await receiver.locator('#board h2').innerText(),"Trial's turn",'Different room cannot hijack an attached board');
    console.log('PASS: sender callback order, registered app configuration, custom attach protocol, control credential isolation, retained phone state, no premature muting, receiver namespace options, and cross-room takeover rejection. SDK test doubles only; no physical casting claim.');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
