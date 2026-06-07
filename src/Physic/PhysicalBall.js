import * as THREE from 'three';
import * as Physics from './PhysicsLaws.js';

/**
 * كلاس الكرة الفيزيائية - يمثل كرة بلياردو جاسئة تخضع لمعادلات نيوتن وأويلر للحركة
 */
export class PhysicalBall {
    constructor(id, position, radius, mass) {
        this.id = id;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.angularVelocity = new THREE.Vector3(0, 0, 0);
        this.radius = radius;
        this.mass = mass;

        // استخدام قانون عزم القصور الذاتي من PhysicsLaws
        this.inertia = Physics.momentOfInertiaSolidSphere(mass, radius);
        this.inverseMass = 1 / mass;
        this.isSleeping = true;
        this.isPocketted = false;
        this.worldBallsRef = null;
    }

    /**
     * حساب الطاقة الحركية الكلية باستخدام القوانين المعزولة
     */
    getKineticEnergy() {
        const linearKE = Physics.linearKineticEnergy(this.mass, this.velocity);
        const rotationalKE = Physics.rotationalKineticEnergy(this.inertia, this.angularVelocity);
        return linearKE + rotationalKE;
    }

    /**
     * تطبيق ضربة العصا المتقدمة
     * الآن تستخدم Physics.angularVelocityFromImpulse
     */
    applyAdvancedStrike(impulseMagnitude, strikeDirection, offsetX, offsetY) {
    this.isSleeping = false;

    // 1. تحويل اتجاه الضربة إلى متجه وحدة متناسق (Forward)
    const forward = strikeDirection.clone().normalize();

    // 2. تطبيق النبضة الخطية
    const linearImpulse = forward.clone().multiplyScalar(impulseMagnitude);
    this.velocity.add(Physics.linearVelocityFromImpulse(linearImpulse, this.mass));

    // 🔥 الحل الهندي المُنقذ: بناء جملة إحداثيات محلية (Local Basis) تدور مع اتجاه العصا
    const up = new THREE.Vector3(0, 1, 0); // المحور الرأسي الثابت للطاولة
    
    // المحور الأفقي الجانبي المتعامد مع العصا
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    
    // المحور العمودي المتعامد تماماً مع خط تسديد العصا
    const perpUp = new THREE.Vector3().crossVectors(right, forward).normalize();

    // حساب ذراع العزم الحقيقي: 
    // - يبدأ من نقطة التلامس في مؤخرة الكرة عكس اتجاه الضربة (forward * -radius)
    // - مضافاً إليه الإزاحات الموجهة محلياً مع زاوية ميلان العصا (right * offsetX) و (perpUp * offsetY)
    const contactPointOffset = new THREE.Vector3()
        .addScaledVector(forward, -this.radius)
        .addScaledVector(right, offsetX)
        .addScaledVector(perpUp, offsetY);

    // 3. حساب عزم النبضة الدوراني بناءً على ذراع العزم الفيزيائي الصحيح
    const deltaOmega = Physics.angularVelocityFromImpulse(linearImpulse, contactPointOffset, this.inertia);
    this.angularVelocity.add(deltaOmega);
}

    /**
     * تطبيق ضربة عند النقطة المثالية (Sweet Spot) للحصول على تدحرج نقي فوراً
     */
    applySweetSpotStrike(impulseMagnitude, strikeDirection) {
        const offsetY = Physics.sweetSpotOffset(this.radius);
        this.applyAdvancedStrike(impulseMagnitude, strikeDirection, 0, offsetY);
    }

    /**
     * معالجة الاحتكاك والانتقال الديناميكي من الانزلاق إلى التدحرج النقي
     * تم تصحيح إجبار القيد الحركي للحفاظ على spin
     */
    applyStandardFriction(config, dt) {
    if (this.isSleeping || this.isPocketted) return;

    const g = config.gravity;
    const rVector = new THREE.Vector3(0, -this.radius, 0);
    
    // 1. حساب سرعة نقطة التلامس اللحظية الحقيقية
    const tangentialVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, rVector);
    const v_relative = new THREE.Vector3().addVectors(this.velocity, tangentialVelocity);
    const vcMag = v_relative.length();

    // 2. تطبيق قوانين الاحتكاك الأساسية (انزلاق أو تدحرج)
    if (vcMag > 0.0185) {
        // [طور الانزلاق]
        const slidingMag = Physics.slidingFrictionMagnitude(config.mu_sliding, this.mass, g);
        const frictionForce = v_relative.clone().normalize().negate().multiplyScalar(slidingMag);
        
        this.velocity.addScaledVector(frictionForce.clone().divideScalar(this.mass), dt);
        
        const torque = Physics.slidingTorque(rVector, frictionForce);
        this.angularVelocity.addScaledVector(torque.divideScalar(this.inertia), dt);
    } else {
        // [طور التدحرج النقي]
        if (this.velocity.length() > 0.001) {
            const rollingForce = Physics.rollingResistanceForce(config.mu_rolling, this.mass, g, this.velocity);
            this.velocity.addScaledVector(rollingForce.divideScalar(this.mass), dt);
            
            const newAngularVelocity = Physics.enforceRollingConstraint(this.velocity, this.radius, this.angularVelocity);
            this.angularVelocity.copy(newAngularVelocity);
        }
    }

    // 🔥 الحاقن الجديد المُنقذ: إخماد الدوران المغزلي العمودي حول محور Y (Spin Damping)
    // حتى لو كانت الكرة ثابتة خطياً، فإن احتكاك القماش يفرمل الدوران المغزلي ببطء
    if (Math.abs(this.angularVelocity.y) > 0.01) {
        // معامل تخميد مخصص للدوران المغزلي (يمكن تعديله من الـ config لاحقاً، القيمة 0.15 مثالية جداً)
        const torsionalDamping = 0.15; 
        this.angularVelocity.y -= this.angularVelocity.y * torsionalDamping * dt;
    }

    // 3. مقاومة الهواء العامة
    this.velocity.addScaledVector(this.velocity.clone().negate().multiplyScalar(config.k_air), dt);

    // 4. تحديث الموقع بناءً على السرعات المعدلة
    this.position.addScaledVector(this.velocity, dt);

    // 5. فحص عتبة السكون العلمي الصارم:
    // يجب ألا تنام الكرة إلا إذا سكنت حركتها الخطية ودورانها حول جميع المحاور (بما فيها Y)
    if (this.velocity.length() < 0.002 && this.angularVelocity.length() < 0.0355) {
    // if (this.velocity.length() < 0.002 && this.angularVelocity.length() < 0.05) {
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.isSleeping = true;
    }
}   
}