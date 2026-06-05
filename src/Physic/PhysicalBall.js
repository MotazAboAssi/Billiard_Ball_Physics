import * as THREE from 'three';


/**
 * كلاس الكرة الفيزيائية - يمثل كرة بلياردو جاسئة تخضع لمعادلات نيوتن وأويلر للحركة
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