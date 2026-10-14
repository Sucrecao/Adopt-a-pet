/** Bounded decoded bitmap ownership for complete-picture atlas pages. */
export function createLinePageCache({meta,loadImage,maxBytes=32*1024*1024,onReady=()=>{}}) {
  const entries=new Map();let pinned=new Set(),serial=0,disposed=false;
  const bytes=()=>[...entries.values()].reduce((sum,e)=>sum+(e.image?e.bytes:0),0);
  function evict() {
    while(bytes()>maxBytes) {
      const candidates=[...entries].filter(([page,e])=>e.image&&!pinned.has(page)).sort((a,b)=>a[1].used-b[1].used);
      if(!candidates.length)break;
      const [page,e]=candidates[0];e.image.close?.();entries.delete(page);
    }
  }
  function get(page) {const e=entries.get(page);if(e?.image)e.used=++serial;return e?.image;}
  function load(page) {
    if(disposed)return Promise.reject(new Error('Line page cache disposed'));
    if(!meta.pages[page])return Promise.reject(new Error('Invalid whole source page'));
    const existing=entries.get(page);
    if(existing){existing.used=++serial;return existing.promise;}
    const e={used:++serial,image:null,bytes:0};entries.set(page,e);
    e.promise=Promise.resolve().then(()=>loadImage(meta.pages[page].asset)).then(image=>{
      if(disposed){image.close?.();throw new Error('Line page cache disposed');}
      const width=image.naturalWidth??image.width,height=image.naturalHeight??image.height;
      if(width!==meta.pages[page].sourceSize[0]||height!==meta.pages[page].sourceSize[1]) {
        image.close?.();throw new Error('Whole source page dimensions do not match');
      }
      e.image=image;e.bytes=width*height*4;e.used=++serial;evict();onReady(page);return image;
    }).catch(error=>{if(entries.get(page)===e)entries.delete(page);throw error;});
    return e.promise;
  }
  function pinFrames(frames) {pinned=new Set(frames.map(frame=>meta.frames[frame]?.page).filter(page=>page!==undefined));evict();}
  function prefetchFrames(frames) {return Promise.allSettled([...new Set(frames.map(frame=>meta.frames[frame]?.page).filter(page=>page!==undefined))].map(load));}
  return {get,load,pinFrames,prefetchFrames,
    stats:()=>({bytes:bytes(),pages:[...entries].filter(([,e])=>e.image).length,pending:[...entries].filter(([,e])=>!e.image).length}),
    dispose(){disposed=true;for(const e of entries.values())e.image?.close?.();entries.clear();pinned.clear();}};
}
