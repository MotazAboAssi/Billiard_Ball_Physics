import * as THREE from 'three';

export class CueStickManager {
    constructor(appContext, scene) {
        this.ctx = appContext;
        this.scene = scene;

        this.cueAngle = 0;
        this.isAiming = false;
        this.isStrikingAnimation = false;
        this.strikeProgress = 0;
        this.pointerStart = new THREE.Vector2();

        this.initCueStick();
        this.initAimLine();
    }

    initCueStick() {
        this.cuePivot = new THREE.Group();
        this.scene.add(this.cuePivot);

        const cueLength = 1.0;
        const cueGeo = new THREE.CylinderGeometry(0.012, 0.004, cueLength, 16);
        cueGeo.translate(0, cueLength / 2, 0);

        const cueMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.4 });
        this.cueMesh = new THREE.Mesh(cueGeo, cueMat);
        this.cueMesh.rotation.x = Math.PI / 2;
        this.cuePivot.add(this.cueMesh);
    }

    initAimLine() {
        const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.5)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({ color: 0x00ffaa, dashSize: 0.04, gapSize: 0.03 });
        this.aimLine = new THREE.Line(lineGeo, lineMat);
        this.aimLine.computeLineDistances();
        this.scene.add(this.aimLine);
    }

    handlePointerDown(e, cueBall) {
        if (!cueBall.isSleeping || cueBall.isPocketted || this.isStrikingAnimation) return false;

        if (e.button === 2 || e.shiftKey) {
            this.isAiming = true;
            this.pointerStart.set(e.clientX, e.clientY);
            return true;
        }
        return false;
    }

    handlePointerMove(e) {
        if (!this.isAiming) return;
        const deltaX = e.clientX - this.pointerStart.x;
        this.cueAngle += deltaX * 0.005;
        this.pointerStart.set(e.clientX, e.clientY);
    }

    handlePointerUp() {
        this.isAiming = false;
    }

    updateState(cueBall) {
        if (!cueBall.isSleeping || cueBall.isPocketted) {
            this.cuePivot.visible = false;
            this.aimLine.visible = false;
            return;
        }

        this.cuePivot.visible = true;
        this.cueMesh.visible = true;
        this.aimLine.visible = !this.isStrikingAnimation;

        this.cuePivot.position.copy(cueBall.position);
        this.cuePivot.rotation.y = this.cueAngle;

        if (!this.isStrikingAnimation) {
            this.cueMesh.position.set(0, 0, this.ctx.ballRadius + 0.02);
        }

        this.aimLine.position.copy(cueBall.position);
        this.aimLine.rotation.y = this.cueAngle;
    }

    animateStrike(frameTime, cueBall) {
        if (!this.isStrikingAnimation) return;

        this.strikeProgress += frameTime * 4;

        if (this.strikeProgress < 0.5) {
            // مرحلة السحب للخلف
            const t = this.strikeProgress / 0.5;
            const offset = THREE.MathUtils.lerp(0.02, 0.15, t);
            this.cueMesh.position.set(0, 0, this.ctx.ballRadius + offset);

        } else if (this.strikeProgress < 0.6) {
            // مرحلة الاندفاع للأمام
            const t = (this.strikeProgress - 0.5) / 0.1;
            const offset = THREE.MathUtils.lerp(0.15, 0.0, t);
            this.cueMesh.position.set(0, 0, this.ctx.ballRadius + offset);

        } else {
            // لحظة الاصطدام الفعلي
            this.isStrikingAnimation = false;
            this.cueMesh.visible = false;

            const config = this.ctx.physicsWorld.config;

            const cosA = Math.cos(this.cueAngle);
            const sinA = Math.sin(this.cueAngle);
            const strikeDirection = new THREE.Vector3(-sinA, 0, -cosA).normalize();

            cueBall.applyAdvancedStrike(
                config.strikeImpulse,
                strikeDirection,
                config.strikeOffsetX,
                config.strikeOffsetY
            );
        }
    }
}
