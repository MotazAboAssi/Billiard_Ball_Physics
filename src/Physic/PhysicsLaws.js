import * as THREE from 'three';

export function momentOfInertiaSolidSphere(mass, radius) {
    return (2 / 5) * mass * radius * radius;
}

export function linearKineticEnergy(mass, velocityVec) {
    return 0.5 * mass * velocityVec.lengthSq();
}

export function rotationalKineticEnergy(inertia, angularVelocityVec) {
    return 0.5 * inertia * angularVelocityVec.lengthSq();
}

export function linearVelocityFromImpulse(impulseVec, mass) {
    return impulseVec.clone().divideScalar(mass);
}

export function angularVelocityFromImpulse(impulseVec, leverArmVec, inertia) {
    const angularImpulse = new THREE.Vector3().crossVectors(leverArmVec, impulseVec);
    return angularImpulse.divideScalar(inertia);
}

export function slidingFrictionMagnitude(muSliding, mass, gravity) {
    return muSliding * mass * gravity;
}

export function slidingLinearAcceleration(muSliding, gravity, directionVec) {
    return directionVec.clone().negate().multiplyScalar(muSliding * gravity);
}

export function slidingTorque(radiusVec, frictionForceVec) {
    return new THREE.Vector3().crossVectors(radiusVec, frictionForceVec);
}

export function isPureRolling(linearVelocity, angularVelocity, radiusVec, threshold = 1e-4) {
    const tangential = new THREE.Vector3().crossVectors(angularVelocity, radiusVec);
    const contactVelocity = linearVelocity.clone().add(tangential);
    return contactVelocity.length() < threshold;
}

export function enforceRollingConstraint(linearVelocity, radius, previousAngularVelocity) {
    const newAngularVelocity = previousAngularVelocity.clone();
    newAngularVelocity.x = linearVelocity.z / radius;
    newAngularVelocity.z = -linearVelocity.x / radius;
    return newAngularVelocity;
}

export function rollingResistanceForce(muRolling, mass, gravity, velocityVec) {
    if (velocityVec.length() < 1e-6) return new THREE.Vector3(0, 0, 0);
    const direction = velocityVec.clone().normalize();
    const magnitude = muRolling * mass * gravity;
    return direction.multiplyScalar(-magnitude);
}

export function collisionImpulseMagnitude(relativeVelocityAlongNormal, e, invMass1, invMass2) {
    return -(1 + e) * relativeVelocityAlongNormal / (invMass1 + invMass2);
}

export function kineticEnergyLossInCollision(reducedMass, e, relativeVelocityAlongNormal) {
    return 0.25 * reducedMass * (1 - e * e) * relativeVelocityAlongNormal * relativeVelocityAlongNormal;
}

export function cushionNormalRebound(velocityInNormal, e_cushion) {
    return -e_cushion * velocityInNormal;
}

export function tangentialFrictionImpulse(v_tangential, normalImpulseMagnitude, mu_cushion, mass) {
    const maxFrictionImpulse = mu_cushion * normalImpulseMagnitude;
    const requiredImpulse = mass * v_tangential.length();
    const impulseMagnitude = Math.min(maxFrictionImpulse, requiredImpulse);
    if (impulseMagnitude < 1e-6) return new THREE.Vector3(0, 0, 0);
    const direction = v_tangential.clone().normalize().negate();
    return direction.multiplyScalar(impulseMagnitude);
}

export function applyTangentialImpulse(velocityTangential, impulseVec, mass) {
    return velocityTangential.clone().sub(impulseVec.clone().divideScalar(mass));
}

export function sweetSpotHeight(radius) {
    return 7 * radius / 5;
}

export function sweetSpotOffset(radius) {
    return 2 * radius / 5;
}