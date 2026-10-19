/* ASTRA subtle portrait rig. Canvas2D source; not a Cubism .moc3 model.
 * Zero dependencies, file:// compatible, externally clocked for film integration.
 */
(function(global){'use strict';
 const W=1033,H=1024,TAU=Math.PI*2;
 const clamp=x=>Math.max(0,Math.min(1,x));
 const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 const canvas=(w=W,h=H)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(`ASTRA asset failed: ${src}`));im.src=src;});
 function weights(x,y){
  const neckGate=y<425?1:smooth((x-595)/55)*smooth((915-x)/50);
  const head=smooth((595-y)/170)*smooth((x-520)/45)*neckGate;
  const upper=smooth((640-x)/85)*smooth((y-466)/32)*smooth((671-y)/60)*smooth((x-268)/25);
  const lower=smooth((270-x)/60)*smooth((y-645)/45)*smooth((930-y)/65);
  return [head,upper,lower];
 }
 function triangle(ctx,source,src,dst){
  const [p,q,r]=src,[a,b,c]=dst;
  const det=(q.x-p.x)*(r.y-p.y)-(r.x-p.x)*(q.y-p.y);if(Math.abs(det)<.001)return;
  const aa=((b.x-a.x)*(r.y-p.y)-(c.x-a.x)*(q.y-p.y))/det;
  const cc=((c.x-a.x)*(q.x-p.x)-(b.x-a.x)*(r.x-p.x))/det;
  const bb=((b.y-a.y)*(r.y-p.y)-(c.y-a.y)*(q.y-p.y))/det;
  const dd=((c.y-a.y)*(q.x-p.x)-(b.y-a.y)*(r.x-p.x))/det;
  const cx=(a.x+b.x+c.x)/3,cy=(a.y+b.y+c.y)/3;
  // A subpixel shared-edge overlap avoids hairline cracks during deformation.
  const expand=p=>{const dx=p.x-cx,dy=p.y-cy,l=Math.hypot(dx,dy)||1;return{x:p.x+dx/l*2,y:p.y+dy/l*2};};
  const e=[a,b,c].map(expand);ctx.save();ctx.beginPath();ctx.moveTo(e[0].x,e[0].y);ctx.lineTo(e[1].x,e[1].y);ctx.lineTo(e[2].x,e[2].y);ctx.closePath();ctx.clip();
  ctx.transform(aa,bb,cc,dd,a.x-aa*p.x-cc*p.y,a.y-bb*p.x-dd*p.y);ctx.drawImage(source,0,0);ctx.restore();
 }
 function patch(im,regions){const c=canvas(),x=c.getContext('2d');x.drawImage(im,0,0,W,H);const mask=canvas(),m=mask.getContext('2d');for(const [cx,cy,rx,ry]of regions){m.save();m.translate(cx,cy);m.scale(rx,ry);const g=m.createRadialGradient(0,0,.65,0,0,1);g.addColorStop(0,'#fff');g.addColorStop(1,'#fff0');m.fillStyle=g;m.fillRect(-1,-1,2,2);m.restore();}x.globalCompositeOperation='destination-in';x.drawImage(mask,0,0);return c;}
 class AstraMicro{
  constructor({assetBase='',resolution=768,tint=0}={}){this.width=W;this.height=H;this.canvas=canvas(Math.round(resolution*W/H),resolution);this.ctx=this.canvas.getContext('2d');this.texture=canvas();this.tx=this.texture.getContext('2d');this.base=canvas();this.static=canvas(this.canvas.width,this.canvas.height);this.tint=tint;this.ready=false;this.lastFrame=-Infinity;this.enabled={blink:true,smile:true,nod:true,hands:true,gaze:true};this.overrides={};this.stats={renderMs:0,frames:0};
   this.loaded=Promise.all(['neutral','blink','smile'].map(n=>load(`${assetBase}${n}.png`))).then(([neutral,blink,smile])=>{this.images={neutral,blink,smile};this.base.getContext('2d').drawImage(neutral,0,0,W,H);this.blinkPatch=patch(blink,[[583,264,23,17],[663,254,35,22]]);this.smilePatch=patch(smile,[[626,358,58,36]]);this._mesh();this.ready=true;this.render(0,{force:true});return this;});
  }
  _mesh(){this.vertices=[];this.triangles=[];this.dynamic=[];const nx=26,ny=26;for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=i*W/nx,y=j*H/ny;this.vertices.push({x,y,w:weights(x,y)});}for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;this.triangles.push([a,a+1,a+nx+2],[a,a+nx+2,a+nx+1]);}
   const s=this.static.getContext('2d');s.scale(this.static.width/W,this.static.height/H);s.drawImage(this.base,0,0);s.globalCompositeOperation='destination-out';s.beginPath();for(const ids of this.triangles){const v=ids.map(i=>this.vertices[i]);if(v.some(p=>p.w.some(w=>w>0))){this.dynamic.push(ids);s.moveTo(v[0].x,v[0].y);s.lineTo(v[1].x,v[1].y);s.lineTo(v[2].x,v[2].y);s.closePath();}}s.fill();s.globalCompositeOperation='source-over';this.stats.dynamicTriangles=this.dynamic.length;
  }
  parameters(t){let blink=0,nod=0;const cycle=((t%28)+28)%28;for(const start of [2.4,6.9,11.1,11.48,17.8,23.2]){const a=cycle-start;if(a>=0&&a<.25)blink=Math.max(blink,a<.075?smooth(a/.075):a<.115?1:1-smooth((a-.115)/.135));}for(const start of [3.8,14.1,22.9]){const u=(cycle-start)/2.8;if(u>0&&u<1)nod+=Math.sin(TAU*u)*Math.sin(Math.PI*u);}
   const targets=[[0,0,0],[3,-.7,.25],[5,0,0],[9,.8,-.3],[12,.3,.15],[16,-.35,.35],[20,0,0],[24,.5,-.25],[27,0,0]];let gazeX=0,gazeY=0;for(let i=1;i<targets.length;i++){const [start,x,y]=targets[i];if(cycle<start)break;const prev=targets[i-1],f=smooth((cycle-start)/.65);gazeX=prev[1]+(x-prev[1])*f;gazeY=prev[2]+(y-prev[2])*f;}
   return {...{blink:this.enabled.blink?blink:0,smile:this.enabled.smile?.45*(.5-.5*Math.cos(TAU*t/12)):0,nod:this.enabled.nod?nod:0,upper:this.enabled.hands?Math.sin(TAU*t/6.3)*.010:0,lower:this.enabled.hands?Math.sin(TAU*t/7.7+.5)*.008:0,fingers:this.enabled.hands?Math.sin(TAU*t/5.1)*1.15:0,gazeX:this.enabled.gaze?gazeX:0,gazeY:this.enabled.gaze?gazeY:0},...this.overrides};
  }
  _gaze(p){if(Math.abs(p.gazeX||0)+Math.abs(p.gazeY||0)<.001)return;for(const [cx,cy,rx,ry,amount] of [[583,265,11,8,1.35],[661,254,19,11,2.25]]){const nx=8,ny=6,vs=[];for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=cx-rx+i*rx*2/nx,y=cy-ry+j*ry*2/ny;const w=smooth((1-((x-cx)/rx)**2-((y-cy)/ry)**2)/.75);vs.push({x,y,dx:p.gazeX*amount*w,dy:p.gazeY*.9*w});}this.tx.save();this.tx.beginPath();this.tx.ellipse(cx,cy,rx,ry,0,0,TAU);this.tx.clip();for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;for(const ids of [[a,a+1,a+nx+2],[a,a+nx+2,a+nx+1]]){const v=ids.map(k=>vs[k]);triangle(this.tx,this.base,v,v.map(q=>({x:q.x+q.dx,y:q.y+q.dy})));}}this.tx.restore();}}
  point(x,y,p=this.state||this.parameters(0)){const [h,u,l]=weights(x,y);let dx=0,dy=0;const rotate=(cx,cy,angle,w)=>{const xx=x-cx,yy=y-cy;dx+=(xx*(Math.cos(angle)-1)-yy*Math.sin(angle))*w;dy+=(xx*Math.sin(angle)+yy*(Math.cos(angle)-1))*w;};rotate(727,490,p.nod*.011,h);dy+=h*p.nod*(2.8-(y-320)*.005);rotate(615,564,p.upper,u);rotate(219,717,p.lower,l);dy+=p.fingers*u*smooth((465-x)/150);dx+=p.fingers*l*smooth((y-750)/90)*.6;return{x:x+dx,y:y+dy};}
  render(t,{force=false}={}){if(!this.ready)return this.canvas;if(!force&&Math.abs(t-this.lastFrame)<1/30)return this.canvas;const start=performance.now();this.lastFrame=t;const p=this.state=this.parameters(t),tx=this.tx;tx.clearRect(0,0,W,H);tx.drawImage(this.base,0,0);tx.globalCompositeOperation='source-atop';this._gaze(p);if(p.smile>0){tx.globalAlpha=clamp(p.smile);tx.drawImage(this.smilePatch,568,322,116,72,568,322,116,72);}if(p.blink>0){tx.globalAlpha=clamp(p.blink);tx.drawImage(this.blinkPatch,557,231,145,52,557,231,145,52);}tx.globalAlpha=1;tx.globalCompositeOperation='source-over';
   const ctx=this.ctx;ctx.clearRect(0,0,this.canvas.width,this.canvas.height);if(!p.nod&&!p.upper&&!p.lower&&!p.fingers){ctx.drawImage(this.texture,0,0,this.canvas.width,this.canvas.height);}else{ctx.drawImage(this.static,0,0);ctx.save();ctx.scale(this.canvas.width/W,this.canvas.height/H);const out=this.vertices.map(v=>this.point(v.x,v.y,p));for(const ids of this.dynamic)triangle(ctx,this.texture,ids.map(i=>this.vertices[i]),ids.map(i=>out[i]));ctx.restore();}
   if(this.tint){ctx.save();ctx.globalCompositeOperation='source-atop';ctx.fillStyle=`rgba(40,70,120,${this.tint})`;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);ctx.restore();}this.stats.renderMs=performance.now()-start;this.stats.frames++;return this.canvas;
  }
  setEnabled(name,on){if(!(name in this.enabled))throw Error('Unknown channel');this.enabled[name]=!!on;this.lastFrame=-Infinity;}
 }
 global.AstraMicro=AstraMicro;
})(window);
