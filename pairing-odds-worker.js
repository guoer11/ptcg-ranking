importScripts('pairing-odds-engine.js?v=1.11.0-r1');
self.onmessage=event=>{try{self.postMessage({ok:true,output:PairingOddsEngine.simulate(event.data.snapshot,event.data.options)});}catch(error){self.postMessage({ok:false,error:error.message||'估算失敗。'});}};
