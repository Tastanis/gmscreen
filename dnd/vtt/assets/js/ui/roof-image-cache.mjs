// A failed image must not remain a permanent null cache entry. Recovery is
// bounded per image; each success invalidates the existing renderer revision.
export function createRoofImageCache({load, onLoaded=()=>{}, onError=()=>{}, setTimer=setTimeout, retryDelays=[1000,2000,4000]}) {
 const images=new Map(), attempts=new Map();
 function request(id) {
  if(!id||images.has(id))return;
  images.set(id,null);
  const attempt=attempts.get(id)||0;
  attempts.set(id,attempt+1);
  Promise.resolve().then(()=>load(id)).then(image=>{
   if(!image)throw Error('Roof image is unavailable');
   images.set(id,image);onLoaded();
  }).catch(error=>{
   onError(error);
   if(attempt<retryDelays.length)setTimer(()=>{images.delete(id);request(id);},retryDelays[attempt]);
  });
 }
 return {request,get:id=>images.get(id)};
}
