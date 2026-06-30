import * as THREE from 'three';
import GUI from 'lil-gui';
import {PhysicsWorld} from '../Physic/PhysicsWorld.js';
import { PhysicalBall } from '../Physic/PhysicalBall.js';
import { WindBlowForce, MagneticCueBallForce } from '../IExternalForce.js';
import { TableGraphics } from '../Simulation/TableGraphics';
import { CueStickManager } from '../Simulation/CueStickManager';

export class SimulationApp {
    constructor() {
        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        this.physicsWorld = new PhysicsWorld();
        this.ballMeshes = [];
        this.tableWidth = 1.27; this.tableLength = 2.54;
        this.ballRadius = 0.028575; this.ballMass = 0.17;
        this.fixedTimeStep = 1 / 120; this.accumulator = 0; this.lastTime = 0;

        this.physicsWorld.registerExternalForce(new WindBlowForce());
        this.physicsWorld.registerExternalForce(new MagneticCueBallForce());

        this.tableGraphics = new TableGraphics(this);
        this.cueManager = new CueStickManager(this, this.tableGraphics.scene);

        this.initPhysicsWorld();
        this.initTelemetryDOM();
        this.initTelemetryBallSelect();
        this.initKeyboardSwitching();
        this.initGUI();
        this.initControlsInteraction();

        this.lastTime = performance.now();
        window.requestAnimationFrame(this.animate);
    }

    initPhysicsWorld() {
        const ballGeo = new THREE.SphereGeometry(this.ballRadius, 32, 32);

        // 1. الكرة البيضاء
        const cueBallPhys = new PhysicalBall(0, new THREE.Vector3(0, this.ballRadius, this.tableLength / 4), this.ballRadius, this.ballMass);
        const cueBallMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
        cueBallMesh.castShadow = true;
        this.tableGraphics.scene.add(cueBallMesh);
        this.physicsWorld.addBall(cueBallPhys);
        this.ballMeshes.push({ physics: cueBallPhys, mesh: cueBallMesh });

        // 2. مصفوفة بيانات الـ 15 كرة
        const rackData = [
            { id: 9, color: 0xffcc00, isStriped: true },
            { id: 7, color: 0x990011, isStriped: false },
            { id: 12, color: 0x222288, isStriped: true },
            { id: 15, color: 0x990011, isStriped: true },
            { id: 8, color: 0x111111, isStriped: false },
            { id: 1, color: 0xffcc00, isStriped: false },
            { id: 6, color: 0x008844, isStriped: false },
            { id: 10, color: 0x1133aa, isStriped: true },
            { id: 3, color: 0xdd2222, isStriped: false },
            { id: 14, color: 0x008844, isStriped: true },
            { id: 11, color: 0xdd2222, isStriped: true },
            { id: 2, color: 0x1133aa, isStriped: false },
            { id: 13, color: 0xff6600, isStriped: true },
            { id: 4, color: 0x441166, isStriped: false },
            { id: 5, color: 0xff6600, isStriped: false }
        ];

        const apexZ = -this.tableLength / 4;
        let dataIndex = 0;

        const rowSpacing = this.ballRadius * Math.sqrt(3) + 0.0001;
        const colSpacing = this.ballRadius * 2 + 0.0001;

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                const ballInfo = rackData[dataIndex++];
                const x = (col - row * 0.5) * colSpacing;
                const z = apexZ - (row * rowSpacing);
                const y = this.ballRadius;

                const ballPhys = new PhysicalBall(ballInfo.id, new THREE.Vector3(x, y, z), this.ballRadius, this.ballMass);
                this.physicsWorld.addBall(ballPhys);

                let ballMesh;
                if (ballInfo.isStriped) {
                    ballMesh = new THREE.Group();
                    const baseMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 }));
                    baseMesh.castShadow = true;
                    ballMesh.add(baseMesh);

                    const stripeGeo = new THREE.CylinderGeometry(this.ballRadius + 0.0002, this.ballRadius + 0.0002, this.ballRadius * 0.8, 32, 1, true);
                    const stripeMat = new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1, side: THREE.DoubleSide });
                    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
                    stripeMesh.rotation.x = Math.PI / 2;
                    ballMesh.add(stripeMesh);
                } else {
                    ballMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1 }));
                    ballMesh.castShadow = true;
                }

                // الرقم العائم فوق الكرة
                const numberSprite = this.createFloatingNumberSprite(ballInfo.id);
                numberSprite.position.set(0, this.ballRadius * 1.6, 0);
                ballMesh.add(numberSprite);

                this.tableGraphics.scene.add(ballMesh);
                this.ballMeshes.push({ physics: ballPhys, mesh: ballMesh, sprite: numberSprite });
            }
        }
    }

    /**
     * توليد لوحة نصية عائمة (Sprite) برقم الكرة تلتفت دائماً صوب الكاميرا
     */
    createFloatingNumberSprite(number) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.beginPath();
        ctx.arc(64, 64, 50, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'transparent';
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 55px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(number, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.12, 0.12, 1);

        return sprite;
    }

    initTelemetryDOM() {
        const panel = document.createElement('div');
        panel.id = 'physics-telemetry-panel';
        panel.style.cssText = `
            position: absolute; top: 10px; left: 10px; width: 300px;
            background: rgba(15, 23, 42, 0.95); color: #e2e8f0;
            font-family: 'Courier New', monospace; font-size: 12px;
            padding: 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            border: 1px solid #334155; z-index: 1000; pointer-events: auto; direction: ltr;
        `;

        panel.innerHTML = `
            <h3 style="margin-top: 0; border-bottom: 2px solid #00ffaa; padding-bottom: 5px; color: #00ffaa; font-family: sans-serif; font-size: 14px;">📊 اللوحة اللحظية للمختبر الفيزيائي</h3>
            <div style="margin-bottom: 10px;">
                <label for="telemetry-ball-select" style="font-family: sans-serif; color: #94a3b8;">اختر الكرة للمراقبة اللحظية:</label>
                <select id="telemetry-ball-select" style="background: #1e293b; color: #fff; border: 1px solid #475569; padding: 4px; width: 100%; margin-top: 5px; border-radius: 4px; font-family: sans-serif;"></select>
            </div>
            <div style="border-bottom: 1px solid #334155; padding: 4px 0; display: flex; justify-content: space-between;"><span>System Total KE:</span> <span id="tel-sys-ke" style="color: #10b981; font-weight: bold;">0.00000 J</span></div>
            <div style="border-bottom: 1px solid #334155; padding: 4px 0; display: flex; justify-content: space-between;"><span>Ball State:</span> <span id="tel-state" style="font-weight: bold;">-</span></div>
            <div style="border-bottom: 1px solid #334155; padding: 4px 0; display: flex; justify-content: space-between;"><span>Ball Indiv KE:</span> <span id="tel-ball-ke">0.00000 J</span></div>
            <div style="border-bottom: 1px solid #334155; padding: 4px 0; display: flex; justify-content: space-between;"><span>Linear Vel |v|:</span> <span id="tel-velocity">0.0000 m/s</span></div>
            <div style="border-bottom: 1px solid #334155; padding: 4px 0; display: flex; justify-content: space-between;"><span>Angular Vel |w|:</span> <span id="tel-angular">0.0000 rad/s</span></div>
            <div style="border-bottom: 1px solid #334155; padding: 4px 0; display: flex; justify-content: space-between;"><span>Contact Vel |vc|:</span> <span id="tel-vc">0.0000 m/s</span></div>
            <div style="padding: 4px 0; display: flex; justify-content: space-between;"><span>Kinetic Phase:</span> <span id="tel-phase" style="font-weight: bold;">-</span></div>
            <div style="color: #ffaa00; font-size:10px; margin-top:8px; font-family: sans-serif; border-top: 1px dashed #475569; padding-top: 5px;">💡 اسحب بالماوس مع زر الأيمن (أو Shift) للتصويب</div>
        `;
        document.body.appendChild(panel);

        this.domETotal = document.getElementById('tel-sys-ke');
        this.domCueState = document.getElementById('tel-state');
        this.domBallKE = document.getElementById('tel-ball-ke');
        this.domVelocity = document.getElementById('tel-velocity');
        this.domAngular = document.getElementById('tel-angular');
        this.domVc = document.getElementById('tel-vc');
        this.domPhase = document.getElementById('tel-phase');
        this.ballSelect = document.getElementById('telemetry-ball-select');
    }

    initTelemetryBallSelect() {
        if (!this.ballSelect) return;
        this.ballSelect.innerHTML = '';
        this.ballMeshes.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.physics.id;
            opt.innerText = item.physics.id === 0 ? "الكرة البيضاء (Cue Ball)" : `كرة الهدف الرقمية [${item.physics.id}]`;
            this.ballSelect.appendChild(opt);
        });
    }

    initGUI() {
        this.gui = new GUI({ title: '🕹️ لوحة هندسة القوانين الفيزيائية' });
        this.gui.domElement.style.top = '10px';
        this.gui.domElement.style.right = '10px';
        const config = this.physicsWorld.config;

        const fStrike = this.gui.addFolder('🏑 التحكم بالعصا والضربة');
        fStrike.add(config, 'strikeImpulse', 0.1, 3.0, 0.05).name('دفع الضربة (Impulse)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeImpulse: value }));
        fStrike.add(config, 'strikeOffsetX', -0.02, 0.02, 0.001).name('انحراف أفقي (X Offset)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeOffsetX: value }));
        fStrike.add(config, 'strikeOffsetY', -0.02, 0.02, 0.001).name('انحراف رأسي (Y Offset)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeOffsetY: value }));
        fStrike.add(this, 'triggerAdvancedStrike').name('🚀 إطلاق القوة');
        fStrike.open();

        const fEnvironment = this.gui.addFolder('🌍 البيئة والاحتكاك السطحي');
        fEnvironment.add(config, 'gravity', 0.0, 25.0, 0.1).name('الجاذبية (g)')
            .onChange(value => this.physicsWorld.updateParameters({ gravity: value }));
        fEnvironment.add(config, 'mu_sliding', 0.0, 0.8, 0.01).name('احتكاك الانزلاق (Sliding)')
            .onChange(value => this.physicsWorld.updateParameters({ mu_sliding: value }));
        fEnvironment.add(config, 'mu_rolling', 0.0, 0.1, 0.001).name('احتكاك التدحرج (Rolling)')
            .onChange(value => this.physicsWorld.updateParameters({ mu_rolling: value }));
        fEnvironment.add(config, 'k_air', 0.0, 0.05, 0.001).name('مقاومة الهواء (Air)')
            .onChange(value => this.physicsWorld.updateParameters({ k_air: value }));
        fEnvironment.add(config, 'sleepThreshold', 0.00001, 0.01, 0.000001).name('عتبة سكون الكرة (Energy)')
            .onChange(value => this.physicsWorld.updateParameters({ sleepThreshold: value }));

        const fCollisions = this.gui.addFolder('💥 مرونة التصادمات (Restitution)');
        fCollisions.add(config, 'e_ball', 0.0, 1.0, 0.01).name('مرونة كرة مع كرة')
            .onChange(value => this.physicsWorld.updateParameters({ e_ball: value }));
        fCollisions.add(config, 'e_cushion', 0.0, 1.0, 0.01).name('مرونة حواف الطاولة')
            .onChange(value => this.physicsWorld.updateParameters({ e_cushion: value }));
        fCollisions.add(config, 'cushion_friction', 0.0, 1.0, 0.05).name('احتكاك الكرة بالحافة')
            .onChange(value => this.physicsWorld.updateParameters({ cushion_friction: value }));

        this.physicsWorld.registeredForces.forEach(force => {
            const folder = this.gui.addFolder(`🔧 قانون خارجي: ${force.name}`);
            force.setupGUI(folder);
            folder.close();
        });
    }

    initControlsInteraction() {
        window.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('resize', this.onWindowResize);
    }

    initKeyboardSwitching() {
        window.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;

            let targetId = null;

            if (event.key >= '1' && event.key <= '9') {
                const num = parseInt(event.key);

                // FIX: كانت تستخدم event.metaKey (مفتاح Cmd/Win) بدلاً من event.shiftKey
                // وهذا يجعل اختصار "Shift + رقم" لا يعمل فعلياً على أغلب الأنظمة
                if (event.shiftKey) {
                    // حالة الـ Shift: الأرقام من 1 إلى 7 تتحول إلى (9 إلى 15)
                    if (num >= 1 && num <= 7) {
                        targetId = num + 8;
                    }
                } else {
                    // الحالة العادية: الأرقام من 1 إلى 8 تعطي الكرات من 1 إلى 8 مباشرة
                    if (num >= 1 && num <= 8) {
                        targetId = num;
                    }
                }
            }
            else if (event.key === '0' || event.key === ' ') {
                targetId = 0;
                if (event.key === ' ') event.preventDefault();
            }

            if (targetId !== null) {
                const ballExists = this.ballMeshes.some(item => item.physics.id === targetId);

                if (ballExists && this.ballSelect) {
                    this.ballSelect.value = targetId;
                    this.ballSelect.dispatchEvent(new Event('change'));

                    const panel = document.getElementById('physics-telemetry-panel');
                    if (panel) {
                        panel.style.borderColor = '#00ffaa';
                        setTimeout(() => { panel.style.borderColor = '#334155'; }, 200);
                    }
                }
            }
        });
    }

    onPointerDown(e) {
        const cueBall = this.ballMeshes[0].physics;
        const stopCamera = this.cueManager.handlePointerDown(e, cueBall);
        if (stopCamera) {
            this.tableGraphics.controls.enabled = false;
        }
    }

    onPointerMove(e) { this.cueManager.handlePointerMove(e); }
    onPointerUp() { this.cueManager.handlePointerUp(); this.tableGraphics.controls.enabled = true; }
    onWindowResize() { this.tableGraphics.handleResize(); }

    triggerAdvancedStrike() {
        const cueBall = this.ballMeshes[0].physics;
        if (!cueBall || !cueBall.isSleeping || cueBall.isPocketted || this.cueManager.isStrikingAnimation) return;
        this.cueManager.strikeProgress = 0;
        this.cueManager.isStrikingAnimation = true;
        this.cueManager.cueMesh.visible = true;
    }

    animate(timestamp) {
        window.requestAnimationFrame(this.animate);

        if (!this.lastTime) this.lastTime = timestamp;
        let frameTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        if (frameTime > 0.25) frameTime = 0.25;
        this.accumulator += frameTime;

        while (this.accumulator >= this.fixedTimeStep) {
            this.physicsWorld.update(this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
        }

        const cueBall = this.ballMeshes[0].physics;

        if (this.cueManager.isStrikingAnimation) {
            this.cueManager.animateStrike(frameTime, cueBall);
        } else {
            this.cueManager.updateState(cueBall);
        }

        for (let item of this.ballMeshes) {
            item.mesh.position.copy(item.physics.position);
            item.mesh.visible = !item.physics.isPocketted;

            if (!item.physics.isSleeping && !item.physics.isPocketted) {
                const deltaRotation = item.physics.angularVelocity.clone().multiplyScalar(this.fixedTimeStep);
                const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(deltaRotation.x, deltaRotation.y, deltaRotation.z, 'XYZ'));
                item.mesh.quaternion.multiplyQuaternions(quaternion, item.mesh.quaternion);
            }

            // إلغاء تأثير دوران الكرة على الرقم العائم ليبقى ثابتاً للأعلى
            if (item.sprite) {
                item.sprite.quaternion.copy(item.mesh.quaternion).invert();
            }
        }

        this.updateTelemetryUI();

        this.tableGraphics.controls.update();
        this.tableGraphics.renderer.render(this.tableGraphics.scene, this.tableGraphics.camera);
    }

    /**
     * دالة المعالجة الفيزيائية الفورية لرصد سرعة نقطة التلامس والطور الديناميكي للحركة
     */
    updateTelemetryUI() {
        const totalEnergy = this.physicsWorld.getTotalKineticEnergy();
        if (this.domETotal) this.domETotal.innerText = `${totalEnergy.toFixed(5)} J`;

        if (!this.ballSelect) return;
        const selectedId = parseInt(this.ballSelect.value) || 0;
        const targetBallItem = this.ballMeshes.find(item => item.physics.id === selectedId);

        if (targetBallItem) {
            const ball = targetBallItem.physics;

            if (this.domCueState) {
                this.domCueState.innerText = ball.isPocketted ? '🕳️ POCKETTED' : (ball.isSleeping ? '💤 SLEEPING' : '🔥 ACTIVE');
                this.domCueState.style.color = ball.isSleeping ? '#f59e0b' : '#10b981';
            }

            if (this.domBallKE) this.domBallKE.innerText = `${ball.getKineticEnergy().toFixed(5)} J`;
            const vMag = ball.velocity.length();
            const wMag = ball.angularVelocity.length();
            if (this.domVelocity) this.domVelocity.innerText = `${vMag.toFixed(4)} m/s`;
            if (this.domAngular) this.domAngular.innerText = `${wMag.toFixed(4)} rad/s`;

            const rVector = new THREE.Vector3(0, -ball.radius, 0);
            const tangentialVelocity = new THREE.Vector3().crossVectors(ball.angularVelocity, rVector);
            const v_relative = new THREE.Vector3().addVectors(ball.velocity, tangentialVelocity);
            const vcMag = v_relative.length();

            if (this.domVc) {
                this.domVc.innerText = `${vcMag.toFixed(4)} m/s`;
                this.domVc.style.color = vcMag > 0.005 ? '#f43f5e' : '#10b981';
            }

            if (this.domPhase) {
                if (ball.isSleeping) {
                    this.domPhase.innerText = "STATIONARY (سكون تام)";
                    this.domPhase.style.color = "#94a3b8";
                } else if (vcMag > 0.005) {
                    this.domPhase.innerText = "SLIDING (طور الانزلاق)";
                    this.domPhase.style.color = "#f43f5e";
                } else {
                    this.domPhase.innerText = "PURE ROLLING (تدحرج نقي)";
                    this.domPhase.style.color = "#38bdf8";
                }
            }
        }
    }
}
