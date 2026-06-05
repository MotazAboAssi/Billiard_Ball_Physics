import * as THREE from 'three';

export class PhysicalBall {
    constructor(id, position, radius, mass) {
        this.id = id;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.angularVelocity = new THREE.Vector3(0, 0, 0);
        this.radius = radius;
        this.mass = mass;
        this.inertia = (2 / 5) * mass * radius * radius;
        this.inverseMass = 1 / mass;
        this.isSleeping = true;
        this.worldBallsRef = null;
        this.isPocketted = false; // خاصية جديدة لمعرفة هل سقطت الكرة أم لا
    }

    getKineticEnergy() {
        return (0.5 * this.mass * this.velocity.lengthSq()) + (0.5 * this.inertia * this.angularVelocity.lengthSq());
    }

    applyCueStrike(impulseMagnitude, offsetX, offsetY) {
        this.isSleeping = false;
        const strikeDirection = new THREE.Vector3(0, 0, -1);
        const linearImpulse = strikeDirection.clone().multiplyScalar(impulseMagnitude);
        this.velocity.addScaledVector(linearImpulse, this.inverseMass);

        const contactPointOffset = new THREE.Vector3(offsetX, offsetY, this.radius);
        const angularImpulse = new THREE.Vector3().crossVectors(contactPointOffset, linearImpulse);
        this.angularVelocity.addScaledVector(angularImpulse, 1 / this.inertia);
    }

    applyStandardFriction(config, dt) {
        if (this.isSleeping) return;

        const g = config.gravity;
        const rVector = new THREE.Vector3(0, -this.radius, 0);
        const tangentialVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, rVector);
        const v_relative = new THREE.Vector3().addVectors(this.velocity, tangentialVelocity);

        if (v_relative.length() > 0.001) {
            const F_sliding = v_relative.clone().normalize().negate().multiplyScalar(config.mu_sliding * this.mass * g);
            this.velocity.addScaledVector(F_sliding.clone().divideScalar(this.mass), dt);
            const torque = new THREE.Vector3().crossVectors(rVector, F_sliding);
            this.angularVelocity.addScaledVector(torque.divideScalar(this.inertia), dt);
        } else {
            if (this.velocity.length() > 0.001) {
                const F_rolling = this.velocity.clone().normalize().negate().multiplyScalar(config.mu_rolling * this.mass * g);
                this.velocity.addScaledVector(F_rolling.divideScalar(this.mass), dt);
                this.angularVelocity.set(this.velocity.z / this.radius, 0, -this.velocity.x / this.radius);
            }
        }
        this.velocity.addScaledVector(this.velocity.clone().negate().multiplyScalar(config.k_air), dt);
        this.position.addScaledVector(this.velocity, dt);

        // if (this.velocity.length() < 0.01) {
        //     this.velocity.set(0, 0, 0);
        //     this.angularVelocity.set(0, 0, 0);
        //     this.isSleeping = true;
        // }
        // الحل الجديد: حساب الطاقة الحركية الكلية الحالية للكرة
        const totalKineticEnergy = this.getKineticEnergy();

        // إذا كانت الطاقة الكلية أقل من العتبة المحددة في الإعدادات
        if (totalKineticEnergy < config.sleepThreshold) {
            this.velocity.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);
            this.isSleeping = true;
        }
    }
}

export class PhysicsWorld {
    constructor() {
        this.balls = [];
        this.registeredForces = [];
        this.config = {
            gravity: 9.81, mu_sliding: 0.20, mu_rolling: 0.015, k_air: 0.005,
            e_ball: 0.96, e_cushion: 0.85, cushion_friction: 0.2,
            strikeImpulse: 0.9, cueOffsetX: 0.0, cueOffsetY: 0.0,
            // أضف هذا المتغير الجديد هنا (عتبة الطاقة الأدنى للنوم)
            sleepThreshold: 0.00599,
            strikeImpulse: 0.9, strikeOffsetX: 0.0, strikeOffsetY: 0.0
        };
        this.tableBounds = { minX: -0.635, maxX: 0.635, minZ: -1.27, maxZ: 1.27 };

        // نصف قطر الحفرة فيزيائياً (أكبر قليلاً من نصف قطر الكرة ليسمح بالسقوط السلس)
        this.pocketRadius = 0.045;

        // تحديد أماكن الحفر الستة بناءً على أبعاد الطاولة

        this.pockets = [
            new THREE.Vector3(-0.635, 0, -1.27), // زاوية عليا يسار
            new THREE.Vector3(0.635, 0, -1.27),  // زاوية عليا يمين
            new THREE.Vector3(-0.635, 0, 0),     // منتصف يسار
            new THREE.Vector3(0.635, 0, 0),      // منتصف يمين
            new THREE.Vector3(-0.635, 0, 1.27),  // زاوية سفلى يسار
            new THREE.Vector3(0.635, 0, 1.27)    // زاوية سفلى يمين
        ];
    }

    addBall(ball) {
        ball.worldBallsRef = this.balls;
        this.balls.push(ball);
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
            if (ball.isPocketted) continue; // تجاهل الكرات التي سقطت

            ball.applyStandardFriction(this.config, dt);
            for (let force of this.registeredForces) {
                force.apply(ball, this.config, dt);
            }
        }
        this.resolveBallCollisions();
        this.resolveCushionCollisions();
        this.checkPocketCollisions(); // فحص السقوط في الحفر في كل إطار
    }

    resolveBallCollisions() {
        for (let i = 0; i < this.balls.length; i++) {
            for (let j = i + 1; j < this.balls.length; j++) {
                const b1 = this.balls[i]; const b2 = this.balls[j];
                if (b1.isPocketted || b2.isPocketted) continue; // تجاهل الكرات الساقطة

                const delta = new THREE.Vector3().subVectors(b2.position, b1.position); delta.y = 0;
                const distance = delta.length(); const minDistance = b1.radius + b2.radius;

                if (distance < minDistance) {
                    const normal = delta.clone().normalize();
                    const penetration = minDistance - distance;
                    const correction = normal.clone().multiplyScalar((penetration / (b1.inverseMass + b2.inverseMass)) * 0.8);
                    b1.position.addScaledVector(correction, -b1.inverseMass);
                    b2.position.addScaledVector(correction, b2.inverseMass);

                    const relativeVelocity = new THREE.Vector3().subVectors(b2.velocity, b1.velocity);
                    if (relativeVelocity.dot(normal) > 0) continue;

                    let jImpulse = -(1 + this.config.e_ball) * relativeVelocity.dot(normal) / (b1.inverseMass + b2.inverseMass);
                    const impulse = normal.clone().multiplyScalar(jImpulse);
                    b1.velocity.addScaledVector(impulse, -b1.inverseMass);
                    b2.velocity.addScaledVector(impulse, b2.inverseMass);
                    b1.isSleeping = false; b2.isSleeping = false;
                }
            }
        }
    }

    resolveCushionCollisions() {
        const e_c = this.config.e_cushion; const mu_c = this.config.cushion_friction;
        for (let ball of this.balls) {
            if (ball.isSleeping || ball.isPocketted) continue;
            let hit = false; let normal = new THREE.Vector3();

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
                const effectVelocity = ball.angularVelocity.y * ball.radius;
                if (Math.abs(effectVelocity) > 0.01) {
                    ball.velocity.addScaledVector(new THREE.Vector3(-normal.z, 0, normal.x), effectVelocity * mu_c);
                }
            }
        }
    }

    // دالة جديدة لفحص ما إذا كانت الكرة فوق حفرة وسقطت فيها
    checkPocketCollisions() {
        for (let ball of this.balls) {
            if (ball.isPocketted) continue;

            for (let pocket of this.pockets) {
                const distX = pocket.x - ball.position.x;
                const distZ = pocket.z - ball.position.z;
                const dist2D = Math.sqrt(distX * distX + distZ * distZ);

                // عتبة الجاذبية: عندما تصبح حافة الكرة فوق فوهة الحفرة
                const gravityThreshold = this.pocketRadius + ball.radius * 0.5;

                if (dist2D < gravityThreshold) {
                    ball.isSleeping = false; // تفعيل الكرة لمنع تجمدها أثناء السقوط

                    if (dist2D > this.pocketRadius) {
                        // 1. تأثير الجذب (تأثير الشفط لمركز الحفرة)
                        const pullForce = 20.5; // شدة سحب الحفرة
                        ball.velocity.x += (distX / dist2D) * pullForce * 0.008;
                        ball.velocity.z += (distZ / dist2D) * pullForce * 0.008;
                    } else {
                        // 2. السقوط الفعلي الكامل في عمق الحفرة عندما تقترب جداً من المركز
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
