/**
 * NEON RACER - Gesture Controlled Game
 * V.1.0.4
 */

// --- Configuration ---
const CONFIG = {
    SPEED_INITIAL: 600,
    SPEED_MAX: 2000,
    ACCEL: 20,
    FOV: 700,
    LANES: 3,
    SPAWN_RATE: 0.8 // Obstacle frequency
};

// --- Utilities ---
const lerp = (a, b, t) => a + (b - a) * t;

// --- Head Controller (Face Mesh) ---
const ARTIFACT_VERTICES = {
    CUBE: [ // Shield (Green)
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // Front Face vertices
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]      // Back Face vertices
    ],
    OCTAHEDRON: [ // Multiplier (Purple)
        [0, -1, 0], [0, 1, 0], // Top/Bottom tips
        [-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1] // Middle ring
    ],
    HOURGLASS: [ // Slow Mo (Blue)
        [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], // Top Square
        [0, 0, 0], // Center
        [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1] // Bottom Square
    ]
};

// Indices for wireframe lines
const ARTIFACT_INDICES = {
    CUBE: [
        [0, 1], [1, 2], [2, 3], [3, 0], // Front Face
        [4, 5], [5, 6], [6, 7], [7, 4], // Back Face
        [0, 4], [1, 5], [2, 6], [3, 7]  // Connecting Lines
    ],
    OCTAHEDRON: [
        [0, 2], [0, 3], [0, 4], [0, 5], // Top Pyramid
        [1, 2], [1, 3], [1, 4], [1, 5], // Bottom Pyramid
        [2, 3], [3, 4], [4, 5], [5, 2]  // Middle Ring
    ],
    HOURGLASS: [
        [0, 1], [1, 2], [2, 3], [3, 0], // Top Square
        [0, 4], [1, 4], [2, 4], [3, 4], // Top to Center
        [4, 5], [4, 6], [4, 7], [4, 8], // Center to Bottom
        [5, 6], [6, 7], [7, 8], [8, 5]  // Bottom Square
    ]
};

class HeadController {
    constructor(game) {
        this.game = game;
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('handsCanvas'); // Fixed ID
        this.ctx = this.canvas.getContext('2d');
        this.isReady = false;

        this.faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        this.faceMesh.onResults(this.onResults.bind(this));

        // Manual Skip Button
        const skipBtn = document.getElementById('btnSkipCamera');
        if (skipBtn) {
            skipBtn.onclick = () => {
                console.log("User requested manual override.");
                this.enableKeyboardMode();
            };
        }

        this.camera = new Camera(this.video, {
            onFrame: async () => { await this.faceMesh.send({ image: this.video }); },
            width: 320, height: 240
        });
    }

    async start() {
        console.log("Checking camera permissions...");

        try {
            // Start the lib directly
            // Race between Camera Start and a Timeout
            const cameraPromise = this.camera.start();

            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve('TIMEOUT'), 5000); // 5 Seconds Timeout
            });

            const result = await Promise.race([cameraPromise, timeoutPromise]);

            if (result === 'TIMEOUT') {
                console.warn("Camera init timed out. Forcing Keyboard Mode.");
                this.enableKeyboardMode();
            } else {
                // Success
                this.isReady = true;
                document.getElementById('cameraStatus').textContent = "NEURAL LINK ESTABLISHED";
                document.getElementById('btnStart').disabled = false;
                document.getElementById('btnStart').disabled = false;
                document.getElementById('loader').classList.remove('active');

                // Attempt Auto-Start Audio (Best Effort)
                if (this.game.sound) {
                    this.game.sound.resume(); // Try to wake context
                    this.game.sound.playMenuAmbience();
                    this.game.sound.startMusic();
                    this.game.sound.setMusicMuffled(true);
                }
            }
        } catch (err) {
            console.error("Camera init failed (Pre-check):", err);
            // DO NOT ALERT HERE - just switch silently or with console log to avoid blocking
            this.enableKeyboardMode();
        }
    }

    enableKeyboardMode() {
        if (this.isReady) return; // Prevent double init

        this.isReady = true;
        document.getElementById('cameraStatus').textContent = "MANUAL OVERRIDE ENGAGED";
        document.getElementById('btnStart').disabled = false;
        document.getElementById('loader').classList.remove('active');

        // Attempt Auto-Start Audio
        if (this.game.sound) {
            this.game.sound.resume();
            this.game.sound.playMenuAmbience();
            this.game.sound.startMusic();
            this.game.sound.setMusicMuffled(true);
        }
        const camText = document.querySelector('.cam-text');
        if (camText) camText.textContent = "MANUAL CONTROL";

        // Keyboard bindings
        window.addEventListener('keydown', (e) => {
            if (this.game.state !== 'PLAYING') return;

            if (e.key === 'ArrowLeft') {
                this.game.setUseInput(0); // Left
            } else if (e.key === 'ArrowRight') {
                this.game.setUseInput(2); // Right
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this.game.state !== 'PLAYING') return;

            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                this.game.setUseInput(1); // Center
            }
        });
    }

    onResults(results) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Mirror current context for drawing overlay only (Flip Horizontal)
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];

            // Draw Mesh (Optional debugging)
            // drawConnectors(this.ctx, landmarks, FACEMESH_TESSELATION, {color: '#30ff3020', lineWidth: 1});

            // --- Head Lean Logic ---
            // Leaning based on Nose (1) relative to Center
            const nose = landmarks[1];

            // Mirroring Check:
            // Input image is standard.
            // If CSS is scaleX(-1), then Visual Left is Input Right (x > 0.5).
            // If user Leans Left (Visual Left), their nose x should be > 0.5 (Input Right).

            // User Leans RIGHT (Visual Right):
            // Camera sees head move to Input LEFT (x decreasing).
            // So nose.x < 0.5

            let lane = 1; // Default to center
            let debugText = "CENTER";

            // Deadzone of 0.1
            if (nose.x > 0.6) {
                // Input Right -> Visual Left
                lane = 0; // LEFT
                debugText = "LEFT (Visual)";
            }
            else if (nose.x < 0.4) {
                // Input Left -> Visual Right
                lane = 2; // RIGHT
                debugText = "RIGHT (Visual)";
            }
            // Else Center (1)

            this.game.setUseInput(lane);

            // Draw Head Line for visual feedback
            const w = this.canvas.width;
            const h = this.canvas.height;
            const leftEar = landmarks[234]; // Still need these for drawing the line
            const rightEar = landmarks[454];
            const lx = leftEar.x * w;
            const ly = leftEar.y * h;
            const rx = rightEar.x * w;
            const ry = rightEar.y * h;

            this.ctx.strokeStyle = (lane === 0) ? '#ff0055' : ((lane === 2) ? '#ffe600' : '#00f3ff');
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(lx, ly);
            this.ctx.lineTo(rx, ry);
            this.ctx.stroke();

            // Debug Text on Canvas
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.font = 'bold 24px monospace';
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(`STEER: ${debugText}`, -w + 10, 30);
            this.ctx.restore();
        }
        this.ctx.restore();
    }
} // End HeadController

// --- Audio System ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5; // Master Volume
        this.masterGain.connect(this.ctx.destination);

        this.engineOsc = null;
        this.engineGain = null;
        this.isMuted = false;

        // Music State
        this.musicPlaying = false;
        this.nextNoteTime = 0;
        this.beatCount = 0;

        // Global Music Filter (for Muffled effect in Menu)
        this.musicFilter = this.ctx.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = 400; // Start Muffled
        this.musicFilter.connect(this.masterGain);
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setMusicMuffled(isMuffled) {
        if (!this.musicFilter) return;
        const target = isMuffled ? 400 : 20000;
        this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.5);
    }

    playUIClick() {
        if (this.isMuted) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // High "Tech" blip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.05);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.1);
    }

    playMenuAmbience() {
        if (this.ambientOsc || this.isMuted) return; // Already playing
        this.resume();

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0.15;
        this.ambientGain.connect(this.masterGain);

        // Drone Cluster for Sci-Fi feel
        const freqs = [110, 112, 164, 220]; // A2, slightly detuned, E3, A3
        this.ambientOsc = [];

        freqs.forEach(f => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = f;
            osc.connect(this.ambientGain);
            osc.start();
            this.ambientOsc.push(osc);
        });

        // LFO for movement
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.2; // Slow wobble
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 50; // Filter modulation depth

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();

        // Reroute ambient through filter
        this.ambientGain.disconnect();
        this.ambientGain.connect(filter);
        filter.connect(this.masterGain);

        this.stopAmbience = () => {
            if (this.ambientGain) {
                this.ambientGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2);
                setTimeout(() => {
                    this.ambientOsc.forEach(o => o.stop());
                    lfo.stop();
                    this.ambientOsc = null;
                }, 2000);
            }
        };
    }

    // --- SFX ---
    playCoin() {
        if (this.isMuted) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(2000, t + 0.1);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.3);
    }
    // ... (existing methods kept by context)

    // ...



    playPowerup(type) {
        if (this.isMuted) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Type based sounds could be cool, but generic nice sound for now
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.linearRampToValueAtTime(880, t + 0.2); // Octave up
        osc.frequency.linearRampToValueAtTime(1760, t + 0.4); // Two octaves up

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.5);
    }

    playExplosion() {
        if (this.isMuted) return;
        this.resume();

        const t = this.ctx.currentTime;
        // Noise buffer
        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5s
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

        noise.connect(gain);
        gain.connect(this.masterGain);
        noise.start(t);
    }

    playShieldBreak() {
        if (this.isMuted) return;
        this.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.3);
    }

    // --- Engine ---
    startEngine() {
        if (this.engineOsc) return;
        this.resume();

        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();

        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 100;

        // Low pass filter to muffle it
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 400;

        this.engineGain.gain.value = 0.1; // Quiet idle

        this.engineOsc.connect(this.filter);
        this.filter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);

        this.engineOsc.start();
    }

    updateEngine(speedRatio) {
        if (!this.engineOsc) return;
        // Pitch: 80Hz idle -> 200Hz max
        const targetFreq = 80 + speedRatio * 120;
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);

        // Volume: Louder (0.2) when fast
        this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.15, this.ctx.currentTime, 0.1);

        this.filter.frequency.setTargetAtTime(200 + speedRatio * 600, this.ctx.currentTime, 0.1); // Open filter
    }

    // --- Music Sequencer (Simple Synthwave Bass) ---
    startMusic() {
        if (this.musicPlaying) return;
        this.musicPlaying = true;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduleNextNote();
    }

    scheduleNextNote() {
        if (!this.musicPlaying) return;

        const secondsPerBeat = 60.0 / 110.0; // 110 BPM
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playBeat(this.nextNoteTime, this.beatCount);
            this.nextNoteTime += secondsPerBeat * 0.5; // Eighth notes
            this.beatCount++;
        }

        requestAnimationFrame(this.scheduleNextNote.bind(this));
    }

    playBeat(time, beat) {
        if (this.isMuted) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.musicFilter); // Connect to Filter instead of Master

        // Simple Bassline Pattern (16 step)
        // Root: C (65.41 Hz)
        const step = beat % 16;
        const notes = [
            65.41, 65.41, 0, 65.41,  // C C _ C
            77.78, 77.78, 0, 77.78,  // Eb Eb _ Eb
            58.27, 58.27, 0, 58.27,  // Bb Bb _ Bb
            98.00, 0, 87.31, 0       // G _ F _
        ];

        const freq = notes[step];
        if (freq > 0) {
            osc.type = 'sawtooth';
            osc.frequency.value = freq;

            // Filter envelope simulation via gain
            gain.gain.setValueAtTime(0.2, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

            osc.start(time);
            osc.stop(time + 0.2);
        }

        // Kick Drum on beats 0, 4, 8, 12
        if (step % 4 === 0) {
            const kOsc = this.ctx.createOscillator();
            const kGain = this.ctx.createGain();
            kOsc.connect(kGain);
            kGain.connect(this.musicFilter); // Connect to Filter

            kOsc.frequency.setValueAtTime(150, time);
            kOsc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            kGain.gain.setValueAtTime(1, time);
            kGain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

            kOsc.start(time);
            kOsc.stop(time + 0.5);
        }
    }
}

// --- Game Engine ---
class RacerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // State: 'MENU', 'PLAYING', 'GAMEOVER'
        this.state = 'MENU';

        // Stats
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('neon_high_score')) || 0;
        document.getElementById('menuHighScore').textContent = Math.floor(this.highScore);

        // Health
        this.maxHealth = 3;
        this.health = 3;
        this.isInvulnerable = false;

        // World
        this.speed = 400; // Idle speed for menu
        this.distance = 0;
        this.player = { x: 0, lane: 1 }; // Entities
        this.obstacles = [];
        this.particles = [];
        this.powerups = []; // New
        this.coins = [];    // New
        this.coinsCollected = 0; // New
        this.scenery = []; // New - Cityscape buildings
        this.trail = []; // New - TRON Light Trails

        // Loop vars
        this.lastTime = 0;
        this.spawnTimer = 0;
        this.powerupTimer = 0;
        this.coinTimer = 0;

        // Power-up States
        this.scoreMultiplier = 1;
        this.timeScale = 1.0;
        this.shieldActive = false;
        this.slowMoTimer = 0;
        this.multiplierTimer = 0;

        // Audio
        this.sound = new SoundManager();
        this.lastWarningTime = 0;

        this.setupUI();
        requestAnimationFrame(this.loop.bind(this));
    }

    setupUI() {
        // Menu Elements
        this.ui = {
            menu: document.getElementById('mainMenu'),
            hud: document.getElementById('gameHUD'),
            gameOver: document.getElementById('gameOverScreen'),
            score: document.getElementById('scoreValue'),
            speed: document.getElementById('speedValue'),
            health: document.getElementById('healthValue'),
            coins: document.getElementById('coinValue'),
            lanes: [
                document.getElementById('laneLeft'),
                document.getElementById('laneCenter'),
                document.getElementById('laneRight')
            ]
        };

        // UI Sound Bindings
        const playClick = () => {
            if (this.sound) this.sound.playUIClick();
            // Also try to start ambience on first interaction
            if (this.sound) this.sound.playMenuAmbience();
        };

        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.addEventListener('click', playClick);
        });

        // Trigger Ambience on any initial interaction
        const startAmbience = () => {
            if (this.state === 'MENU' && this.sound) {
                this.sound.playMenuAmbience();
                this.sound.startMusic(); // Start bassline
                this.sound.setMusicMuffled(true); // Keep it muffled
                window.removeEventListener('click', startAmbience);
                window.removeEventListener('keydown', startAmbience);
            }
        };
        window.addEventListener('click', startAmbience);
        window.addEventListener('keydown', startAmbience);

        // Logic Bindings
        document.getElementById('btnStart').onclick = () => {
            if (this.sound && this.sound.stopAmbience) this.sound.stopAmbience(); // Stop drone when playing
            this.setState('PLAYING');
        };
        document.getElementById('btnRetry').onclick = () => {
            this.setState('PLAYING');
        };
        document.getElementById('btnMenu').onclick = () => {
            this.setState('MENU');
            // Restart ambience
            if (this.sound) this.sound.playMenuAmbience();
        };
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setUseInput(laneIndex) {
        if (this.state === 'PLAYING') {
            this.player.lane = laneIndex;
            // Update HUD graphics
            this.ui.lanes.forEach((el, i) => {
                if (i === laneIndex) el.classList.add('active');
                else el.classList.remove('active');
            });
        }
    }

    setState(newState) {
        this.state = newState;

        // Reset UI Layers
        this.ui.menu.classList.remove('active');
        this.ui.hud.classList.remove('active');
        this.ui.gameOver.classList.remove('active');

        if (newState === 'MENU') {
            this.ui.menu.classList.add('active');
            this.speed = 300;
            this.obstacles = [];
            this.powerups = [];
            this.coins = [];

            this.powerups = [];
            this.coins = [];

            // Muffle music if returning to menu
            if (this.sound) this.sound.setMusicMuffled(true);

            // Reset gameplay modifiers in menu too, just in case
            this.timeScale = 1.0;
        }
        else if (newState === 'PLAYING') {
            this.ui.hud.classList.add('active');
            this.score = 0;
            this.speed = CONFIG.SPEED_INITIAL;
            this.obstacles = [];
            this.powerups = [];
            this.coins = [];
            this.player.lane = 1;

            // Reset Health & Shield
            this.health = this.maxHealth;
            this.shieldActive = false;
            this.updateHealthUI();

            // Reset Powerup/Coin related states
            this.scoreMultiplier = 1;
            this.multiplierTimer = 0;
            this.timeScale = 1.0;
            this.slowMoTimer = 0;

            this.spawnTimer = 0;
            this.coinsCollected = 0;

            // Spawn Test Powerup (Immediate visual feedback)
            this.powerups.push({ lane: 0, z: 1500, type: 'SHIELD', active: true });

            if (this.ui.coins) this.ui.coins.textContent = "0";

            // Audio Resume
            this.sound.resume();
            this.sound.startEngine();
            this.sound.resume();
            this.sound.startEngine();
            this.sound.startMusic();
            this.sound.setMusicMuffled(false); // UN-MUFFLE
        }
        else if (newState === 'GAMEOVER') {
            this.ui.gameOver.classList.add('active');

            // Save Score
            const fScore = Math.floor(this.score);
            document.getElementById('finalScore').textContent = fScore;

            if (fScore > this.highScore) {
                this.highScore = fScore;
                localStorage.setItem('neon_high_score', this.highScore);
            }
            document.getElementById('finalHighScore').textContent = this.highScore;
            document.getElementById('menuHighScore').textContent = this.highScore;
        }
    }

    updateHealthUI() {
        // Create shield bars
        const container = document.getElementById('healthContainer');
        if (container) {
            container.innerHTML = '';
            const maxBars = 3; // Enforce limit
            // Sanity check health
            if (this.health > maxBars) this.health = maxBars;

            for (let i = 0; i < maxBars; i++) {
                const bar = document.createElement('div');
                bar.className = 'shield-bar';
                if (i < this.health) bar.classList.add('active');
                container.appendChild(bar);
            }
        } else {
            console.error("Health container not found!");
        }
    }

    triggerDamage() {
        if (this.isInvulnerable) return;

        this.health--;
        this.updateHealthUI();

        // Screen Shake / Red Flash caused by CSS class on body or canvas
        document.body.classList.add('damage-shake');
        setTimeout(() => document.body.classList.remove('damage-shake'), 400);

        if (this.health <= 0) {
            this.setState('GAMEOVER');
        } else {
            // I-frames
            this.isInvulnerable = true;
            // Blink player car visualization?
            setTimeout(() => this.isInvulnerable = false, 1500);
        }
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame(this.loop.bind(this));
    }

    update(dt) {
        // Engine Sound
        if (this.state === 'PLAYING') {
            const ratio = this.speed / CONFIG.SPEED_MAX;
            this.sound.updateEngine(ratio);
        }

        if (this.state !== 'PLAYING') return;

        // Apply Time Warp to Delta Time for Game World (Obstacles, etc)
        const gameDt = dt * this.timeScale;

        // Timers (Real time)
        if (this.shieldActive) {
            // Shield stays until hit
        }

        if (this.timeScale < 1.0) {
            this.slowMoTimer -= dt; // Use real dt for timer
            if (this.slowMoTimer <= 0) this.timeScale = 1.0;
        }

        if (this.scoreMultiplier > 1) {
            this.multiplierTimer -= dt;
            if (this.multiplierTimer <= 0) this.scoreMultiplier = 1;
        }

        // --- Player Movement (UNSCALED - Hyper responsive) ---
        // Smooth lane transition
        const targetX = (this.player.lane - 1); // Fix: Use player.lane (0,1,2) -> (-1,0,1)
        // Move towards target
        const diff = targetX - this.player.x;
        this.player.x += diff * 10 * dt; // Fast smooth
        this.player.tilt = -diff * 30; // Tilt visuals

        // Speed Progression (Scaled by Time Warp for "World Speed", but internal value rises normally)
        this.speed = Math.min(CONFIG.SPEED_MAX, this.speed + 10 * gameDt);
        this.distance += this.speed * gameDt;

        // Update Score
        this.score += Math.floor(this.speed * gameDt * 0.1 * this.scoreMultiplier);
        this.ui.score.textContent = this.score;

        // UI Speed Bar
        this.ui.speed.style.width = `${(this.speed / CONFIG.SPEED_MAX) * 100}%`;
        this.ui.speed.textContent = Math.floor(this.speed); // Fix Zero Velocity Text

        // Multiplier UI overlay
        if (this.scoreMultiplier > 1) {
            this.ui.score.textContent = `${this.score} (2X)`;
            this.ui.score.style.color = '#9900FF';
        } else {
            this.ui.score.style.color = '#fff';
        }

        // --- Spawning ---
        this.spawnTimer += gameDt;

        // --- Spawning ---
        this.spawnTimer += gameDt;

        // Min spacing based on speed
        const minSpacing = 1.0 * this.speed; // Reduced gap factor slightly
        const lastObs = this.obstacles.length > 0 ? this.obstacles[this.obstacles.length - 1] : null;
        const lastZ = lastObs ? lastObs.z : 0;

        // Fix: Spawn further out (4000) so we don't run out of buffer at high speeds
        // Also always spawn if empty
        const canSpawn = (this.obstacles.length === 0) || (4000 - lastZ) > minSpacing;

        if (this.spawnTimer > CONFIG.SPAWN_RATE && canSpawn) {
            this.obstacles.push({
                lane: Math.floor(Math.random() * 3) - 1,
                z: 4000,
                active: true,
                type: 'OBSTACLE'
            });
            this.spawnTimer = 0;
        }

        // Spawn Powerups (Frequency: 5s)
        // Spawn Powerups (Frequency: 5s)
        this.powerupTimer += gameDt;
        if (this.powerupTimer > 5 && canSpawn) {
            // Guarantee spawn (No random check)
            const types = ['SHIELD', 'SLOWMO', 'MULT'];
            const type = types[Math.floor(Math.random() * types.length)];
            this.powerups.push({
                lane: Math.floor(Math.random() * 3) - 1,
                z: 4000,
                type: type,
                active: true
            });
            this.powerupTimer = 0;
        }

        // Update Scenery (Cityscape)
        this.updateScenery(gameDt);

        // Update Trail
        this.updateTrail(gameDt);



        // Spawn Coins (Frequency: 0.2s - burst)
        this.coinTimer += gameDt;
        if (this.coinTimer > 0.2 && canSpawn) {
            // Check if we overlap with obstacle? 
            // We checked Z spacing generally, so it's fine.
            this.coins.push({
                lane: Math.floor(Math.random() * 3) - 1,
                z: 4000,
                active: true
            });
            this.coinTimer = 0;
        }

        // Move Everything (SCALED)
        [this.obstacles, this.powerups, this.coins].forEach(arr => {
            arr.forEach(o => o.z -= this.speed * gameDt);
        });

        // Update Particles (Sparks & Stars)
        this.particles.forEach(p => {
            p.z -= this.speed * gameDt; // World moves back

            // Apply Physics & Aging to ALL temporary particles (Sparks, Squares, Flashes)
            if (p.isSpark || p.isSquare || p.isFlash) {
                // Physics (if available)
                if (p.vx !== undefined && p.vy !== undefined) {
                    p.x += p.vx * gameDt;
                    p.y += p.vy * gameDt;
                    p.vy += 500 * gameDt; // Gravity
                }

                // Aging
                const decayRate = p.isFlash ? 10.0 : (p.isSquare ? 2.0 : 2.0);
                p.life -= gameDt * decayRate;
            }
        });

        // Filter out old
        this.obstacles = this.obstacles.filter(o => o.z > -200);
        this.powerups = this.powerups.filter(o => o.z > -200);
        this.coins = this.coins.filter(o => o.z > -200);
        // Keep particles that are NOT temporary OR (if temporary) still alive
        this.particles = this.particles.filter(p => p.z > -200 && (!(p.isSpark || p.isSquare || p.isFlash) || p.life > 0));

        // Collisions (Only Playing)
        if (this.state === 'PLAYING') this.checkCollisions();

        // Audio Proximity 
        if (this.state === 'PLAYING') {
            const nearest = this.obstacles.find(o => o.active && o.z < 300 && o.z > -50);
            if (nearest) {
                const now = Date.now();
                if (now - this.lastWarningTime > 500) {
                    this.playWarningSound();
                    this.lastWarningTime = now;
                }
            }
        }
    }

    activatePowerup(type) {
        console.log("Powerup:", type);

        if (type === 'SHIELD') {
            this.shieldActive = true;
            this.health = Math.min(this.health + 1, this.maxHealth); // Visual only now essentially
            this.updateHealthUI();
        } else if (type === 'SLOWMO') {
            this.timeScale = 0.5;
            this.slowMoTimer = 5.0; // 5 seconds real time
        } else if (type === 'MULT') {
            this.scoreMultiplier = 2;
            this.multiplierTimer = 10.0;
        }
    }

    endSlowMo() {
        // Reset effects if needed
    }

    playWarningSound() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(e => console.log("Audio resume failed", e));
        }

        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sawtooth';
            // Low buzz frequency
            osc.frequency.setValueAtTime(100, this.audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(50, this.audioCtx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.15);
        } catch (e) {
            console.error("Audio error:", e);
        }
    }

    drawArtifact(ctx, type, x, y, z, size) {
        ctx.save(); // Isolation

        // Map Game Types to Shape Types
        let shapeType = type;
        if (type === 'SHIELD') shapeType = 'CUBE';
        if (type === 'SLOWMO') shapeType = 'HOURGLASS';
        if (type === 'MULT') shapeType = 'OCTAHEDRON';

        if (!ARTIFACT_VERTICES[shapeType] || !ARTIFACT_INDICES[shapeType]) {
            ctx.restore();
            return;
        }

        const vertices = ARTIFACT_VERTICES[shapeType];
        const indices = ARTIFACT_INDICES[shapeType];

        const color = type === 'SHIELD' ? '#00FF00' :
            type === 'SLOWMO' ? '#00FFFF' :
                '#9900FF'; // Green, Cyan, Purple

        // Rotation
        const t = Date.now() / 1000;
        const rx = t;
        const ry = t * 1.5;
        const rz = t * 0.5;

        // Transform Vertices
        const transformed = vertices.map(v => {
            // Apply Rotation (Simple Euler Rz * Ry * Rx)
            let vx = v[0], vy = v[1], vz = v[2];

            // Rotate X
            let y1 = vy * Math.cos(rx) - vz * Math.sin(rx);
            let z1 = vy * Math.sin(rx) + vz * Math.cos(rx);
            vy = y1; vz = z1;

            // Rotate Y
            let x1 = vx * Math.cos(ry) - vz * Math.sin(ry);
            let z2 = vx * Math.sin(ry) + vz * Math.cos(ry);
            vx = x1; vz = z2;

            // Rotate Z
            let x2 = vx * Math.cos(rz) - vy * Math.sin(rz);
            let y2 = vx * Math.sin(rz) + vy * Math.cos(rz);
            vx = x2; vy = y2;

            // Scale
            vx *= size; vy *= size; vz *= size;

            // Bobbing (Octahedron/Multiplier)
            if (type === 'OCTAHEDRON' || type === 'MULT') {
                vy += Math.sin(t * 5) * 20;
            }

            return { x: vx + x, y: vy + y, z: vz + z };
        });

        // Project
        const projected = transformed.map(v => this.project(v.x, v.y, v.z));

        // Draw Wireframe
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.beginPath();

        indices.forEach(pair => {
            const p1 = projected[pair[0]];
            const p2 = projected[pair[1]];
            if (p1.scale > 0 && p2.scale > 0) {
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
        });
        ctx.stroke();

        // Glowy Center
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        // Draw a simple fill for the first 3 vertices to give valid volume feel or just center
        // Let's just fill a small circle at center
        const center = this.project(x, y, z);
        if (center.scale > 0) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, size * center.scale * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore(); // End Isolation
    }

    spawnExplosion(x, y, z, color) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x,
                y: y,
                z: z,
                vx: (Math.random() - 0.5) * 500, // Velocity X
                vy: (Math.random() - 0.5) * 500 - 200, // Velocity Y (Upward bias)
                life: 1.0, // 1 second life
                color: color,
                isSpark: true
            });
        }
    }

    spawnCoinBurst(x, y, z) {
        // Gold Squares Burst
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x,
                y: y,
                z: z,
                vx: (Math.random() - 0.5) * 600,
                vy: (Math.random() - 0.5) * 600 - 100,
                life: 1.0, // Increased from 0.5
                color: '#FFD700',
                isSquare: true // New Type
            });
        }
        // Bright Flash
        this.particles.push({
            x: x,
            y: y,
            z: z,
            life: 0.3, // Increased from 0.1
            isFlash: true // New Type
        });
    }

    // Old sound methods removed/replaced


    checkCollisions() {
        // Helper
        const checkHit = (obj) => {
            // Updated: Tighter Z check (70 instead of 100) to match car bumper (Z=50) better
            // Ideally hits right as it touches.
            return (obj.active && obj.z < 70 && obj.z > -50 && Math.abs(this.player.x - obj.lane) < 0.6);
        };

        // Obstacles
        this.obstacles.forEach(obs => {
            if (checkHit(obs)) {
                obs.active = false;

                // --- SHIELD LOGIC (STRICT) ---
                if (this.shieldActive) {
                    this.shieldActive = false;
                    this.sound.playShieldBreak();

                    // Visual Flash
                    document.body.classList.add('shield-flash');
                    setTimeout(() => document.body.classList.remove('shield-flash'), 200);

                    // Shield Break Particles (Green) at impact Z
                    this.spawnExplosion(obs.lane * 300, 0, 50, '#00FF00'); // Force Z=50

                    // CRITICAL: RETURN IMMEDIATELY (No damage, no speed loss)
                    return;
                }
                // --- END SHIELD LOGIC ---

                this.triggerDamage();
                this.sound.playExplosion();
            }
        });

        // Powerups
        this.powerups.forEach(p => {
            if (checkHit(p)) {
                p.active = false;
                this.activatePowerup(p.type);
                this.sound.playPowerup(p.type);
                // Color based on type
                const color = p.type === 'SHIELD' ? '#00FF00' : p.type === 'SLOWMO' ? '#00FFFF' : '#9900FF';
                this.spawnExplosion(p.lane * 300, 0, 50, color); // Force Z=50
            }
        });

        // Coins
        this.coins.forEach(c => {
            if (checkHit(c)) {
                c.active = false;
                this.score += 100 * this.scoreMultiplier; // Use Multiplier
                this.sound.playCoin();
                this.coinsCollected++;
                this.ui.coins.textContent = this.coinsCollected;

                // Spark Effect - Force at Car Z (50) for perfect impact feel
                // this.spawnCoinBurst(c.lane * 300, 0, c.z); 
                this.spawnCoinBurst(c.lane * 300, 0, 50);
            }
        });
    }

    // --- Rendering ---
    project(xWorld, yWorld, zWorld) {
        // Standard Perspective Projection
        const camX = 0;
        const camY = 400; // Adjusted to match LaneMarker ground level (was 800)
        const camZ = -600; // Camera distance behind

        const rx = xWorld - camX;
        const ry = yWorld - camY;
        const rz = zWorld - camZ;

        if (rz <= 10) return { x: 0, y: 0, scale: 0 };

        const fov = CONFIG.FOV;
        const scale = fov / rz;

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // FIXED: Removed * 400 multiplier which was causing massive horizontal stretching
        const sx = cx + rx * scale;
        const sy = cy - ry * scale;

        return { x: sx, y: sy, scale };
    }

    drawLowPolyShield(ctx, cx, cy, cz, radius) {
        const time = Date.now() * 0.001;
        const glow = 1 + 0.1 * Math.sin(time * 5);
        const r = radius * 250; // Adjusted scale for manual projection (was 200 * 400 implicitly)

        // Icosahedron Vertices (Approx)
        const phi = (1 + Math.sqrt(5)) / 2;
        const vertices = [
            [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
            [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
            [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]
        ].map(v => ({ x: v[0], y: v[1], z: v[2] }));

        const cosT = Math.cos(time);
        const sinT = Math.sin(time);

        // Center of screen/projection
        const canvasCx = this.canvas.width / 2;
        const canvasCy = this.canvas.height / 2;

        const projected = vertices.map(v => {
            // Rotate Y
            let x = v.x * cosT - v.z * sinT;
            let z = v.x * sinT + v.z * cosT;
            let y = v.y;

            // Scale Model
            x *= r;
            y *= r;
            z *= r;

            // World Position
            const wx = cx + x;
            const wy = cy + y; // cy is usually 0
            const wz = cz + z;

            // Project Manually (Matching Game Object Logic, not Grid Logic)
            // Grid logic uses *400 which makes things massive.
            // Game logic: xScreen = cx + xWorld * scale

            // Cam Relative
            const rz = wz - (-600); // CamZ
            if (rz <= 10) return { x: 0, y: 0, scale: 0 };

            const scale = CONFIG.FOV / rz;

            // Projection
            const sx = canvasCx + wx * scale;
            // Align Y with Player Y logic: cy + 400 * scale is ground.
            // We want shield center to be at player center.
            // Player draws at: cy + 400 * scale. 
            // So let's base it on that.
            const sy = canvasCy + (400 - wy) * scale;
            // Note: wy is 0 for ground. So Center is Ground. 
            // If we want it raised, wy should be positive? 
            // Player visual is a rect. Center is roughly ground level.

            return { x: sx, y: sy, scale };
        });

        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';

        ctx.beginPath();
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const d = Math.pow(vertices[i].x - vertices[j].x, 2) +
                    Math.pow(vertices[i].y - vertices[j].y, 2) +
                    Math.pow(vertices[i].z - vertices[j].z, 2);
                if (d < 5) { // Empirically connects neighbors in icosahedron
                    const p1 = projected[i];
                    const p2 = projected[j];
                    if (p1.scale > 0 && p2.scale > 0) {
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                    }
                }
            }
        }
        ctx.stroke();
        ctx.fill();
    }

    draw() {
        // BG Clear
        this.ctx.fillStyle = '#020205';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // 0. Draw Background Elements (Sun & City)
        this.drawRetroSun(cx, cy);
        this.drawScenery(cx, cy);

        // 1. Draw Sun/Environment 
        // Retro Grid (Floor)
        // Color depends on Time Warp (Cyan vs Pink)
        this.ctx.strokeStyle = this.timeScale < 1.0 ? '#00FFFF' : '#ff00ff';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();

        // Vertical lines removed per user request
        /*
        for (let i = -20; i <= 20; i += 2) {
            const p1 = this.project(i * 2, 0, 0);
            const p2 = this.project(i * 2, 0, 4000);
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
        }
        this.ctx.globalAlpha = 0.2;
        this.ctx.stroke();
        */

        // Horizontal lines removed per user request
        this.ctx.globalAlpha = 1.0;

        // 2. Draw Particles
        // 2. Draw Particles
        this.particles.forEach(p => {
            const projection = this.project(p.x, p.y, p.z);
            if (projection.scale <= 0) return; // Behind camera

            const sx = projection.x;
            const sy = projection.y;
            const scale = projection.scale;

            this.ctx.globalAlpha = p.isSpark ? Math.max(0, p.life) : Math.min(1, scale);

            if (p.isFlash) {
                // Draw Flash
                this.ctx.globalAlpha = p.life * 10; // Fades fast (0.1 -> 0)
                this.ctx.fillStyle = '#fff';
                this.ctx.shadowBlur = 50;
                this.ctx.shadowColor = '#fff';
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, 50 * scale, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
            else if (p.isSquare) {
                // Draw Gold Square
                this.ctx.globalAlpha = Math.max(0, p.life * 2); // Fade out
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = p.color;
                const size = 15 * scale; // Increased size for visibility
                this.ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
                this.ctx.shadowBlur = 0;
            }
            else {
                // Standard Particle (Sparks)
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, (p.isSpark ? 10 : 2) * scale, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        this.ctx.globalAlpha = 1.0;

        // 3. Draw Lane Markers
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 4;
        [-0.5, 0.5].forEach(lx => {
            for (let i = 0; i < 10; i++) {
                const zStart = i * 200 - (this.distance % 200);
                const zEnd = zStart + 100;
                if (zStart < 0) continue;
                const scale1 = CONFIG.FOV / (CONFIG.FOV + zStart);
                const scale2 = CONFIG.FOV / (CONFIG.FOV + zEnd);
                const x1 = cx + (lx * 300) * scale1;
                const y1 = cy + 400 * scale1;
                const x2 = cx + (lx * 300) * scale2;
                const y2 = cy + 400 * scale2;
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }
        });

        // 4. Draw Powerups (3D ARTIFACTS)
        this.powerups.forEach(p => {
            if (!p.active) return; // FIX: Don't draw collected powerups

            const scale = CONFIG.FOV / (CONFIG.FOV + p.z);
            const x = (p.lane) * 300;
            const y = 0;
            const z = p.z;

            if (z > 10) {
                this.drawArtifact(this.ctx, p.type, x, y, z, 80);
            }
        });

        // 4b. Draw Coins
        this.coins.forEach(c => {
            if (!c.active) return; // FIX: Don't draw collected coins

            const scale = CONFIG.FOV / (CONFIG.FOV + c.z);
            const x = cx + ((c.lane) * 300) * scale;
            const y = cy + 400 * scale;
            const s = 80 * scale;
            if (scale > 0) {
                this.ctx.globalAlpha = 1;
                this.ctx.fillStyle = '#ffd700';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#ffd700';
                const rot = Date.now() / 200;
                const width = s * Math.abs(Math.cos(rot));
                this.ctx.beginPath();
                this.ctx.ellipse(x, y - s, width / 2, s / 2, 0, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#b8860b';
                this.ctx.lineWidth = 3 * scale;
                this.ctx.beginPath();
                this.ctx.ellipse(x, y - s, width / 3, s / 3, 0, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.shadowBlur = 0;
            }
        });

        // 5. Draw Obstacles
        this.obstacles.forEach(obs => {
            const scale = CONFIG.FOV / (CONFIG.FOV + obs.z);
            const x = cx + ((obs.lane) * 300) * scale;
            const y = cy + 400 * scale;
            const s = 100 * scale;

            if (scale > 0) {
                const time = Date.now();
                const mod = time % 600;
                let glitchX = 0;
                if (mod > 500) glitchX = (Math.random() - 0.5) * 20;

                const pulse = Math.sin(time / 200) * 2 + 3;

                this.ctx.save();
                this.ctx.strokeStyle = '#ff0055';
                this.ctx.lineWidth = pulse * scale;
                this.ctx.fillStyle = 'rgba(255, 0, 50, 0.2)';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#ff0055';

                const rx = x - s / 2 + glitchX;
                const ry = y - s;

                this.ctx.beginPath();
                this.ctx.rect(rx, ry, s, s);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.moveTo(rx, ry);
                this.ctx.lineTo(rx + s, ry + s);
                this.ctx.moveTo(rx + s, ry);
                this.ctx.lineTo(rx, ry + s);
                this.ctx.lineWidth = 1 * scale;
                this.ctx.stroke();
                this.ctx.restore();
            }
        });

        // 6. Draw Player
        const pScale = CONFIG.FOV / (CONFIG.FOV + 50);
        const px = cx + (this.player.x * 300) * pScale;
        const py = cy + 400 * pScale;
        const ps = 120 * pScale;

        // Draw Trails BEFORE Player (so they emerge from back)
        this.drawTrails(cx, cy);

        this.ctx.fillStyle = '#00f3ff';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.fillRect(px - ps / 2, py - ps / 2, ps, ps / 2);
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(px - ps / 4, py - ps / 2 - ps / 4, ps / 2, ps / 4);
        this.ctx.fillStyle = '#ff0000';
        this.ctx.shadowColor = '#ff0000';
        this.ctx.fillRect(px - ps / 2 + 5, py - ps / 2 + 5, 10, 10);
        this.ctx.fillRect(px + ps / 2 - 15, py - ps / 2 + 5, 10, 10);

        // Active Shield Visual (Hex Cage)
        if (this.shieldActive) {
            const carWorldX = this.player.x * 300; // FIX: Match player world scale
            const carWorldY = 0;
            const carWorldZ = 50;
            this.drawLowPolyShield(this.ctx, carWorldX, carWorldY, carWorldZ, 0.6); // slightly larger

            // Text Feedback
            this.ctx.save();
            this.ctx.font = "bold 20px monospace";
            this.ctx.fillStyle = "#00FF00";
            this.ctx.textAlign = "center";
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "#00FF00";
            // Text stays centered
            this.ctx.fillText("SHIELD ONLINE", cx, cy - 100);
            this.ctx.restore();
        }

        // SlowMo Indicator
        if (this.timeScale < 1.0) {
            this.ctx.save();
            this.ctx.font = "bold 20px monospace";
            this.ctx.fillStyle = "#00FFFF"; // Cyan
            this.ctx.textAlign = "center";
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "#00FFFF";
            this.ctx.fillText("SLOWMO ONLINE", cx, cy - 130);
            this.ctx.restore();
        }

        // Multiplier Indicator
        if (this.scoreMultiplier > 1) {
            this.ctx.save();
            this.ctx.font = "bold 20px monospace";
            this.ctx.fillStyle = "#9900FF"; // Purple
            this.ctx.textAlign = "center";
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "#9900FF";
            this.ctx.fillText("MULT ONLINE", cx, cy - 160);
            this.ctx.restore();
        }

        this.ctx.shadowBlur = 0;
    }

    updateTrail(dt) {
        // Spawn Point
        // Limit spawn rate to avoid too many points? Frame rate based is usually fine for smooth curves.
        // We spawn at Car Z position (50).
        // Store World X.
        const px = this.player.x * 300;

        this.trail.push({
            x: px,
            z: 50, // Car Z
            life: 0.5 // Short trail (0.5s)
        });

        // Move & Age
        this.trail.forEach(p => {
            p.z -= this.speed * dt;
            p.life -= dt;
        });

        // Filter
        this.trail = this.trail.filter(p => p.life > 0);
    }

    drawTrails(cx, cy) {
        if (this.trail.length < 2) return;

        this.ctx.save();

        // Ribbon Style
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Dynamic Glow based on speed
        const intensity = (this.speed / CONFIG.SPEED_MAX);
        this.ctx.shadowColor = '#00FFFF';
        this.ctx.shadowBlur = 10 + intensity * 20;
        this.ctx.strokeStyle = '#00FFFF';
        this.ctx.lineWidth = 4 + intensity * 2;

        const carWidth = 120; // Approx visual width
        const tireOffset = carWidth * 0.35; // Tires are slightly inset

        // Draw Left Ribbon
        this.drawSingleRibbon(cx, cy, -tireOffset);

        // Draw Right Ribbon
        this.drawSingleRibbon(cx, cy, tireOffset);

        this.ctx.restore();
    }

    drawSingleRibbon(cx, cy, xOffset) {
        this.ctx.beginPath();
        let started = false;

        // Draw from tail (oldest) to head (newest)
        // Array push adds to end, so index 0 is oldest.
        // We want to fade out the tail.

        for (let i = 0; i < this.trail.length - 1; i++) {
            const p1 = this.trail[i];
            const p2 = this.trail[i + 1];

            // Project
            const proj1 = this.project(p1.x + xOffset, 0, p1.z);
            const proj2 = this.project(p2.x + xOffset, 0, p2.z);

            if (proj1.scale > 0 && proj2.scale > 0) {
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.moveTo(proj1.x, proj1.y);
                this.ctx.lineTo(proj2.x, proj2.y);
                // Alpha segment
                this.ctx.globalAlpha = Math.max(0, p1.life); // Scale alpha by life
                this.ctx.stroke();
                this.ctx.restore();
            }
        }
    }

    updateScenery(dt) {
        // Spawn remote buildings
        // Chance to spawn
        if (Math.random() < 0.05) { // 5% chance per frame (approx 3 per sec at 60fps)
            const side = Math.random() > 0.5 ? 1 : -1;
            const x = side * (1000 + Math.random() * 2000); // Far out (+/- 1000 to 3000)
            const z = 6000;
            const w = 200 + Math.random() * 300;
            const h = 500 + Math.random() * 1000;
            this.scenery.push({ x, z, w, h, active: true });
        }

        // Move
        this.scenery.forEach(b => {
            b.z -= this.speed * dt * 0.5; // Parallax: Move slower than foreground (0.5x speed)
        });

        // Filter
        this.scenery = this.scenery.filter(b => b.z > -500);
    }

    drawRetroSun(cx, cy) {
        const radius = 250;
        const sunY = cy - 100; // Horizon level

        this.ctx.save();

        // 1. Glow
        this.ctx.shadowBlur = 50;
        this.ctx.shadowColor = '#FF00FF';

        // 2. Gradient
        const grad = this.ctx.createLinearGradient(cx, sunY - radius, cx, sunY + radius);
        grad.addColorStop(0, '#FFDD00'); // Yellow Top
        grad.addColorStop(0.5, '#FF5500'); // Orange Mid
        grad.addColorStop(1, '#9900FF'); // Purple Bottom

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(cx, sunY, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // 3. Scanlines (Clear stripes)
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = '#000';

        const time = Date.now() / 1000;
        // Draw multiple horizontal bars
        for (let i = 0; i < 10; i++) {
            const h = 5 + i * 2; // Progressive thickness
            const yOffset = (time * 20 + i * 40) % (radius * 2) - radius + sunY;

            // Only draw in lower half mainly, but standard style cuts whole sun
            // Let's do fixed bands for classic look
            const bandY = sunY + radius * 0.2 + (i * 20); // Start lower

            if (bandY < sunY + radius) {
                this.ctx.fillRect(cx - radius, bandY, radius * 2, h * 0.5);
            }
        }

        this.ctx.restore();
    }

    drawScenery(cx, cy) {
        this.ctx.save();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#330044'; // Dark Purple wireframe

        this.scenery.forEach(b => {
            // Project Base
            const pBase = this.project(b.x, 0, b.z);
            if (pBase.scale <= 0) return;

            const scale = pBase.scale;
            const sx = pBase.x;
            const sy = pBase.y;

            // Dimensions
            const sw = b.w * scale;
            const sh = b.h * scale;

            // Draw Building (Wireframe Box)
            // Color based on distance?
            const alpha = Math.min(1, b.z / 6000);
            this.ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + (1 - alpha) * 0.5})`; // Cyan fade in
            this.ctx.fillStyle = `rgba(10, 0, 20, ${0.8})`;

            this.ctx.beginPath();
            this.ctx.rect(sx - sw / 2, sy - sh, sw, sh);
            this.ctx.fill();
            this.ctx.stroke();

            // Internal grid lines for building
            this.ctx.beginPath();
            this.ctx.moveTo(sx - sw / 2, sy - sh / 2);
            this.ctx.lineTo(sx + sw / 2, sy - sh / 2); // Mid H
            this.ctx.moveTo(sx, sy - sh);
            this.ctx.lineTo(sx, sy); // Mid V
            this.ctx.strokeStyle = `rgba(255, 0, 255, ${0.1 + (1 - alpha) * 0.2})`;
            this.ctx.stroke();
        });

        this.ctx.restore();
    }
}

// Init
// Init
window.addEventListener('load', () => {
    console.log("Initializing Game...");

    // Safety Check
    const gameCanvas = document.getElementById('gameCanvas');
    const handsCanvas = document.getElementById('handsCanvas');

    if (!gameCanvas) {
        alert("CRITICAL ERROR: 'gameCanvas' not found in DOM.");
        return;
    }
    if (!handsCanvas) {
        alert("CRITICAL ERROR: 'handsCanvas' not found in DOM.");
        return;
    }

    try {
        const game = new RacerGame();

        // Check if FaceMesh (MediaPipe) is loaded
        if (typeof FaceMesh === 'undefined') {
            console.warn("FaceMesh not loaded (Offline?). Switching to KEYBOARD MODE.");
            alert("Dependencies failed to load (Check Internet). Defaulting to Keyboard Mode.");

            // Manually unlock game since HeadController won't exist
            document.getElementById('cameraStatus').textContent = "OFFLINE MODE";
            document.getElementById('btnStart').disabled = false;
            document.getElementById('loader').classList.remove('active');

            // Add direct keyboard listeners since HeadController isn't created
            window.addEventListener('keydown', (e) => {
                if (game.state !== 'PLAYING') return;
                if (e.key === 'ArrowLeft') game.setUseInput(0);
                else if (e.key === 'ArrowRight') game.setUseInput(2);
            });
            window.addEventListener('keyup', (e) => {
                if (game.state !== 'PLAYING') return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') game.setUseInput(1);
            });
            return;
        }

        const headCtrl = new HeadController(game);
        headCtrl.start();

    } catch (e) {
        console.error("Critical Init Error:", e);
        alert("Game crashed on init: " + e.message + "\nStack: " + e.stack);
    }
});
