class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createExplosion(x, y, type = 'small') {
        const particleCount = type === 'final' ? 200 : 30;
        const colors = type === 'final' 
            ? ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff']
            : ['#ffffff'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
            const velocity = type === 'final' 
                ? 3 + Math.random() * 7
                : 2 + Math.random() * 3;
            
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: type === 'final' ? Math.random() * 6 + 2 : Math.random() * 3 + 1,
                life: 1.0,
                decay: type === 'final' ? 0.01 : 0.02
            });
        }
    }

    createFinalExplosion() {
        // Create multiple explosion points for a grand finale
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Center explosion
        this.createExplosion(centerX, centerY, 'final');
        
        // Surrounding explosions
        const radius = 200;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            setTimeout(() => {
                this.createExplosion(x, y, 'final');
            }, Math.random() * 500);
        }
        
        // Keep creating explosions for 3 seconds
        let explosionCount = 0;
        const explosionInterval = setInterval(() => {
            explosionCount++;
            if (explosionCount > 15) {
                clearInterval(explosionInterval);
                return;
            }
            
            const x = Math.random() * this.canvas.width;
            const y = Math.random() * this.canvas.height;
            this.createExplosion(x, y, 'final');
        }, 200);
    }

    update() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Apply gravity
            particle.vy += 0.1;
            
            // Apply friction
            particle.vx *= 0.99;
            particle.vy *= 0.99;
            
            // Update life
            particle.life -= particle.decay;
            
            // Draw particle
            if (particle.life > 0) {
                this.ctx.save();
                this.ctx.globalAlpha = particle.life;
                this.ctx.fillStyle = particle.color;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = particle.color;
                
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.restore();
            } else {
                // Remove dead particles
                this.particles.splice(i, 1);
            }
        }
        
        if (this.particles.length > 0) {
            requestAnimationFrame(() => this.update());
        }
    }

    clear() {
        this.particles = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Star field background
class StarField {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.stars = [];
        this.initStars();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initStars() {
        const starCount = 200;
        for (let i = 0; i < starCount; i++) {
            this.stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1,
                opacity: Math.random() * 0.5 + 0.5
            });
        }
    }

    update() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (const star of this.stars) {
            // Update position
            star.y += star.speed;
            
            // Wrap around
            if (star.y > this.canvas.height) {
                star.y = 0;
                star.x = Math.random() * this.canvas.width;
            }
            
            // Draw star
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    animate() {
        this.update();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}