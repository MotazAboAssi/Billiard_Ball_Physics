import * as THREE from 'three';
import GUI from 'lil-gui';
import { PhysicsWorld, PhysicalBall } from './../PhysicsWorld.js';
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

        window.requestAnimationFrame(this.animate);
    }

    initPhysicsWorld() {
        const ballGeo = new THREE.SphereGeometry(this.ballRadius, 32, 32);

        // 1️⃣ أولاً: تهيئة الكرة البيضاء في مكانها الطبيعي (منطقة الـ Kitchen)
        const cueBallPhys = new PhysicalBall(0, new THREE.Vector3(0, this.ballRadius, this.tableLength / 4), this.ballRadius, this.ballMass);
        const cueBallMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
        cueBallMesh.castShadow = true;
        this.tableGraphics.scene.add(cueBallMesh);
        this.physicsWorld.addBall(cueBallPhys);
        this.ballMeshes.push({ physics: cueBallPhys, mesh: cueBallMesh });

        // 2️⃣ ثانياً: مصفوفة البيانات الدقيقة للـ 15 كرة (الأرقام، الألوان، ونوع التصميم السادة/المخطط)
        // تم ترتيبها تماماً كما تظهر في صفوف الصورة من الرأس إلى القاعدة
        const rackData = [
            // الصف الأول (الرأس)
            { id: 9, color: 0xffcc00, isStriped: true },  // كرة 9 صفراء مخططة

            // الصف الثاني
            { id: 7, color: 0x990011, isStriped: false }, // كرة 7 عنابى/أحمر داكن سادة
            { id: 12, color: 0x222288, isStriped: true },  // كرة 12 زرقاء مخططة

            // الصف الثالث
            { id: 15, color: 0x990011, isStriped: true },  // كرة 15 عنابى مخططة
            { id: 8, color: 0x111111, isStriped: false }, // كرة 8 سوداء (في المنتصف تماماً)
            { id: 1, color: 0xffcc00, isStriped: false }, // كرة 1 صفراء سادة

            // الصف الرابع
            { id: 6, color: 0x008844, isStriped: false }, // كرة 6 خضراء سادة
            { id: 10, color: 0x1133aa, isStriped: true },  // كرة 10 زرقاء مخططة
            { id: 3, color: 0xdd2222, isStriped: false }, // كرة 3 حمراء سادة
            { id: 14, color: 0x008844, isStriped: true },  // كرة 14 خضراء مخططة

            // الصف الخامس (القاعدة الخلفية)
            { id: 11, color: 0xdd2222, isStriped: true },  // كرة 11 حمراء مخططة
            { id: 2, color: 0x1133aa, isStriped: false }, // كرة 2 زرقاء سادة
            { id: 13, color: 0xff6600, isStriped: true },  // كرة 13 برتقالية مخططة
            { id: 4, color: 0x441166, isStriped: false }, // كرة 4 بنفسجية سادة
            { id: 5, color: 0xff6600, isStriped: false }  // كرة 5 برتقالية سادة
        ];

        // 3️⃣ ثالثاً: لوغاريتمية التوزيع الهرمي في الفضاء ثلاثي الأبعاد
        const apexZ = -this.tableLength / 4; // نقطة رأس المثلث على الطاولة (Foot Spot)
        let dataIndex = 0;

        // المسافات البينية مع إضافة هامش ميكروويفي ضئيل جداً (0.0001) لمنع تداخل أسطح الفيزياء عند التحميل
        const rowSpacing = this.ballRadius * Math.sqrt(3) + 0.0001;
        const colSpacing = this.ballRadius * 2 + 0.0001;

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                const ballInfo = rackData[dataIndex++];

                // حساب الإحداثيات المحلية لكل كرة بناءً على صفها وعمودها
                const x = (col - row * 0.5) * colSpacing;
                const z = apexZ - (row * rowSpacing);
                const y = this.ballRadius;

                // أ: تهيئة كائن الفيزياء للكرة وتفعيله للصدم والاصطدام المستمر
                const ballPhys = new PhysicalBall(ballInfo.id, new THREE.Vector3(x, y, z), this.ballRadius, this.ballMass);
                this.physicsWorld.addBall(ballPhys);

                // ب: هندسة الشكل البصري (المظهر المطور التفصيلي للكرات السادة والمخططة)
                let ballMesh;

                if (ballInfo.isStriped) {
                    // الكرات المخططة (Striped): نصنع مجموعة مدمجة تجمع بين الجسد الأبيض والخط الملون المنتصف
                    ballMesh = new THREE.Group();

                    // قاعدة الجسم بيضاء كريمية للكرة المخططة
                    const baseMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 }));
                    baseMesh.castShadow = true;
                    ballMesh.add(baseMesh);

                    // الخط الدائري الملتف (The Stripe)
                    const stripeGeo = new THREE.CylinderGeometry(this.ballRadius + 0.0002, this.ballRadius + 0.0002, this.ballRadius * 0.8, 32, 1, true);
                    const stripeMat = new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1, side: THREE.DoubleSide });
                    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);

                    // تدوير الأسطوانة لتلتف أفقياً حول محور الكرة
                    stripeMesh.rotation.x = Math.PI / 2;
                    ballMesh.add(stripeMesh);
                } else {
                    // الكرات السادة (Solid): مادة لونية موحدة كاملة
                    ballMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1 }));
                    ballMesh.castShadow = true;
                }

                // ج: إضافة الكرة إلى المشهد الرسومي وحفظها في مصفوفة المتابعة والتحديث
                this.tableGraphics.scene.add(ballMesh);
                this.ballMeshes.push({ physics: ballPhys, mesh: ballMesh });
            }
        }
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
        // 1. جلب الكرة البيضاء بشكل صحيح من مصفوفة الكرات (الكرة رقم 0)
        const cueBall = this.ballMeshes[0].physics;

        // 2. شروط الحماية باستخدام أسماء المتغيرات الصحيحة لديك (this.cueManager)
        if (!cueBall || !cueBall.isSleeping || cueBall.isPocketted || this.cueManager.isStrikingAnimation) return;

        // 3. تصفير العداد وتفعيل أنيميشن حركة العصا البصرية
        this.cueManager.strikeProgress = 0;
        this.cueManager.isStrikingAnimation = true;
        this.cueManager.cueMesh.visible = true; // التأكد من ظهور العصا لبدء الحركة
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
        this.gui = new GUI({ title: '🕹️ لوحة هندسة القوانين الفيزيائية' });
        const config = this.physicsWorld.config;

        const fStrike = this.gui.addFolder('🏑 التحكم بالعصا والضربة');
        fStrike.add(config, 'strikeImpulse', 0.1, 5.0, 0.05).name('دفع الضربة (Impulse)');
        fStrike.add(config, 'strikeOffsetX', -0.02, 0.02, 0.001).name('انحراف أفقي (X Offset)');
        fStrike.add(config, 'strikeOffsetY', -0.02, 0.02, 0.001).name('انحراف رأسي (Y Offset)');
        fStrike.add(this, 'triggerAdvancedStrike').name('🚀 إطلاق القوة');
        fStrike.open();

        const fEnvironment = this.gui.addFolder('🌍 البيئة والاحتكاك السطحي');
        fEnvironment.add(config, 'gravity', 0.0, 25.0, 0.1).name('الجاذبية (g)');
        fEnvironment.add(config, 'mu_sliding', 0.0, 0.8, 0.01).name('احتكاك الانزلاق (Sliding)');
        fEnvironment.add(config, 'mu_rolling', 0.0, 0.1, 0.001).name('احتكاك التدحرج (Rolling)');
        fEnvironment.add(config, 'k_air', 0.0, 0.05, 0.001).name('مقاومة الهواء (Air)');
        fEnvironment.add(config, 'sleepThreshold', 0.00001, 0.01, 0.000001).name('عتبة سكون الكرة (Energy)');

        const fCollisions = this.gui.addFolder('💥 مرونة التصادمات (Restitution)');
        fCollisions.add(config, 'e_ball', 0.0, 1.0, 0.01).name('مرونة كرة مع كرة');
        fCollisions.add(config, 'e_cushion', 0.0, 1.0, 0.01).name('مرونة حواف الطاولة');
        fCollisions.add(config, 'cushion_friction', 0.0, 1.0, 0.05).name('احتكاك الكرة بالحافة');

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