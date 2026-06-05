import * as THREE from 'three';

/**
 * كلاس الكرة الفيزيائية - يمثل كرة بلياردو جاسئة تخضع لمعادلات نيوتن وأويلر للحركة
 * مستوحى مباشرة من "الجزء الأول: من النبضة إلى السكون" في الدراسة الفيزيائية.
 */
export class PhysicalBall {
    constructor(id, position, radius, mass) {
        this.id = id;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);         // السرعة الخطية v
        this.angularVelocity = new THREE.Vector3(0, 0, 0);  // السرعة الزاوية w
        this.radius = radius;                               // نصف القطر R
        this.mass = mass;                                   // الكتلة m

        // عزم القصور الذاتي لجسم كروي مصمت: I = (2/5) * m * R^2 (الدراسة - قسم 1)
        this.inertia = (2 / 5) * mass * radius * radius;
        this.inverseMass = 1 / mass;
        this.isSleeping = true;
        this.isPocketted = false;
        this.worldBallsRef = null;
    }

    /**
     * حساب الطاقة الحركية الكلية (الخطية + الدورانية)
     * K = 0.5 * m * v^2 + 0.05 * I * w^2
     */
    getKineticEnergy() {
        return (0.5 * this.mass * this.velocity.lengthSq()) +
            (0.5 * this.inertia * this.angularVelocity.lengthSq());
    }

    /**
     * تطبيق ضربة العصا المتقدمة بناءً على عزم القوة والانحراف الأفقي والرأسي
     * يطبق معادلات "مرحلة التصادم اللحظي" والاشتقاق الرياضي (قسم 1)
     */
    applyAdvancedStrike(impulseMagnitude, strikeDirection, offsetX, offsetY) {
        this.isSleeping = false;

        // 1. حساب السرعة الخطية الابتدائية من النبضة: v0 = J / m (الدراسة - قسم 1.1.أ)
        const linearImpulse = strikeDirection.clone().normalize().multiplyScalar(impulseMagnitude);
        this.velocity.addScaledVector(linearImpulse, this.inverseMass);

        // 2. حساب عزم الدوران الناشئ عن نقطة الضرب (الانحراف عن المركز)
        // ذراع القوة بالنسبة لمركز الكرة: (offsetX, offsetY, R)
        const contactPointOffset = new THREE.Vector3(offsetX, offsetY, this.radius);

        // العزم الميكانيكي المؤثر: tau = r x F_impulse (الدراسة - النقطة المثالية للضرب)
        const angularImpulse = new THREE.Vector3().crossVectors(contactPointOffset, linearImpulse);

        // 3. حساب السرعة الزاوية الابتدائية: w0 = (J * h) / I (الدراسة - قسم 1.1.ب)
        this.angularVelocity.addScaledVector(angularImpulse, 1 / this.inertia);
    }

    /**
     * معالجة الاحتكاك والانتقال الديناميكي من الانزلاق إلى التدحرج النقي
     * يطبق معادلات "مرحلة الانزلاق" و "شرط التدحرج الطبيعي" (الدراسة - قسم 1.2 و 1.3)
     */
    applyStandardFriction(config, dt) {
        if (this.isSleeping || this.isPocketted) return;

        const g = config.gravity;
        const rVector = new THREE.Vector3(0, -this.radius, 0); // ناقل نصف القطر للنقطة السفلى

        // حساب السرعة النسبية اللحظية للنقطة الملامسة للطاولة: vc = v + w x r (الدراسة - قسم 1.3)
        const tangentialVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, rVector);
        const v_relative = new THREE.Vector3().addVectors(this.velocity, tangentialVelocity);

        if (v_relative.length() > 0.001) {
            // [حالة الانزلاق - Sliding Phase]: الاحتكاك الحركي يعاكس اتجاه السرعة النسبية اللحظية
            // fk = mu_k * m * g (الدراسة - قسم 1.2.أ)
            const F_sliding = v_relative.clone().normalize().negate().multiplyScalar(config.mu_sliding * this.mass * g);

            // التباطؤ الخطي بفعل احتكاك الانزلاق: dv/dt = -mu_k * g (الدراسة - قسم 1.2.ب)
            this.velocity.addScaledVector(F_sliding.clone().divideScalar(this.mass), dt);

            // عزم دوران احتكاك الانزلاق المؤثر لزيادة السرعة الزاوية: tau = r x fk (الدراسة - قسم 1.2.ج)
            const torque = new THREE.Vector3().crossVectors(rVector, F_sliding);
            this.angularVelocity.addScaledVector(torque.divideScalar(this.inertia), dt);
        } else {
            // [حالة التدحرج النقي - Pure Rolling]: تلاشي احتكاك الانزلاق وظهور مقاومة التدحرج
            if (this.velocity.length() > 0.001) {
                // مقاومة التدحرج الناتجة عن التشوه المرن للقماش: a_rolling = mu_r * g (الدراسة - قسم 1.4)
                const F_rolling = this.velocity.clone().normalize().negate().multiplyScalar(config.mu_rolling * this.mass * g);
                this.velocity.addScaledVector(F_rolling.divideScalar(this.mass), dt);

                // إجبار السرعة الزاوية على التوافق مع القيد الحركي الصارم للتدحرج: v = w x R (الدراسة - قسم 1.3)
                this.angularVelocity.set(this.velocity.z / this.radius, 0, -this.velocity.x / this.radius);
            }
        }

        // مقاومة الهواء المخمدة للحركة
        this.velocity.addScaledVector(this.velocity.clone().negate().multiplyScalar(config.k_air), dt);

        // تحديث الموقع بناءً على السرعة الخطية الحالية
        this.position.addScaledVector(this.velocity, dt);

        // فحص عتبة السكون لحفظ موارد المعالجة (حالة السكون التام - قسم 1.5)
        
        if (this.getKineticEnergy() < config.sleepThreshold) {
            this.velocity.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);
            this.isSleeping = true;
        }
    }
}

/**
 * كلاس العالم الفيزيائي - يدير تصادم الكرات وتفاعلها مع الجدران والمطاط
 */
export class PhysicsWorld {
    constructor() {
        this.balls = [];
        this.registeredForces = [];

        // واجهة التحكم الشاملة بالثوابت الفيزيائية (تغطي المتطلبات 4 و 5 بالكامل)
        this.config = {
            gravity: 9.81,          // الجاذبية الأرضية g
            mu_sliding: 0.20,       // معامل احتكاك الانزلاق للقماش mu_k
            mu_rolling: 0.015,      // معامل مقاومة التدحرج mu_r
            k_air: 0.005,           // معامل مقاومة الهواء
            e_ball: 0.96,           // معامل الارتداد بين الكرات e
            e_cushion: 0.75,        // معامل ارتداد الحائط المطاطي ec (الدراسة - قسم البند 1)
            cushion_friction: 0.2,  // معامل احتكاك المطاط المماسي mu_c (الدراسة - قسم البند 2)
            sleepThreshold: 0.006,  // عتبة التحول للسكون الثابت
            strikeImpulse: 0.9,     // قوة نبضة العصا الافتراضية J
            strikeOffsetX: 0.0,     // الانحراف الأفقي للضربة
            strikeOffsetY: 0.0      // الانحراف الرأسي للضربة
        };

        this.tableBounds = { minX: -0.635, maxX: 0.635, minZ: -1.27, maxZ: 1.27 };
        this.pocketRadius = 0.045;
        this.pockets = [
            new THREE.Vector3(-0.635, 0, -1.27), new THREE.Vector3(0.635, 0, -1.27),
            new THREE.Vector3(-0.635, 0, 0), new THREE.Vector3(0.635, 0, 0),
            new THREE.Vector3(-0.635, 0, 1.27), new THREE.Vector3(0.635, 0, 1.27)
        ];
    }

    addBall(ball) {
        ball.worldBallsRef = this.balls;
        this.balls.push(ball);
    }

    /**
     * دالة تحديث الثوابت الفيزيائية أثناء التشغيل (تلبية للمطلوب رقم 4 بدقة)
     * يمكن ربطها مباشرة بشرائح التمرير (Sliders) في واجهة المستخدم لديك
     */
    updateParameters(newParams) {
        this.config = { ...this.config, ...newParams };
    }
    registerExternalForce(forceInstance) {
        this.registeredForces.push(forceInstance);
    }

    // getTotalKineticEnergy() {
    //     return this.balls.reduce((sum, ball) => sum + (ball.isPocketted ? 0 : ball.getKineticEnergy()), 0);
    // }

    getTotalKineticEnergy() {
        let totalEnergy = 0;
        for (let ball of this.balls) {
            if (!ball.isPocketted && !ball.isSleeping) {
                // الطاقة الخطية: 0.5 * m * v^2
                const vSq = ball.velocity.lengthSq();
                const linearEnergy = 0.5 * ball.mass * vSq;

                // عزم القصور الذاتي للكرة المصمتة: I = (2/5) * m * r^2
                const I = 0.4 * ball.mass * ball.radius * ball.radius;
                const wSq = ball.angularVelocity.lengthSq();
                const rotationalEnergy = 0.5 * I * wSq;

                totalEnergy += (linearEnergy + rotationalEnergy);
            }
        }
        return totalEnergy;
    }


    update(dt) {
        for (let ball of this.balls) {
            if (ball.isPocketted) continue;
            ball.applyStandardFriction(this.config, dt);
        }
        this.resolveBallCollisions();
        this.resolveCushionCollisions();
        this.checkPocketCollisions();
    }

    /**
     * هندسة الصدم المرن المتبادل وسلاسل القوة وتضاؤل الطاقة التراكمي
     * يطبق قوانين حفظ الزخم والطاقة، وقاعدة الـ 90 درجة، والاضمحلال الهندسي (قسم تصادم الكرات)
     */
    resolveBallCollisions() {
        for (let i = 0; i < this.balls.length; i++) {
            for (let j = i + 1; j < this.balls.length; j++) {
                const b1 = this.balls[i]; const b2 = this.balls[j];
                if (b1.isPocketted || b2.isPocketted) continue;

                // حساب خط المراكز (The Line of Centers) والمحور الناظم المشترك (الدراسة - هندسة التلامس)
                const delta = new THREE.Vector3().subVectors(b2.position, b1.position);
                delta.y = 0;
                const distance = delta.length();
                const minDistance = b1.radius + b2.radius;

                if (distance < minDistance) {
                    const normal = delta.clone().normalize();

                    // حل مشكلة التداخل الهندسي المجهري لمنع التداخلات غير الفيزيائية (Signorini conditions)
                    const penetration = minDistance - distance;
                    const correction = normal.clone().multiplyScalar((penetration / (b1.inverseMass + b2.inverseMass)) * 0.8);
                    b1.position.addScaledVector(correction, -b1.inverseMass);
                    b2.position.addScaledVector(correction, b2.inverseMass);

                    // حساب تفاضل السرعات اللحظية على طول المحور الناظم المشترك
                    const relativeVelocity = new THREE.Vector3().subVectors(b2.velocity, b1.velocity);
                    const velAlongNormal = relativeVelocity.dot(normal);

                    if (velAlongNormal > 0) continue; // الكرات تبتعد بالفعل

                    // حساب نبضة الصدم الفعالة بإدخال معامل ارتداد الكرات التبادلي الواقعي (e < 1)
                    // العلاقة المستنتجة رياضياً لتغير الطاقة: Delta K = 1/4 * m * (1 - e^2) * v_rel^2 (الدراسة - التبدد التراكمي)
                    let jImpulse = -(1 + this.config.e_ball) * velAlongNormal / (b1.inverseMass + b2.inverseMass);
                    const impulse = normal.clone().multiplyScalar(jImpulse);

                    // توزيع الزخم المرتد على الكرات المتصادمة (حفظ كمية الحركة وقاعدة الـ 90 درجة)
                    b1.velocity.addScaledVector(impulse, -b1.inverseMass);
                    b2.velocity.addScaledVector(impulse, b2.inverseMass);

                    // الاستجابة للتصادم غير المركزي وسلاسل القوة (إيقاظ الكرات من السكون لتتجاوز عتبة القماش)
                    b1.isSleeping = false;
                    b2.isSleeping = false;
                }
            }
        }
    }

    /**
     * معالجة ارتداد الحواف المطاطية المقترن بالدوران والـ Spin
     * يطبق معادلات التصادم العمودي والمائل وتأثير الدوران الجانبي (الدراسة - ديناميكا التصادم مع الجدران المطاطية)
     */
    resolveCushionCollisions() {
        const e_c = this.config.e_cushion;        // معامل الارتداد ec
        const mu_c = this.config.cushion_friction;  // معامل احتكاك المطاط muc

        for (let ball of this.balls) {
            if (ball.isSleeping || ball.isPocketted) continue;
            let hit = false;
            let normal = new THREE.Vector3(); // المتجه الناظمي العمودي على الجدار المصدوم

            // فحص الحدود الطاولية الأربعة وتغيير السرعة العمودية: v_out,n = -ec * v_in,n (الدراسة - البند 1)
            if (ball.position.x - ball.radius < this.tableBounds.minX) {
                ball.position.x = this.tableBounds.minX + ball.radius; ball.velocity.x = -ball.velocity.x * e_c; normal.set(1, 0, 0); hit = true;
            } else if (ball.position.x + ball.radius > this.tableBounds.maxX) {
                ball.position.x = this.tableBounds.maxX - ball.radius; ball.velocity.x = -ball.velocity.x * e_c; normal.set(-1, 0, 0); hit = true;
            }
            if (ball.position.z - ball.radius < this.tableBounds.minZ) {
                ball.position.z = this.tableBounds.minZ + ball.radius; ball.velocity.z = -ball.velocity.z * e_c; normal.set(0, 0, 1); hit = true;
            } else if (ball.position.z + ball.radius > this.tableBounds.maxZ) {
                ball.position.z = this.tableBounds.maxZ - ball.radius; ball.velocity.z = -ball.velocity.z * e_c; normal.set(0, 0, -1); hit = true;
            }

            if (hit) {
                ball.isSleeping = false;

                // [تأثير الدوران المغزلي المقترن - Cushion Coupling]: (الدراسة - البند 3)
                // سرعة نقطة التماس الميكانيكية اللحظية مع الجدار المطاطي: vc = vt + w x R
                const effectVelocity = ball.angularVelocity.y * ball.radius;

                if (Math.abs(effectVelocity) > 0.01) {
                    // الدوران الجانبي (Spin) يولد قوة احتكاك مماسية تحرف زاوية الخروج الحقيقية (البند 2 و 3)
                    // طاقة الدوران تنتقل وتتحرك كدفع إضافي للمركبة المماسية الموازية للجدار المطاطي
                    ball.velocity.addScaledVector(new THREE.Vector3(-normal.z, 0, normal.x), effectVelocity * mu_c);
                }
            }
        }
    }

    /**
     * التحقق من السقوط الميكانيكي داخل الحفر أو الوقوع تحت تأثير قوة سحب الجاذبية للحافة
     */
    checkPocketCollisions() {
        for (let ball of this.balls) {
            if (ball.isPocketted) continue;

            for (let pocket of this.pockets) {
                const distX = pocket.x - ball.position.x;
                const distZ = pocket.z - ball.position.z;
                const dist2D = Math.sqrt(distX * distX + distZ * distZ);
                const gravityThreshold = this.pocketRadius + ball.radius * 0.5;

                if (dist2D < gravityThreshold) {
                    ball.isSleeping = false;
                    if (dist2D > this.pocketRadius) {
                        // محاكاة تسارع قماش الحافة المائل الذي يسحب الكرة باتجاه مركز الحفرة وعمقها
                        const pullForce = 21.0;
                        ball.velocity.x += (distX / dist2D) * pullForce * 0.008;
                        ball.velocity.z += (distZ / dist2D) * pullForce * 0.008;
                    } else {
                        // استقرار الكرة داخل الحفرة بالكامل وتعطيل خواصها الحركية والفيزياوية
                        ball.isPocketted = true;
                        ball.velocity.set(0, 0, 0);
                        ball.angularVelocity.set(0, 0, 0);
                        ball.isSleeping = true;
                        ball.position.y = -this.pocketRadius * 2;
                    }
                }
            }
        }
    }
}