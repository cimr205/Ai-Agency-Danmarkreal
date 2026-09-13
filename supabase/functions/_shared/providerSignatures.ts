const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map((value)=>value.toString(16).padStart(2,"0")).join("");

export function constantTimeEqual(left:string,right:string):boolean {
  if(left.length!==right.length) return false;
  let mismatch=0;
  for(let index=0;index<left.length;index++) mismatch|=left.charCodeAt(index)^right.charCodeAt(index);
  return mismatch===0;
}

export async function verifyMetaSignature(raw:string,supplied:string,secret:string):Promise<boolean> {
  if(!secret||!supplied.startsWith("sha256=")) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const expected=`sha256=${hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)))}`;
  return constantTimeEqual(supplied,expected);
}
