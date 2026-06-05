import * as THREE from 'three';
import * as Physics from './PhysicsLaws.js';
import { PhysicalBall } from './PhysicalBall';

export class PhysicsWorld {
    constructor() {
        this.balls = [];
        this.registeredForces = [];

        this.config = {
            gravity: 9.81,
            mu_sliding: 0.20,
            mu_rolling: 0.015,
            k_air: 0.005,
            e_ball: 0.96,
            e_cushion: 0.75,
            cushion_friction: 0.2,
            sleepThreshold: 0.006,
            strikeImpulse: 0.9,
            strikeOffsetX: 0.0,
            strikeOffsetY: 0.0
        };

        this.tableBounds = { minX: -0.635, maxX: 0.635, minZ: -1.27, maxZ: 1.27 };
        this.pocketRadius = 0.045;
        this.pockets = [
            new THREE.Vector3(-0.635, 0, -1.27), new THREE.Vector3(0.635, 0, -1.27),
            new THREE.Vector3(-0.635, 0, 0), new THREE.Vector3(0.635, 0, 0),
            new THREE.Vector3(-0.635, 0, 1.27), new THREE.Vector3(0.635, 0, 1.27)
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
        for (let ball of this.balls) {
            if (ball.isPocketted) continue;
            ball.applyStandardFriction(this.config, dt);
        }
        this.resolveBallCollisions();
        this.resolveCushionCollisions(); // الآن يتضمن الاحتكاك المماسي العام + spin
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
                    const correction = normal.clone().multiplyScalar((penetration / (b1.inverseMass + b2.inverseMass)) * 0.8);
                    b1.position.addScaledVector(correction, -b1.inverseMass);
                    b2.position.addScaledVector(correction, b2.inverseMass);

                    const relativeVelocity = new THREE.Vector3().subVectors(b2.velocity, b1.velocity);
                    const velAlongNormal = relativeVelocity.dot(normal);
                    if (velAlongNormal > 0) continue;

                    // استخدام قانون النبضة من PhysicsLaws
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
            let normal = new THREE.Vector3();

            // التعامل مع الحدود الأربعة (كل جدار على حدة)
            // نعالج كل تصادم بشكل فردي لضمان تطبيق الاحتكاك المماسي الصحيح
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

            if (hit) {
                ball.isSleeping = false;
            }
        }
    }

    /**
     * تطبيق تصادم الجدار مع احتساب:
     * 1. الارتداد العمودي (قانون نيوتن مع e_cushion)
     * 2. الاحتكاك المماسي العام (بدون spin) لتغيير زاوية الخروج
     * 3. تأثير الدوران المغزلي (spin coupling) الذي يعدل السرعة المماسية إضافياً
     */
    applyCushionCollision(ball, normal, e_c, mu_c) {
    // 1. تفكيك السرعة الخطية إلى مركبة عمودية ومماسية
    const vn = ball.velocity.dot(normal);
    const vt = ball.velocity.clone().sub(normal.clone().multiplyScalar(vn));
    
    // 2. الارتداد العمودي (معامل الارتداد الطبيعي)
    const vn_out = -e_c * vn;
    
    // 3. حساب السرعة المماسية بعد التصادم
    //    نطبق احتكاكاً بسيطاً: السرعة المماسية تقل بنسبة (1 - mu_c) ولا تنعكس
    //    هذا يمنع اكتساب سرعة وهمية ويحافظ على الزخم
    let vt_out = vt.clone().multiplyScalar(1 - mu_c);
    
    // 4. التعامل مع الدوران المغزلي (spin) بشكل صحيح
    //    يجب ألا نضيف سرعة خطية مباشرة، بل نعدل السرعة الزاوية فقط (يستهلك الاحتكاك جزءاً من الدوران)
    //    ونضيف تأثيراً بسيطاً جداً على vt_out يعادل تبادل الزخم الزاوي مع الخطي (مقادير صغيرة جداً)
    const r = ball.radius;
    const spinY = ball.angularVelocity.y;
    
    if (Math.abs(spinY) > 1e-4) {
        // تقدير السرعة الخطية التي قد تنتج عن تحول جزء صغير من spin إلى حركة خطية
        // لكن بمعامل تخميد كبير جداً لتجنب التسارع الوهمي
        // في الواقع، نقل spin إلى حركة خطية يحدث عبر الاحتكاك، وهو بالفعل ضمن mu_c
        // لذلك نكتفي بتقليل spin تدريجياً
        ball.angularVelocity.y *= (1 - mu_c * 0.5);
        
        // إضافة تأثير بسيط جداً على vt_out عند الجدران الجانبية (يحاكي دوران الكرة على الحافة)
        // هذا الجزء اختياري ويمكن إزالته إذا استمرت المشكلة
        if (Math.abs(normal.x) > 0.5) {
            // جدار جانبي، التأثير على المحور Z
            const influence = spinY * r * mu_c * 0.1;
            vt_out.z += influence;
        } else if (Math.abs(normal.z) > 0.5) {
            // جدار أمامي/خلفي، التأثير على المحور X
            const influence = spinY * r * mu_c * 0.1;
            vt_out.x += influence;
        }
    }
    
    // 5. إعادة تركيب السرعة النهائية
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
                    }
                }
            }
        }
    }
}