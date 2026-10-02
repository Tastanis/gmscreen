// Healthy fallback delivery keeps its existing cadence. Failed requests back off
// without delaying explicit recovery, command acknowledgments or Pusher events.
export function createRecoveryPolling({recover,isRecovering=()=>false,windowRef,intervalMs=500,getInterval=null,now=()=>Date.now(),onError=()=>{}}){
 const interval=Math.max(100,Number(intervalMs)||500);
 let timer=null,stopped=true,pending=false,failures=0,nextAttempt=0,lastSuccess=null;
 async function tick(){
  if(stopped||pending||isRecovering()||now()<nextAttempt)return;
  const cadence=Math.max(interval,Number(getInterval?.())||interval);
  if(getInterval&&!failures&&lastSuccess!==null&&now()-lastSuccess<cadence)return;
  pending=true;
  try{await recover();failures=0;nextAttempt=0;lastSuccess=now();}
  catch(error){
   failures=Math.min(8,failures+1);
   const delay=Math.max(Math.min(30000,interval*2**failures),Math.min(60000,Math.max(0,Number(error?.retryAfterMs)||0)));
   nextAttempt=now()+delay;
   // EventStream reports its own failures once; do not double-report that error.
   if(!error?.syncRecovery)onError(error);
  }finally{pending=false;}
 }
 return {
  start(){if(!stopped)return;stopped=false;if(typeof windowRef?.setInterval==='function')timer=windowRef.setInterval(tick,interval);},
  stop(){stopped=true;if(timer!==null)windowRef?.clearInterval?.(timer);timer=null;},
  tick,
 };
}
