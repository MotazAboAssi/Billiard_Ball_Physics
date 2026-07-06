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

        this.inertia = Physics.momentOfInertiaSolidSphere(mass, radius);
        this.inverseMass = 1 / mass;
        this.isSleeping = true;
        this.isPocketted = false;
        this.worldBallsRef = null;
    }

    /**
     * حساب الطاقة الحركية الكلية
     */
    getKineticEnergy() {
        const linearKE = Physics.linearKineticEnergy(this.mass, this.velocity);
        const rotationalKE = Physics.rotationalKineticEnergy(this.inertia, this.angularVelocity);
        return linearKE + rotationalKE;
    }

    /**
     * تطبيق ضربة العصا المتقدمة
     */
    applyAdvancedStrike(impulseMagnitude, strikeDirection, offsetX, offsetY) {
        this.isSleeping = false;

        // FIX: تقييد إزاحة نقطة الضرب لمنع تسديدة وهمية (miscue) ينتج عنها عزم
        // دوران غير واقعي على الإطلاق — نقطة التلامس يجب أن تبقى ضمن سطح الكرة الفعلي
        const maxOffsetMag = this.radius * 0.7;
        const offsetMag = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        if (offsetMag > maxOffsetMag) {
            const scale = maxOffsetMag / offsetMag;
            offsetX *= scale;
            offsetY *= scale;
        }

        const forward = strikeDirection.clone().normalize();

        // تطبيق النبضة الخطية
        const linearImpulse = forward.clone().multiplyScalar(impulseMagnitude);
        this.velocity.add(Physics.linearVelocityFromImpulse(linearImpulse, this.mass));

        // بناء جملة إحداثيات محلية تدور مع اتجاه العصا
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        const perpUp = new THREE.Vector3().crossVectors(right, forward).normalize();

        // حساب ذراع العزم الحقيقي
        const contactPointOffset = new THREE.Vector3()
            .addScaledVector(forward, -this.radius)
            .addScaledVector(right, offsetX)
            .addScaledVector(perpUp, offsetY);

        // حساب عزم النبضة الدوراني
        const deltaOmega = Physics.angularVelocityFromImpulse(linearImpulse, contactPointOffset, this.inertia);
        this.angularVelocity.add(deltaOmega);
    }

    /**
     * تطبيق ضربة عند النقطة المثالية (Sweet Spot)
     */
    applySweetSpotStrike(impulseMagnitude, strikeDirection) {
        const offsetY = Physics.sweetSpotOffset(this.radius);
        this.applyAdvancedStrike(impulseMagnitude, strikeDirection, 0, offsetY);
    }

    /**
     * معالجة الاحتكاك والانتقال الديناميكي من الانزلاق إلى التدحرج النقي
     */
    applyStandardFriction(config, dt) {
        if (this.isSleeping || this.isPocketted) return;

        const g = config.gravity;
        const rVector = new THREE.Vector3(0, -this.radius, 0);

        // حساب سرعة نقطة التلامس اللحظية
        const tangentialVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, rVector);
        const v_relative = new THREE.Vector3().addVectors(this.velocity, tangentialVelocity);
        const vcMag = v_relative.length();

        if (vcMag > 0.0185) {
            // [طور الانزلاق]
            const slidingMag = Physics.slidingFrictionMagnitude(config.mu_sliding, this.mass, g);
            const frictionForce = v_relative.clone().normalize().negate().multiplyScalar(slidingMag);

            const deltaV = frictionForce.clone().divideScalar(this.mass).multiplyScalar(dt);
            const torque = Physics.slidingTorque(rVector, frictionForce);
            const deltaOmega = torque.clone().divideScalar(this.inertia).multiplyScalar(dt);

            // FIX: عند اقتراب سرعة نقطة التلامس من الصفر، كانت دفعة الاحتكاك
            // الثابتة (Δv, Δω) تتجاوز (Overshoot) قيمة vc الفعلية في خطوة واحدة،
            // فتعكس اتجاهها وتسبب اهتزازاً أبدياً (Limit Cycle) حول نقطة التوازن
            // بدلاً من الاستقرار. هنا نُقيّد الدفعة كي لا تتجاوز إزالة vc بالكامل
            const deltaVc = deltaV.clone().add(new THREE.Vector3().crossVectors(deltaOmega, rVector));
            const deltaVcMag = deltaVc.length();
            if (deltaVcMag > vcMag) {
                const clampScale = vcMag / deltaVcMag;
                deltaV.multiplyScalar(clampScale);
                deltaOmega.multiplyScalar(clampScale);
            }

            this.velocity.add(deltaV);
            this.angularVelocity.add(deltaOmega);
        } else {
            // [طور التدحرج النقي]
            if (this.velocity.length() > 0.001) {
                const rollingForce = Physics.rollingResistanceForce(config.mu_rolling, this.mass, g, this.velocity);
                this.velocity.addScaledVector(rollingForce.divideScalar(this.mass), dt);
            }

            // FIX: تم نقل تصحيح الدوران خارج شرط السرعة الدنيا. كانت العملية تُحجب
            // عندما تهبط السرعة الخطية تحت 0.001، مما يترك دوراناً متبقياً من ارتطام
            // سابق بالجدار (لم يُعدَّل اتجاهه) عالقاً للأبد ويدفع الكرة للتحرك من جديد
            const newAngularVelocity = Physics.enforceRollingConstraint(this.velocity, this.radius, this.angularVelocity);
            this.angularVelocity.copy(newAngularVelocity);
        }

        // إخماد الدوران المغزلي العمودي حول محور Y (Spin Damping)
        if (Math.abs(this.angularVelocity.y) > 0.01) {
            // FIX: كانت القيمة 0.15 تمثل عملياً ثابت زمني للتبدد ≈ 6.7 ثانية، أي أن أي
            // سرعة دوران مغزلية كبيرة كانت تأخذ عشرات الثواني لتصل للصفر. تم رفعها إلى
            // 2.0 لتعطي ثابتاً زمنياً ≈ 0.5 ثانية وتبدداً واقعياً خلال 1-2 ثانية تقريباً
            const torsionalDamping = 2.0;
            this.angularVelocity.y -= this.angularVelocity.y * torsionalDamping * dt;
        }

        // مقاومة الهواء
        this.velocity.addScaledVector(this.velocity.clone().negate().multiplyScalar(config.k_air), dt);

        // تحديث الموقع
        this.position.addScaledVector(this.velocity, dt);

        // فحص عتبة السكون — لكن لا توقف الكرة إذا كانت قريبة من حفرة
        if (this.velocity.length() < 0.002 && this.angularVelocity.length() < 0.0355) {
            // FIX: تحقق من قرب أي حفرة قبل إيقاف الكرة — كرة بطيئة بالقرب من
            // الحفرة يجب أن تُترك لجاذبية الحفرة لتُكمل دخولها
            const nearPocket = this.worldBallsRef && (() => {
                // نصل للحفر من خلال worldBallsRef (مرجع عالم الفيزياء)
                if (!this._pocketsRef) return false;
                return this._pocketsRef.some(p => {
                    const dx = p.x - this.position.x;
                    const dz = p.z - this.position.z;
                    return Math.sqrt(dx * dx + dz * dz) < this._pocketRadius * 2.2;
                });
            })();
            if (!nearPocket) {
                this.velocity.set(0, 0, 0);
                this.angularVelocity.set(0, 0, 0);
                this.isSleeping = true;
            }
        }
    }
}
