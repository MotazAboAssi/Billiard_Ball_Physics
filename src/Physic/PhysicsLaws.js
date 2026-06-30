import * as THREE from 'three';

// PhysicsLaws.js
// هذا الملف يحتوي على جميع القوانين الفيزيائية المستخلصة من الدراسة
// يمكن استخدامها من قبل PhysicalBall و PhysicsWorld لضمان الاتساق وقابلية الصيانة

/**
 * قانون عزم القصور الذاتي لكرة مصمتة
 * I = (2/5) * m * r^2
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
 * السرعة الخطية الناتجة عن نبضة
 * v = J / m
 */
export function linearVelocityFromImpulse(impulseVec, mass) {
    return impulseVec.clone().divideScalar(mass);
}

/**
 * السرعة الزاوية الناتجة عن نبضة ذات ذراع قوة
 * ω = (r × J) / I
 */
export function angularVelocityFromImpulse(impulseVec, leverArmVec, inertia) {
    const angularImpulse = new THREE.Vector3().crossVectors(leverArmVec, impulseVec);
    return angularImpulse.divideScalar(inertia);
}

/**
 * قوة الاحتكاك الحركي أثناء الانزلاق
 * f_k = μ_k * m * g
 */
export function slidingFrictionMagnitude(muSliding, mass, gravity) {
    return muSliding * mass * gravity;
}

/**
 * التسارع الخطي الناتج عن الاحتكاك الحركي
 * a = -μ_k * g
 */
export function slidingLinearAcceleration(muSliding, gravity, directionVec) {
    return directionVec.clone().negate().multiplyScalar(muSliding * gravity);
}

/**
 * عزم الاحتكاك الحركي
 * τ = r × f_k
 */
export function slidingTorque(radiusVec, frictionForceVec) {
    return new THREE.Vector3().crossVectors(radiusVec, frictionForceVec);
}

/**
 * شرط التدحرج النقي
 * v_contact = v + ω × r = 0
 */
export function isPureRolling(linearVelocity, angularVelocity, radiusVec, threshold = 1e-4) {
    const tangential = new THREE.Vector3().crossVectors(angularVelocity, radiusVec);
    const contactVelocity = linearVelocity.clone().add(tangential);
    return contactVelocity.length() < threshold;
}

/**
 * قيد السرعة الزاوية في حالة التدحرج النقي
 * ω × r = -v  →  يحفظ spin حول محور Y
 */
export function enforceRollingConstraint(linearVelocity, radius, previousAngularVelocity) {
    const newAngularVelocity = previousAngularVelocity.clone();
    newAngularVelocity.x = linearVelocity.z / radius;
    newAngularVelocity.z = -linearVelocity.x / radius;
    // الحفاظ التام على الدوران المغزلي العمودي (Spin Y)
    return newAngularVelocity;
}

/**
 * قوة مقاومة التدحرج
 * F_rolling = -μ_r * m * g * (v / |v|)
 */
export function rollingResistanceForce(muRolling, mass, gravity, velocityVec) {
    if (velocityVec.length() < 1e-6) return new THREE.Vector3(0, 0, 0);
    const direction = velocityVec.clone().normalize();
    const magnitude = muRolling * mass * gravity;
    return direction.multiplyScalar(-magnitude);
}

/**
 * نبضة التصادم المرن بين كرتين
 * j = -(1 + e) * v_rel · n / (1/m1 + 1/m2)
 */
export function collisionImpulseMagnitude(relativeVelocityAlongNormal, e, invMass1, invMass2) {
    return -(1 + e) * relativeVelocityAlongNormal / (invMass1 + invMass2);
}

/**
 * تغير الطاقة الحركية في تصادم ثنائي
 * ΔK = 0.25 * m_red * (1 - e^2) * (v_rel · n)^2
 */
export function kineticEnergyLossInCollision(reducedMass, e, relativeVelocityAlongNormal) {
    return 0.25 * reducedMass * (1 - e * e) * relativeVelocityAlongNormal * relativeVelocityAlongNormal;
}

/**
 * معامل الارتداد الفعال مع الجدار
 * v_out,n = -e_c * v_in,n
 */
export function cushionNormalRebound(velocityInNormal, e_cushion) {
    return -e_cushion * velocityInNormal;
}

/**
 * نبضة الاحتكاك المماسي للجدار
 * J_t = min(μ_c * J_n, m * |v_t|)
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
 */
export function applyTangentialImpulse(velocityTangential, impulseVec, mass) {
    return velocityTangential.clone().sub(impulseVec.clone().divideScalar(mass));
}

/**
 * النقطة المثالية للضرب (Sweet Spot)
 * h = 7r/5
 */
export function sweetSpotHeight(radius) {
    return 7 * radius / 5;
}

/**
 * إزاحة نقطة الضرب عن المركز
 * offsetY = 2r/5
 */
export function sweetSpotOffset(radius) {
    return 2 * radius / 5;
}
