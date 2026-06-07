import * as THREE from 'three';

// PhysicsLaws.js
// هذا الملف يحتوي على جميع القوانين الفيزيائية المستخلصة من الدراسة
// يمكن استخدامها من قبل PhysicalBall و PhysicsWorld لضمان الاتساق وقابلية الصيانة

/**
 * قانون عزم القصور الذاتي لكرة مصمتة
 * I = (2/5) * m * r^2
 * المرجع: الدراسة - النقطة المثالية للضرب
 */
export function momentOfInertiaSolidSphere(mass, radius) {
    return (2 / 5) * mass * radius * radius;
}

/**
 * الطاقة الحركية الخطية
 * K_linear = 0.5 * m * v^2
 */
export function linearKineticEnergy(mass, velocityVec) {
    return 0.5 * mass * velocityVec.lengthSq();
}

/**
 * الطاقة الحركية الدورانية
 * K_rot = 0.5 * I * ω^2
 */
export function rotationalKineticEnergy(inertia, angularVelocityVec) {
    return 0.5 * inertia * angularVelocityVec.lengthSq();
}

/**
 * السرعة الخطية الناتجة عن نبضة (قانون نيوتن الثاني في صيغة النبضة)
 * v = J / m
 * المرجع: الدراسة - مرحلة التصادم اللحظي (قسم 1.1 أ)
 */
export function linearVelocityFromImpulse(impulseVec, mass) {
    return impulseVec.clone().divideScalar(mass);
}

/**
 * السرعة الزاوية الناتجة عن نبضة ذات ذراع قوة (عزم النبضة)
 * ω = (r × J) / I
 * المرجع: الدراسة - مرحلة التصادم اللحظي (قسم 1.1 ب)
 */
export function angularVelocityFromImpulse(impulseVec, leverArmVec, inertia) {
    const angularImpulse = new THREE.Vector3().crossVectors(leverArmVec, impulseVec);
    return angularImpulse.divideScalar(inertia);
}

/**
 * قوة الاحتكاك الحركي أثناء الانزلاق
 * f_k = μ_k * m * g
 * المرجع: الدراسة - مرحلة الانزلاق (قسم 1.2 أ)
 */
export function slidingFrictionMagnitude(muSliding, mass, gravity) {
    return muSliding * mass * gravity;
}

/**
 * التسارع الخطي الناتج عن الاحتكاك الحركي
 * a = -μ_k * g (في اتجاه معاكس للسرعة النسبية)
 */
export function slidingLinearAcceleration(muSliding, gravity, directionVec) {
    return directionVec.clone().negate().multiplyScalar(muSliding * gravity);
}

/**
 * عزم الاحتكاك الحركي
 * τ = r × f_k
 * المرجع: الدراسة - مرحلة الانزلاق (قسم 1.2 ج)
 */
export function slidingTorque(radiusVec, frictionForceVec) {
    return new THREE.Vector3().crossVectors(radiusVec, frictionForceVec);
}

/**
 * شرط التدحرج النقي (بدون انزلاق)
 * v_contact = v + ω × r = 0
 * المرجع: الدراسة - نقطة التحول: التدحرج الطبيعي (قسم 1.3)
 */
export function isPureRolling(linearVelocity, angularVelocity, radiusVec, threshold = 1e-4) {
    const tangential = new THREE.Vector3().crossVectors(angularVelocity, radiusVec);
    const contactVelocity = linearVelocity.clone().add(tangential);
    return contactVelocity.length() < threshold;
}

/**
 * قيد السرعة الزاوية في حالة التدحرج النقي
 * يجب أن تحقق ω × r = -v
 * يمكن استنتاج ω_x, ω_z من v، بينما يبقى ω_y (spin) محفوظاً.
 * المرجع: معادلة القيد v = ω × r (مع مراعاة المحاور)
 */
export function enforceRollingConstraint(linearVelocity, radius, previousAngularVelocity) {
    const newAngularVelocity = previousAngularVelocity.clone();
    // العلاقات المتوافقة مع الإحداثيات الكارتيزية لمحرك Three.js (التدحرج الأفقي)
    newAngularVelocity.x = linearVelocity.z / radius;
    newAngularVelocity.z = -linearVelocity.x / radius;
    // الحفاظ التام على الدوران المغزلي العمودي (Spin Y) دون تصفير قسري
    return newAngularVelocity;
}

/**
 * قوة مقاومة التدحرج (Rolling Resistance)
 * F_rolling = -μ_r * m * g * (v / |v|)
 * المرجع: الدراسة - مرحلة التدحرج والتباطؤ النهائي (قسم 1.4)
 */
export function rollingResistanceForce(muRolling, mass, gravity, velocityVec) {
    if (velocityVec.length() < 1e-6) return new THREE.Vector3(0, 0, 0);
    const direction = velocityVec.clone().normalize();
    const magnitude = muRolling * mass * gravity;
    return direction.multiplyScalar(-magnitude);
}

/**
 * نبضة التصادم المرن بين كرتين (قانون نيوتن للارتداد + حفظ الزخم)
 * j = -(1 + e) * v_rel · n / (1/m1 + 1/m2)
 * المرجع: الدراسة - تصادم الكرات وقوانين الحفظ
 */
export function collisionImpulseMagnitude(relativeVelocityAlongNormal, e, invMass1, invMass2) {
    return -(1 + e) * relativeVelocityAlongNormal / (invMass1 + invMass2);
}

/**
 * تغير الطاقة الحركية في تصادم ثنائي (لإثبات التبدد التراكمي)
 * ΔK = 0.25 * m_red * (1 - e^2) * (v_rel · n)^2
 * المرجع: الدراسة - التبدد التراكمي للطاقة
 */
export function kineticEnergyLossInCollision(reducedMass, e, relativeVelocityAlongNormal) {
    return 0.25 * reducedMass * (1 - e * e) * relativeVelocityAlongNormal * relativeVelocityAlongNormal;
}

/**
 * معامل الارتداد الفعال مع الجدار المطاطي
 * v_out,n = -e_c * v_in,n
 * المرجع: الدراسة - التصادم العمودي وفقدان طاقة الانضغاط
 */
export function cushionNormalRebound(velocityInNormal, e_cushion) {
    return -e_cushion * velocityInNormal;
}

/**
 * نبضة الاحتكاك المماسي للجدار (حالة عامة بدون spin)
 * J_t = min(μ_c * J_n, m * |v_t|) في اتجاه معاكس لـ v_t
 * المرجع: الدراسة - انحراف زاوية الارتداد بسبب الاحتكاك (قسم 2)
 */
export function tangentialFrictionImpulse(v_tangential, normalImpulseMagnitude, mu_cushion, mass) {
    const maxFrictionImpulse = mu_cushion * normalImpulseMagnitude;
    const requiredImpulse = mass * v_tangential.length();
    const impulseMagnitude = Math.min(maxFrictionImpulse, requiredImpulse);
    if (impulseMagnitude < 1e-6) return new THREE.Vector3(0, 0, 0);
    const direction = v_tangential.clone().normalize().negate();
    return direction.multiplyScalar(impulseMagnitude);
}

/**
 * تحديث السرعة بعد نبضة مماسية على الجدار
 * v_t_out = v_t_in - J_t / m
 */
export function applyTangentialImpulse(velocityTangential, impulseVec, mass) {
    return velocityTangential.clone().sub(impulseVec.clone().divideScalar(mass));
}

/**
 * النقطة المثالية للضرب (Sweet Spot) - الارتفاع الذي يمنع الانزلاق
 * h = 7r/5
 * المرجع: الدراسة - النقطة المثالية للضرب (الاستنتاج النهائي)
 */
export function sweetSpotHeight(radius) {
    return 7 * radius / 5;
}

/**
 * إزاحة نقطة الضرب عن المركز (على الكرة) لتحقيق التدحرج النقي مباشرة
 * offsetY = h - r = 2r/5 (بالنسبة لمركز الكرة)
 */
export function sweetSpotOffset(radius) {
    return 2 * radius / 5; // موجب للأعلى من المركز
}