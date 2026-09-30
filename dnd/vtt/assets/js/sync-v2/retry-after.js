export function retryAfterMilliseconds(response,now=Date.now()){
 const value=response?.headers?.get?.('Retry-After');if(typeof value!=='string'||!value.trim())return 0;
 const seconds=Number(value);
 const delay=Number.isFinite(seconds)&&seconds>=0?seconds*1000:Date.parse(value)-now;
 return Number.isFinite(delay)?Math.min(60000,Math.max(0,delay)):0;
}
