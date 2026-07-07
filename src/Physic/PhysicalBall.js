import * as THREE from 'three';
import * as Physics from './PhysicsLaws.js';

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

    getKineticEnergy() {
        const linearKE = Physics.linearKineticEnergy(this.mass, this.velocity);
        const rotationalKE = Physics.rotationalKineticEnergy(this.inertia, this.angularVelocity);
        return linearKE + rotationalKE;
    }

    applyAdvancedStrike(impulseMagnitude, strikeDirection, offsetX, offsetY) {
        this.isSleeping = false;

        const maxOffsetMag = this.radius * 0.7;
        const offsetMag = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        if (offsetMag > maxOffsetMag) {
            const scale = maxOffsetMag / offsetMag;
            offsetX *= scale;
            offsetY *= scale;
        }

        const forward = strikeDirection.clone().normalize();

        const linearImpulse = forward.clone().multiplyScalar(impulseMagnitude);
        this.velocity.add(Physics.linearVelocityFromImpulse(linearImpulse, this.mass));

        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        const perpUp = new THREE.Vector3().crossVectors(right, forward).normalize();

        const contactPointOffset = new THREE.Vector3()
            .addScaledVector(forward, -this.radius)
            .addScaledVector(right, offsetX)
            .addScaledVector(perpUp, offsetY);

        const deltaOmega = Physics.angularVelocityFromImpulse(linearImpulse, contactPointOffset, this.inertia);
        this.angularVelocity.add(deltaOmega);
    }

    applySweetSpotStrike(impulseMagnitude, strikeDirection) {
        const offsetY = Physics.sweetSpotOffset(this.radius);
        this.applyAdvancedStrike(impulseMagnitude, strikeDirection, 0, offsetY);
    }

    applyStandardFriction(config, dt) {
        if (this.isSleeping || this.isPocketted) return;

        const g = config.gravity;
        const rVector = new THREE.Vector3(0, -this.radius, 0);

        const tangentialVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, rVector);
        const v_relative = new THREE.Vector3().addVectors(this.velocity, tangentialVelocity);
        const vcMag = v_relative.length();

        if (vcMag > 0.0185) {
            const slidingMag = Physics.slidingFrictionMagnitude(config.mu_sliding, this.mass, g);
            const frictionForce = v_relative.clone().normalize().negate().multiplyScalar(slidingMag);

            const deltaV = frictionForce.clone().divideScalar(this.mass).multiplyScalar(dt);
            const torque = Physics.slidingTorque(rVector, frictionForce);
            const deltaOmega = torque.clone().divideScalar(this.inertia).multiplyScalar(dt);

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
            if (this.velocity.length() > 0.001) {
                const rollingForce = Physics.rollingResistanceForce(config.mu_rolling, this.mass, g, this.velocity);
                this.velocity.addScaledVector(rollingForce.divideScalar(this.mass), dt);
            }

            const newAngularVelocity = Physics.enforceRollingConstraint(this.velocity, this.radius, this.angularVelocity);
            this.angularVelocity.copy(newAngularVelocity);
        }

        if (Math.abs(this.angularVelocity.y) > 0.01) {
            const torsionalDamping = 2.0;
            this.angularVelocity.y -= this.angularVelocity.y * torsionalDamping * dt;
        }

        this.velocity.addScaledVector(this.velocity.clone().negate().multiplyScalar(config.k_air), dt);

        this.position.addScaledVector(this.velocity, dt);

        if (this.velocity.length() < 0.002 && this.angularVelocity.length() < 0.0355) {
            const gravityThreshold = this._pocketRadius
                ? this._pocketRadius + this.radius * 0.55
                : -1;
            const nearPocket = this._pocketsRef && this._pocketsRef.some(p => {
                const dx = p.x - this.position.x;
                const dz = p.z - this.position.z;
                return Math.sqrt(dx * dx + dz * dz) < gravityThreshold;
            });
            if (!nearPocket) {
                this.velocity.set(0, 0, 0);
                this.angularVelocity.set(0, 0, 0);
                this.isSleeping = true;
            }
        }
    }
}