/** Matching physical views share interpolated bounds before mixing their fur. */
export function createBodyViews(document, image, views) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d');
  return {
    draw(target,view) {
      context.clearRect(0,0,256,256);context.globalCompositeOperation='lighter';
      const entries=[[view.lower,1-view.mix],[Math.min(2,view.lower+1),view.mix]];
      for(const [index,weight]of entries){
        if(weight<=0)continue;
        context.save();context.globalAlpha=weight;context.translate(view.x,view.y);
        // The physical front remains unchanged through the sign crossing.
        context.scale(index===0?1:view.mirror,1);
        context.drawImage(image,...views[index].rect,-view.width/2,0,view.width,view.height);
        context.restore();
      }
      context.globalAlpha=1;target.drawImage(canvas,0,0);
    },
  };
}
