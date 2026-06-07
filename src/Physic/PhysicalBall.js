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

        const linearImpulse = strikeDirection.clone().normalize().multiplyScalar(impulseMagnitude);
        this.velocity.add(Physics.linearVelocityFromImpulse(linearImpulse, this.mass));

        const contactPointOffset = new THREE.Vector3(offsetX, offsetY, this.radius);
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
    
    // حساب سرعة نقطة التلامس اللحظية الحقيقية: vc = v + w x r
    const tangentialVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, rVector);
    const v_relative = new THREE.Vector3().addVectors(this.velocity, tangentialVelocity);
    const vcMag = v_relative.length();

    // عتبة متناهية الدقة للفصل بين الانزلاق الحركي النشط والتدحرج النقي (1e-3 م/ث)
    if (vcMag > 0.0185) {
        // [طور الانزلاق النشط]: الاحتكاك يقلل السرعة الخطية ويزيد/يعدل السرعة الزاوية معاً
        const slidingMag = Physics.slidingFrictionMagnitude(config.mu_sliding, this.mass, g);
        const frictionForce = v_relative.clone().normalize().negate().multiplyScalar(slidingMag);
        
        // تعديل السرعة الخطية (تباطؤ خطي)
        this.velocity.addScaledVector(frictionForce.clone().divideScalar(this.mass), dt);
        
        // تعديل السرعة الزاوية (توليد عزم دوران يطرد الانزلاق ويدفع باتجاه التدحرج)
        const torque = Physics.slidingTorque(rVector, frictionForce);
        this.angularVelocity.addScaledVector(torque.divideScalar(this.inertia), dt);
    } else {
        // [طور التدحرج النقي]: تتدحرج الكرة وتبخر طاقتها ببطء شديد عبر مقاومة التدحرج
        if (this.velocity.length() > 0.001) {
            const rollingForce = Physics.rollingResistanceForce(config.mu_rolling, this.mass, g, this.velocity);
            this.velocity.addScaledVector(rollingForce.divideScalar(this.mass), dt);
            
            // قيد التدحرج الطبيعي المنساب دون تصفير مباغت للـ Spin
            const newAngularVelocity = Physics.enforceRollingConstraint(this.velocity, this.radius, this.angularVelocity);
            this.angularVelocity.copy(newAngularVelocity);
        }
    }

    // مقاومة تخميد الهواء
    this.velocity.addScaledVector(this.velocity.clone().negate().multiplyScalar(config.k_air), dt);

    // تحديث الموقع بناءً على السرعة النهائية المتولدة
    this.position.addScaledVector(this.velocity, dt);

    // فحص عتبة السكون العلمي: السكون يحدث عندما تقترب السرعات من الصفر المطلق وليس عند طاقات عالية
    if (this.velocity.length() < 0.002 && this.angularVelocity.length() < 0.05) {
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.isSleeping = true;
    }
}   
}