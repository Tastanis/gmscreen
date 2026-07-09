class ScrollerEffects {
    constructor(starsCanvas, particlesCanvas, reducedMotion=false) {
        this.starsCanvas=starsCanvas; this.particlesCanvas=particlesCanvas; this.starsCtx=starsCanvas.getContext('2d'); this.particlesCtx=particlesCanvas.getContext('2d');
        this.reducedMotion=reducedMotion; this.stars=[]; this.particles=[]; this.running=false; this.raf=0; this.resize=this.resize.bind(this); window.addEventListener('resize',this.resize); this.resize();
        const count=reducedMotion?25:150; for(let i=0;i<count;i++) this.stars.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.7+.3,s:Math.random()*.35+.08,a:Math.random()*.55+.3});
    }
    resize(){for(const canvas of [this.starsCanvas,this.particlesCanvas]){canvas.width=innerWidth;canvas.height=innerHeight;}}
    start(){if(this.running)return;this.running=true;this.frame();}
    burst(x,y,final=false){if(this.reducedMotion)return;const count=final?180:28;const colors=final?['#ff453a','#30d158','#0a84ff','#ffd60a','#bf5af2','#fff']:['#fff'];for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2,speed=Math.random()*(final?7:3)+2;this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,c:colors[i%colors.length],r:Math.random()*(final?5:2)+1,life:1,d:final?.012:.025});}}
    frame(){if(!this.running)return;const w=this.starsCanvas.width,h=this.starsCanvas.height,s=this.starsCtx,p=this.particlesCtx;s.fillStyle='#000';s.fillRect(0,0,w,h);for(const star of this.stars){star.y+=star.s;if(star.y>h){star.y=0;star.x=Math.random()*w;}s.globalAlpha=star.a;s.fillStyle='#fff';s.beginPath();s.arc(star.x,star.y,star.r,0,Math.PI*2);s.fill();}s.globalAlpha=1;p.clearRect(0,0,w,h);for(let i=this.particles.length-1;i>=0;i--){const q=this.particles[i];q.x+=q.vx;q.y+=q.vy;q.vy+=.08;q.life-=q.d;if(q.life<=0){this.particles.splice(i,1);continue;}p.globalAlpha=q.life;p.fillStyle=q.c;p.beginPath();p.arc(q.x,q.y,q.r,0,Math.PI*2);p.fill();}p.globalAlpha=1;this.raf=requestAnimationFrame(()=>this.frame());}
    destroy(){this.running=false;cancelAnimationFrame(this.raf);window.removeEventListener('resize',this.resize);this.starsCtx.clearRect(0,0,this.starsCanvas.width,this.starsCanvas.height);this.particlesCtx.clearRect(0,0,this.particlesCanvas.width,this.particlesCanvas.height);this.particles=[];}
}

