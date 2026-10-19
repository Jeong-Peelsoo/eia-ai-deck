/* ASTRA deck renderer: official Cubism Core deformation + small wrist-local
 * presentation accent. Clocked by the host film, with mesh-attached laser anchor.
 * Requires Live2DCubismCore and ASTRA_WAIST_BUNDLE; no fetch/network dependency.
 */
(function(global){'use strict';
class AstraCubism {
 constructor({resolution=1024}={}){this.canvas=document.createElement('canvas');this.canvas.height=resolution;this.canvas.width=Math.round(resolution*1305/1534);this.ready=false;this.lastTime=NaN;this.loaded=this.init();}
 async init(){
  const C=global.Live2DCubismCore,b=global.ASTRA_WAIST_BUNDLE;if(!C||!b)throw Error('Cubism Core/model bundle missing');
  this.moc=C.Moc.fromArrayBuffer(Uint8Array.from(atob(b.moc),c=>c.charCodeAt(0)).buffer);if(!this.moc)throw Error('MOC3 load failed');
  const m=this.model=C.Model.fromMoc(this.moc),d=m.drawables,p=m.parameters;this.ids=Array.from(d.ids);this.params=Array.from(p.ids);this.head=this.ids.indexOf('HeadBase');this.mouth=this.ids.indexOf('MouthSmile');this.upper=this.ids.indexOf('UpperHand');
  if([this.head,this.mouth,this.upper].some(i=>i<0)||Array.from(d.maskCounts).some(n=>n)||m.offscreens.count)throw Error('Unsupported ASTRA model structure');
  if(Array.from(d.constantFlags).some(n=>(n&3)!==0))throw Error('Unsupported blend mode');
  p.values.set(p.defaultValues);m.update();this.rest=d.vertexPositions.map(v=>new Float32Array(v));this.positions=d.vertexPositions.map(v=>new Float32Array(v));
  const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
  const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=this.program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 pos;attribute vec2 uv;attribute vec2 neutralUv;uniform vec2 scale;uniform vec2 center;varying vec2 v;varying vec2 n;void main(){gl_Position=vec4((pos-center)*scale,0.,1.);v=vec2(uv.x,1.-uv.y);n=vec2(neutralUv.x,1.-neutralUv.y);}'));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v;varying vec2 n;uniform sampler2D tex;uniform sampler2D neutralTex;uniform float opacity;uniform float keepLipColor;void main(){vec4 c=texture2D(tex,v);if(keepLipColor>0.5){vec3 ref=texture2D(neutralTex,n).rgb;float l=dot(c.rgb,vec3(.2126,.7152,.0722));float r=max(dot(ref,vec3(.2126,.7152,.0722)),.04);c.rgb=clamp(ref*l/r,0.,1.);}gl_FragColor=vec4(c.rgb*c.a,c.a)*opacity;}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  this.loc={};for(const n of ['pos','uv','neutralUv']){this.loc[n]=gl.getAttribLocation(program,n);gl.enableVertexAttribArray(this.loc[n]);}for(const n of ['scale','center','opacity','keepLipColor'])this.loc[n]=gl.getUniformLocation(program,n);
  gl.uniform1i(gl.getUniformLocation(program,'tex'),0);gl.uniform1i(gl.getUniformLocation(program,'neutralTex'),1);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  this.textures=await Promise.all(b.textures.map(src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);for(const mode of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,mode,gl.LINEAR);for(const mode of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,mode,gl.CLAMP_TO_EDGE);resolve(tex);};im.onerror=()=>reject(Error('ASTRA texture load failed'));im.src=src;})));
  this.buffers=Array.from({length:4},()=>gl.createBuffer());
  // Coordinates measured from the expanded master, plus its 80px PSD border.
  // The tip is the center of the distal alpha silhouette, not an old-image ratio.
  this.tipAnchor=this.anchor(this.upper,356,628.2941176471);
  this.wristAnchor=this.anchor(this.upper,725,637);
  this.ready=true;this.render(0);return this;
 }
 set(id,value){const p=this.model.parameters,i=this.params.indexOf(id);if(i<0)throw Error('Missing parameter '+id);p.values[i]=Math.max(p.minimumValues[i],Math.min(p.maximumValues[i],value));}
 anchor(drawable,x,y){const c=this.model.canvasinfo,px=(x-c.CanvasOriginX)/c.PixelsPerUnit,py=(c.CanvasOriginY-y)/c.PixelsPerUnit,positions=this.rest[drawable],idx=this.model.drawables.indices[drawable];
  for(let i=0;i<idx.length;i+=3){const ids=Array.from(idx.slice(i,i+3)),a=ids.map(k=>[positions[k*2],positions[k*2+1]]),den=(a[1][1]-a[2][1])*(a[0][0]-a[2][0])+(a[2][0]-a[1][0])*(a[0][1]-a[2][1]);if(Math.abs(den)<1e-10)continue;const u=((a[1][1]-a[2][1])*(px-a[2][0])+(a[2][0]-a[1][0])*(py-a[2][1]))/den,v=((a[2][1]-a[0][1])*(px-a[2][0])+(a[0][0]-a[2][0])*(py-a[2][1]))/den,w=1-u-v;if(Math.min(u,v,w)>=-1e-5)return{drawable,ids,weights:[u,v,w]};}throw Error('ASTRA attachment outside mesh');
 }
 resolve(anchor){const ps=this.positions[anchor.drawable];return anchor.ids.reduce((p,i,k)=>({x:p.x+ps[2*i]*anchor.weights[k],y:p.y+ps[2*i+1]*anchor.weights[k]}),{x:0,y:0});}
 fingerPoint(){const p=this.resolve(this.tipAnchor),c=this.model.canvasinfo;return{u:(p.x*c.PixelsPerUnit+c.CanvasOriginX)/c.CanvasWidth,v:(c.CanvasOriginY-p.y*c.PixelsPerUnit)/c.CanvasHeight};}
 render(t,{handSlowStart=Infinity}={}){if(!this.ready)return this.canvas;if(t===this.lastTime&&handSlowStart===this.lastHandSlowStart)return this.canvas;this.lastTime=t;this.lastHandSlowStart=handSlowStart;const start=performance.now(),m=this.model,d=m.drawables;
  const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
  // Integrate the easing curve so the hand's phase never jumps as it slows.
  // Pure scene-time mapping also preserves the pose on pause and reverse seek.
  const settle=2,elapsed=Math.max(0,t-handSlowStart),u=Math.min(1,elapsed/settle);
  const slowdownIntegral=elapsed<settle?settle*(u*u*u-.5*u*u*u*u):elapsed-settle*.5;
  const handTime=t-.75*slowdownIntegral,handSpeed=1-.75*smooth(u);
  let blink=1;for(const event of [1.3,4.8,5.18,9.5]){const age=(t%12)-event;if(age>=0&&age<.25)blink=Math.min(blink,age<.085?1-smooth(age/.085):age<.12?0:smooth((age-.12)/.13));}
  const smile=.14+.84*(.5-.5*Math.cos(t*1.13+.35));
  this.set('ParamMouthForm',smile);this.set('ParamEyeLOpen',blink);this.set('ParamEyeROpen',blink);
  this.set('ParamAngleY',Math.sin(t*.95)*23);this.set('ParamAngleZ',Math.sin(t*.57+.3)*12);this.set('ParamASTRAUpperHand',Math.sin(handTime*1.6)*.9);this.set('ParamASTRALowerHand',Math.sin(handTime*.94+.5)*.5);this.set('ParamBodyAngleZ',Math.sin(t*.51)*4.2);
  m.update();for(let i=0;i<d.count;i++)this.positions[i].set(d.vertexPositions[i]);
  // Extra accent around the real wrist, not the editor's automatic body-center pivot.
  const pivot=this.resolve(this.wristAnchor),angle=(Math.sin(handTime*1.55)*2.6+Math.sin(handTime*2.7+.4)*.6)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),ps=this.positions[this.upper];
  for(let i=0;i<ps.length;i+=2){const x=ps[i]-pivot.x,y=ps[i+1]-pivot.y;ps[i]=pivot.x+x*cs-y*sn;ps[i+1]=pivot.y+x*sn+y*cs;}
  this.motion={smile,blink,upperWristDegrees:angle*180/Math.PI,handTime,handSpeed};
  const gl=this.gl,c=m.canvasinfo,loc=this.loc;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(loc.scale,2*c.PixelsPerUnit/c.CanvasWidth,2*c.PixelsPerUnit/c.CanvasHeight);gl.uniform2f(loc.center,(c.CanvasWidth*.5-c.CanvasOriginX)/c.PixelsPerUnit,(c.CanvasHeight*.5-c.CanvasOriginY)/c.PixelsPerUnit);
  const ranks=m.getRenderOrders(),order=Array.from({length:d.count},(_,i)=>i).sort((a,b)=>ranks[a]-ranks[b]);
  for(const i of order){if(d.opacities[i]<=0)continue;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[d.textureIndices[this.head]]);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[d.textureIndices[i]]);gl.uniform1f(loc.opacity,d.opacities[i]);gl.uniform1f(loc.keepLipColor,i===this.mouth?1:0);
   for(const [slot,name,array]of [[0,'pos',this.positions[i]],[1,'uv',d.vertexUvs[i]],[2,'neutralUv',d.vertexUvs[i===this.mouth?this.head:i]]]){gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[slot]);gl.bufferData(gl.ARRAY_BUFFER,array,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(loc[name],2,gl.FLOAT,false,0,0);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.buffers[3]);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices[i],gl.STATIC_DRAW);gl.drawElements(gl.TRIANGLES,d.indices[i].length,gl.UNSIGNED_SHORT,0);
  }d.resetDynamicFlags();this.renderMs=performance.now()-start;return this.canvas;
 }
}
global.AstraCubism=AstraCubism;
})(window);
