import * as THREE from 'three';

// الواجهة الأساسية لأي قانون فيزيائي خارجي
export class IExternalForce {
    constructor(name) {
        this.name = name;
        this.enabled = true;
    }
    apply(ball, config, dt) { }
    setupGUI(folder) { }
}

// أ: قانون مقاومة الرياح الجانبية المتغيرة
export class WindBlowForce extends IExternalForce {
    constructor() {
        super('الرياح الجانبية');
        this.intensity = 0.0;
    }
    apply(ball, config, dt) {
        if (!this.enabled || ball.isSleeping) return;
        ball.velocity.x += this.intensity * dt;
    }
    setupGUI(folder) {
        folder.add(this, 'enabled').name('تفعيل الرياح');
        folder.add(this, 'intensity', -2, 2, 0.1).name('شدة الرياح (X)');
    }
}

// ب: قانون الحقل المغناطيسي للكرة البيضاء
export class MagneticCueBallForce extends IExternalForce {
    constructor() {
        super('الحقل المغناطيسي');
        this.magneticPull = 0.0;
    }
    apply(ball, config, dt) {
        if (!this.enabled || ball.id === 0) return;

        const cueBall = ball.worldBallsRef ? ball.worldBallsRef[0] : null;
        if (!cueBall || cueBall.isSleeping) return;

        const dir = new THREE.Vector3().subVectors(cueBall.position, ball.position);
        dir.y = 0;
        const dist = dir.length();

        if (dist > 0.1 && dist < 0.8) {
            dir.normalize();
            const forceMagnitude = this.magneticPull / (dist * dist);
            ball.velocity.addScaledVector(dir, forceMagnitude * dt);
            ball.isSleeping = false;
        }
    }
    setupGUI(folder) {
        folder.add(this, 'enabled').name('تفعيل المغناطيس');
        folder.add(this, 'magneticPull', -0.1, 0.1, 0.005).name('قوة التجاذب للبيضاء');
    }
}
