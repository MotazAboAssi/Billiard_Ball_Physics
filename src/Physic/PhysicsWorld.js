import * as THREE from 'three';
import * as Physics from './PhysicsLaws.js';

export class PhysicsWorld {
    constructor() {
        this.balls = [];
        this.registeredForces = [];

        // FIX: removed duplicate semicolon (was `};;`)
        this.config = {
            gravity: 9.81,
            mu_sliding: 0.15,
            mu_rolling: 0.005,
            k_air: 0.001,
            e_ball: 0.96,
            e_cushion: 0.75,
            cushion_friction: 0.2,
            sleepThreshold: 0.00005,
            strikeImpulse: 0.6,
            strikeOffsetX: 0.0,
            strikeOffsetY: 0.0
        };

        // Callbacks — يُعيِّنهما SimulationApp لتتبع اللعبة
        this.onBallPocketed        = null;  // (ballId) — عند تهريب أي كرة
        this.onCueBallFirstContact = null;  // (otherId) — أول تلامس للكرة البيضاء

        this.tableBounds = { minX: -0.635, maxX: 0.635, minZ: -1.27, maxZ: 1.27 };

        this.pocketRadius = 0.045;
        this.pockets = [
            new THREE.Vector3(-0.635, 0, -1.27), new THREE.Vector3(0.635, 0, -1.27),
            new THREE.Vector3(-0.635, 0, 0),     new THREE.Vector3(0.635, 0, 0),
            new THREE.Vector3(-0.635, 0, 1.27),  new THREE.Vector3(0.635, 0, 1.27)
        ];
    }

    addBall(ball) {
        ball.worldBallsRef = this.balls;
        this.balls.push(ball);
    }

    updateParameters(newParams) {
        this.config = { ...this.config, ...newParams };
    }

    registerExternalForce(forceInstance) {
        this.registeredForces.push(forceInstance);
    }

    getTotalKineticEnergy() {
        let totalEnergy = 0;
        for (let ball of this.balls) {
            if (!ball.isPocketted && !ball.isSleeping) {
                totalEnergy += ball.getKineticEnergy();
            }
        }
        return totalEnergy;
    }

    update(dt) {
        // تطبيق الاحتكاك على كل كرة
        for (let ball of this.balls) {
            if (ball.isPocketted) continue;
            ball.applyStandardFriction(this.config, dt);
        }

        // FIX: القوى الخارجية المسجلة كانت لا تُطبَّق أبداً — تم إضافة الحلقة هنا
        for (let force of this.registeredForces) {
            if (!force.enabled) continue;
            for (let ball of this.balls) {
                if (!ball.isPocketted) {
                    force.apply(ball, this.config, dt);
                }
            }
        }

        this.resolveBallCollisions();
        this.resolveCushionCollisions();
        this.checkPocketCollisions();
    }

    resolveBallCollisions() {
        for (let i = 0; i < this.balls.length; i++) {
            for (let j = i + 1; j < this.balls.length; j++) {
                const b1 = this.balls[i];
                const b2 = this.balls[j];
                if (b1.isPocketted || b2.isPocketted) continue;

                const delta = new THREE.Vector3().subVectors(b2.position, b1.position);
                delta.y = 0;
                const distance = delta.length();
                const minDistance = b1.radius + b2.radius;

                if (distance < minDistance) {
                    const normal = delta.clone().normalize();
                    const penetration = minDistance - distance;
                    const correction = normal.clone().multiplyScalar(
                        (penetration / (b1.inverseMass + b2.inverseMass)) * 0.8
                    );
                    b1.position.addScaledVector(correction, -b1.inverseMass);
                    b2.position.addScaledVector(correction, b2.inverseMass);

                    const relativeVelocity = new THREE.Vector3().subVectors(b2.velocity, b1.velocity);
                    const velAlongNormal = relativeVelocity.dot(normal);
                    if (velAlongNormal > 0) continue;

                    const jImpulse = Physics.collisionImpulseMagnitude(
                        velAlongNormal,
                        this.config.e_ball,
                        b1.inverseMass,
                        b2.inverseMass
                    );
                    const impulse = normal.clone().multiplyScalar(jImpulse);
                    b1.velocity.addScaledVector(impulse, -b1.inverseMass);
                    b2.velocity.addScaledVector(impulse, b2.inverseMass);
                    b1.isSleeping = false;
                    b2.isSleeping = false;

                    // إشعار اللعبة بأول تلامس للكرة البيضاء
                    if (this.onCueBallFirstContact) {
                        if (b1.id === 0) this.onCueBallFirstContact(b2.id);
                        else if (b2.id === 0) this.onCueBallFirstContact(b1.id);
                    }
                }
            }
        }
    }

    resolveCushionCollisions() {
        const e_c = this.config.e_cushion;
        const mu_c = this.config.cushion_friction;

        for (let ball of this.balls) {
            if (ball.isSleeping || ball.isPocketted) continue;
            let hit = false;

            if (ball.position.x - ball.radius < this.tableBounds.minX) {
                ball.position.x = this.tableBounds.minX + ball.radius;
                this.applyCushionCollision(ball, new THREE.Vector3(1, 0, 0), e_c, mu_c);
                hit = true;
            } else if (ball.position.x + ball.radius > this.tableBounds.maxX) {
                ball.position.x = this.tableBounds.maxX - ball.radius;
                this.applyCushionCollision(ball, new THREE.Vector3(-1, 0, 0), e_c, mu_c);
                hit = true;
            }
            if (ball.position.z - ball.radius < this.tableBounds.minZ) {
                ball.position.z = this.tableBounds.minZ + ball.radius;
                this.applyCushionCollision(ball, new THREE.Vector3(0, 0, 1), e_c, mu_c);
                hit = true;
            } else if (ball.position.z + ball.radius > this.tableBounds.maxZ) {
                ball.position.z = this.tableBounds.maxZ - ball.radius;
                this.applyCushionCollision(ball, new THREE.Vector3(0, 0, -1), e_c, mu_c);
                hit = true;
            }

            if (hit) ball.isSleeping = false;
        }
    }

    applyCushionCollision(ball, normal, e_c, mu_c) {
        const vn = ball.velocity.dot(normal);
        const vt = ball.velocity.clone().sub(normal.clone().multiplyScalar(vn));

        const vn_out = -e_c * vn;
        let vt_out = vt.clone().multiplyScalar(1 - mu_c);

        // FIX: دوران التدحرج (x, z) كان متروكاً متطابقاً مع اتجاه الحركة قبل
        // الارتطام، فيتعارض مع اتجاه السرعة الجديد بعد الارتداد ويُبقي الكرة في
        // طور انزلاق طويل وهمي. الجدار يُخمد جزءاً من هذا الدوران أيضاً أثناء
        // التصادم الانضغاطي السريع، تماماً كما يُخمد السرعة المماسية أعلاه
        ball.angularVelocity.x *= (1 - mu_c);
        ball.angularVelocity.z *= (1 - mu_c);

        const r = ball.radius;
        const spinY = ball.angularVelocity.y;

        if (Math.abs(spinY) > 1e-4) {
            ball.angularVelocity.y *= (1 - mu_c * 0.5);

            if (Math.abs(normal.x) > 0.5) {
                vt_out.z += spinY * r * mu_c * 0.1;
            } else if (Math.abs(normal.z) > 0.5) {
                vt_out.x += spinY * r * mu_c * 0.1;
            }
        }

        ball.velocity.copy(vt_out.clone().add(normal.clone().multiplyScalar(vn_out)));
    }

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
                        const pullForce = 21.0;
                        ball.velocity.x += (distX / dist2D) * pullForce * 0.008;
                        ball.velocity.z += (distZ / dist2D) * pullForce * 0.008;
                    } else {
                        ball.isPocketted = true;
                        ball.velocity.set(0, 0, 0);
                        ball.angularVelocity.set(0, 0, 0);
                        ball.isSleeping = true;
                        ball.position.y = -this.pocketRadius * 2;
                        if (this.onBallPocketed) this.onBallPocketed(ball.id);
                    }
                }
            }
        }
    }
}
