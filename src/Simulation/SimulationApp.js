import * as THREE from 'three';
import GUI from 'lil-gui';
import { PhysicsWorld, PhysicalBall } from '../Physic/';
import { WindBlowForce, MagneticCueBallForce } from './../IExternalForce.js';
import { TableGraphics } from './TableGraphics.js';
import { CueStickManager } from './CueStickManager.js';

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

        // تهيئة الوحدات المنفصلة الجديدة
        this.tableGraphics = new TableGraphics(this);
        this.cueManager = new CueStickManager(this, this.tableGraphics.scene);

        this.initPhysicsWorld();
        this.initTelemetryDOM();
        this.initGUI();
        this.initControlsInteraction();

        this.lastTime = performance.now();
        window.requestAnimationFrame(this.animate);

        window.requestAnimationFrame(this.animate);
    }

    initPhysicsWorld() {
        const ballGeo = new THREE.SphereGeometry(this.ballRadius, 32, 32);

        // 1. تهيئة الكرة البيضاء في مكانها السليم
        const cueBallPhys = new PhysicalBall(0, new THREE.Vector3(0, this.ballRadius, this.tableLength / 4), this.ballRadius, this.ballMass);
        const cueBallMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
        cueBallMesh.castShadow = true;
        this.tableGraphics.scene.add(cueBallMesh);
        this.physicsWorld.addBall(cueBallPhys);
        this.ballMeshes.push({ physics: cueBallPhys, mesh: cueBallMesh });

        // 2. مصفوفة البيانات الدقيقة للـ 15 كرة (الأرقام، الألوان، ونوع التصميم السادة/المخطط) متوافقة مع الصورة
        const rackData = [
            { id: 9, color: 0xffcc00, isStriped: true },  // صفراء مخططة (رأس المثلث)
            { id: 7, color: 0x990011, isStriped: false }, // عنابي سادة
            { id: 12, color: 0x222288, isStriped: true },  // زرقاء مخططة
            { id: 15, color: 0x990011, isStriped: true },  // عنابي مخططة
            { id: 8, color: 0x111111, isStriped: false }, // سوداء (في المنتصف تماماً)
            { id: 1, color: 0xffcc00, isStriped: false }, // صفراء سادة
            { id: 6, color: 0x008844, isStriped: false }, // خضراء سادة
            { id: 10, color: 0x1133aa, isStriped: true },  // زرقاء مخططة
            { id: 3, color: 0xdd2222, isStriped: false }, // حمراء سادة
            { id: 14, color: 0x008844, isStriped: true },  // خضراء مخططة
            { id: 11, color: 0xdd2222, isStriped: true },  // حمراء مخططة
            { id: 2, color: 0x1133aa, isStriped: false }, // زرقاء سادة
            { id: 13, color: 0xff6600, isStriped: true },  // برتقالية مخططة
            { id: 4, color: 0x441166, isStriped: false }, // بنفسجية سادة
            { id: 5, color: 0xff6600, isStriped: false }  // برتقالية سادة
        ];

        const apexZ = -this.tableLength / 4;
        let dataIndex = 0;

        // حساب المسافات البينية الهرمية مع إضافة هامش مجهري آمن يمنع التداخل الأولي
        const rowSpacing = this.ballRadius * Math.sqrt(3) + 0.0001;
        const colSpacing = this.ballRadius * 2 + 0.0001;

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                const ballInfo = rackData[dataIndex++];
                const x = (col - row * 0.5) * colSpacing;
                const z = apexZ - (row * rowSpacing);
                const y = this.ballRadius;

                // تهيئة كائن الفيزياء للكرة وتفعيله للصدم والاصطدام المستمر
                const ballPhys = new PhysicalBall(ballInfo.id, new THREE.Vector3(x, y, z), this.ballRadius, this.ballMass);
                this.physicsWorld.addBall(ballPhys);

                // بناء الهيكل البصري للكرات السادة والمخططة
                let ballMesh;
                if (ballInfo.isStriped) {
                    ballMesh = new THREE.Group();
                    const baseMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 }));
                    baseMesh.castShadow = true;
                    ballMesh.add(baseMesh);

                    // الأسطوانة الدائرية الملتفة (The Stripe)
                    const stripeGeo = new THREE.CylinderGeometry(this.ballRadius + 0.0002, this.ballRadius + 0.0002, this.ballRadius * 0.8, 32, 1, true);
                    const stripeMat = new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1, side: THREE.DoubleSide });
                    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
                    stripeMesh.rotation.x = Math.PI / 2;
                    ballMesh.add(stripeMesh);
                } else {
                    ballMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1 }));
                    ballMesh.castShadow = true;
                }

                this.tableGraphics.scene.add(ballMesh);
                this.ballMeshes.push({ physics: ballPhys, mesh: ballMesh });
            }
        }
    }

    initPhysicsGUI() {
        // 1. إنشاء لوحة GUI رئيسية وتحديد عنوانها وموقعها
        const gui = new GUI({ title: '⚙️ متحكم المعاملات الفيزيائية' });
        gui.domElement.style.top = '10px';
        gui.domElement.style.right = '10px';

        const config = this.physicsWorld.config;

        // 2. مجلد التحكم في احتكاك السطح ومقاومة الهواء (القماش والبيئة)
        const clothFolder = gui.addFolder('🪢 الطاولة والقماش');
        clothFolder.add(config, 'mu_sliding', 0.05, 0.50, 0.01)
            .name('احتكاك الانزلاق (μk)')
            .onChange(value => this.physicsWorld.updateParameters({ mu_sliding: value }));

        clothFolder.add(config, 'mu_rolling', 0.005, 0.08, 0.001)
            .name('مقاومة التدحرج (μr)')
            .onChange(value => this.physicsWorld.updateParameters({ mu_rolling: value }));

        clothFolder.add(config, 'k_air', 0.0, 0.05, 0.001)
            .name('مقاومة الهواء')
            .onChange(value => this.physicsWorld.updateParameters({ k_air: value }));

        // 3. مجلد التحكم في معاملات الارتداد (الصدم الديناميكي)
        const bounceFolder = gui.addFolder('💥 الارتداد والتصادم');
        bounceFolder.add(config, 'e_ball', 0.80, 1.0, 0.01)
            .name('ارتداد الكرات (e)')
            .onChange(value => this.physicsWorld.updateParameters({ e_ball: value }));

        bounceFolder.add(config, 'e_cushion', 0.50, 0.95, 0.01)
            .name('ارتداد حواف المطاط (ec)')
            .onChange(value => this.physicsWorld.updateParameters({ e_cushion: value }));

        bounceFolder.add(config, 'cushion_friction', 0.0, 0.6, 0.01)
            .name('احتكاك المطاط مماسياً')
            .onChange(value => this.physicsWorld.updateParameters({ cushion_friction: value }));

        // 4. مجلد التحكم في قوة واتجاه ضربة العصا والـ Spin
        const strikeFolder = gui.addFolder('🥍 إعدادات ضربة العصا');
        strikeFolder.add(config, 'strikeImpulse', 0.1, 4.0, 0.05)
            .name('قوة الدفع (J)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeImpulse: value }));

        strikeFolder.add(config, 'strikeOffsetX', -0.02, 0.02, 0.001)
            .name('انحراف الدوران (Spin X)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeOffsetX: value }));

        strikeFolder.add(config, 'strikeOffsetY', -0.02, 0.02, 0.001)
            .name('انحراف الدوران (Spin Y)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeOffsetY: value }));

        // 5. ربط قوى القوانين الخارجية المتواجدة بالمشروع (الرياح والحقل المغناطيسي) مع الـ GUI الخاص بها
        if (this.physicsWorld.registeredForces) {
            this.physicsWorld.registeredForces.forEach(force => {
                const forceFolder = gui.addFolder(`🌀 قانون: ${force.name}`);
                force.setupGUI(forceFolder);
            });
        }

        // فتح القوائم افتراضياً لسهولة التعديل
        clothFolder.open();
        bounceFolder.open();
    }

    initControlsInteraction() {
        window.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('resize', this.onWindowResize);
    }

    onPointerDown(e) {
        const cueBall = this.ballMeshes[0].physics;
        const stopCamera = this.cueManager.handlePointerDown(e, cueBall);
        if (stopCamera) {
            this.tableGraphics.controls.enabled = false;
        }
    }

    onPointerMove(e) {
        this.cueManager.handlePointerMove(e);
    }

    onPointerUp() {
        this.cueManager.handlePointerUp();
        this.tableGraphics.controls.enabled = true;
    }

    onWindowResize() {
        this.tableGraphics.handleResize();
    }

    triggerAdvancedStrike() {
        const cueBall = this.ballMeshes[0].physics;

        // إصلاح الأخطاء البرمجية للـ Scope والتحقق من سلامة كائنات العصا والفيزياء الحالية
        if (!cueBall || !cueBall.isSleeping || cueBall.isPocketted || this.cueManager.isStrikingAnimation) return;

        // تفعيل بدء أنيميشن العصا البصري بطريقة سليمة لا تتعارض مع الدوران
        this.cueManager.strikeProgress = 0;
        this.cueManager.isStrikingAnimation = true;
        this.cueManager.cueMesh.visible = true;
    }

    initTelemetryDOM() {
        const div = document.createElement('div');
        div.style.position = 'absolute'; div.style.top = '20px'; div.style.left = '20px'; div.style.padding = '15px';
        div.style.background = 'rgba(10, 10, 10, 0.9)'; div.style.color = '#00ffaa'; div.style.fontFamily = 'monospace';
        div.style.borderRadius = '6px'; div.style.border = '1px solid #333'; div.style.pointerEvents = 'none'; div.style.width = '260px';
        div.innerHTML = `
            <h3 style="margin:0 0 8px 0; color:#fff; font-size:14px;">🎛️ لوحة المختبر البرمجي</h3>
            <div>طاقة النظام الكلية: <span id="e-total">0</span> J</div>
            <div>حالة البيضاء: <span id="cue-state">Sleeping</span></div>
            <div style="color: #ffaa00; font-size:11px; margin-top:5px;">💡 اسحب بالماوس مع زر الأيمن (أو Shift) للتصويب</div>
        `;
        document.body.appendChild(div);
        this.domETotal = document.getElementById('e-total');
        this.domCueState = document.getElementById('cue-state');
    }

    initGUI() {
        // 1. استخدام نفس اللوحة الرئيسية الحالية لديك
        this.gui = new GUI({ title: '🕹️ لوحة هندسة القوانين الفيزيائية' });
        const config = this.physicsWorld.config;

        // 2. مجلد التحكم بالعصا والضربة (مدمج مع أحداث التحديث اللحظي)
        const fStrike = this.gui.addFolder('🏑 التحكم بالعصا والضربة');
        fStrike.add(config, 'strikeImpulse', 0.1, 5.0, 0.05)
            .name('دفع الضربة (Impulse)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeImpulse: value }));
            
        fStrike.add(config, 'strikeOffsetX', -0.02, 0.02, 0.001)
            .name('انحراف أفقي (X Offset)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeOffsetX: value }));
            
        fStrike.add(config, 'strikeOffsetY', -0.02, 0.02, 0.001)
            .name('انحراف رأسي (Y Offset)')
            .onChange(value => this.physicsWorld.updateParameters({ strikeOffsetY: value }));
            
        fStrike.add(this, 'triggerAdvancedStrike').name('🚀 إطلاق القوة');
        fStrike.open();

        // 3. مجلد البيئة والاحتكاك السطحي (تحديث فوري لمعادلات الانزلاق والتدحرج النقي)
        const fEnvironment = this.gui.addFolder('🌍 البيئة والاحتكاك السطحي');
        fEnvironment.add(config, 'gravity', 0.0, 25.0, 0.1)
            .name('الجاذبية (g)')
            .onChange(value => this.physicsWorld.updateParameters({ gravity: value }));
            
        fEnvironment.add(config, 'mu_sliding', 0.0, 0.8, 0.01)
            .name('احتكاك الانزلاق (Sliding)')
            .onChange(value => this.physicsWorld.updateParameters({ mu_sliding: value }));
            
        fEnvironment.add(config, 'mu_rolling', 0.0, 0.1, 0.001)
            .name('احتكاك التدحرج (Rolling)')
            .onChange(value => this.physicsWorld.updateParameters({ mu_rolling: value }));
            
        fEnvironment.add(config, 'k_air', 0.0, 0.05, 0.001)
            .name('مقاومة الهواء (Air)')
            .onChange(value => this.physicsWorld.updateParameters({ k_air: value }));
            
        fEnvironment.add(config, 'sleepThreshold', 0.00001, 0.01, 0.000001)
            .name('عتبة سكون الكرة (Energy)')
            .onChange(value => this.physicsWorld.updateParameters({ sleepThreshold: value }));

        // 4. مجلد مرونة التصادمات بناءً على اشتقاقات دراسة الـ .md المرفقة
        const fCollisions = this.gui.addFolder('💥 مرونة التصادمات (Restitution)');
        fCollisions.add(config, 'e_ball', 0.0, 1.0, 0.01)
            .name('مرونة كرة مع كرة')
            .onChange(value => this.physicsWorld.updateParameters({ e_ball: value }));
            
        fCollisions.add(config, 'e_cushion', 0.0, 1.0, 0.01)
            .name('مرونة حواف الطاولة')
            .onChange(value => this.physicsWorld.updateParameters({ e_cushion: value }));
            
        fCollisions.add(config, 'cushion_friction', 0.0, 1.0, 0.05)
            .name('احتكاك الكرة بالحافة')
            .onChange(value => this.physicsWorld.updateParameters({ cushion_friction: value }));

        // 5. ربط القوانين الخارجية الحالية (الرياح والحقل المغناطيسي) باللوحة الموحدة تلقائياً
        this.physicsWorld.registeredForces.forEach(force => {
            const folder = this.gui.addFolder(`🔧 قانون خارجي: ${force.name}`);
            force.setupGUI(folder);
            folder.close();
        });
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

        // إدارة الأنيميشن من خلال كلاس المدير
        if (this.cueManager.isStrikingAnimation) {
            this.cueManager.animateStrike(frameTime, cueBall);
        } else {
            this.cueManager.updateState(cueBall);
        }

        // تحديث إحداثيات المشاهد وتدوير الكرات (تحديث متوافق مع Mesh و Group)
        for (let item of this.ballMeshes) {
            item.mesh.position.copy(item.physics.position);
            item.mesh.visible = !item.physics.isPocketted;

            if (!item.physics.isSleeping && !item.physics.isPocketted) {
                const deltaRotation = item.physics.angularVelocity.clone().multiplyScalar(this.fixedTimeStep);
                const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(deltaRotation.x, deltaRotation.y, deltaRotation.z, 'XYZ'));

                // التطبيق المباشر السليم سواء كانت كرتنا مشهد Mesh أو كائن هجين Group
                item.mesh.quaternion.multiplyQuaternions(quaternion, item.mesh.quaternion);
            }
        }

        this.domETotal.innerText = this.physicsWorld.getTotalKineticEnergy().toFixed(5);
        this.domCueState.innerText = cueBall.isPocketted ? '🕳️ سقطت في الحفرة' :
            (cueBall.isSleeping ? '💤 ساكنة' : '🔥 تتحرك');

        this.tableGraphics.controls.update();
        this.tableGraphics.renderer.render(this.tableGraphics.scene, this.tableGraphics.camera);
    }
}