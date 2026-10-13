const SIZE=256;

/** Freeze each v6 fractional photographic crop once, then copy at integer size.
 * Both endpoint and flow painters use the same pixels even if the visible 2D
 * canvas changes its raster backend after repeated readback. */
export function createWholeCanonicalFrames(images,meta) {
  const frames=new Map();
  const scales=meta.pages.map(p=>SIZE/Math.max(p.sourceSize[0]/p.columns,p.sourceSize[1]/p.rows)*(p.scale??1));
  let disposed=false;
  return {
    get(index) {
      if(disposed)throw new Error('Canonical frames have been disposed');
      if(frames.has(index))return frames.get(index);
      const frame=meta.frames[index],page=frame.page,[x,y,w,h]=frame.rect,scale=scales[page];
      const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
      const context=canvas.getContext('2d');
      if(!context)throw new Error('Missing canonical 2D context');
      if(frame.mirror===-1){context.translate(SIZE,0);context.scale(-1,1);}
      context.drawImage(images[page],x,y,w,h,(SIZE-w*scale)/2+(frame.offsetX??0),(SIZE-h*scale)/2+(frame.offsetY??0),w*scale,h*scale);
      frames.set(index,canvas);return canvas;
    },
    dispose() {
      if(disposed)return;disposed=true;
      for(const canvas of frames.values())canvas.width=canvas.height=0;
      frames.clear();
    },
  };
}
