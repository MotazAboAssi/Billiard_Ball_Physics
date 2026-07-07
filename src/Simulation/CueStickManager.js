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

        this.cueMesh = new THREE.Group();
        this.cueMesh.rotation.x = Math.PI / 2;
        this.cuePivot.add(this.cueMesh);

        const segs = [
            [0.0040, 0.0043, 0.013, 0.0065, 0x1a6bbf, 0.25, 0.0 ],  
            [0.0043, 0.0048, 0.022, 0.033,  0xeeeeee, 0.15, 0.05],  
            [0.0048, 0.0092, 0.580, 0.335,  0xf0d898, 0.30, 0.0 ],  
            [0.0092, 0.0105, 0.200, 0.725,  0x1e1208, 0.80, 0.0 ],  
            [0.0105, 0.0130, 0.185, 0.918,  0x4a2008, 0.45, 0.05],  
        ];

        segs.forEach(([rT, rB, len, cy, col, rough, metal]) => {
            const geo = new THREE.CylinderGeometry(rT, rB, len, 16);
            geo.translate(0, cy, 0);
            this.cueMesh.add(new THREE.Mesh(geo,
                new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal })
            ));
        });

        const ring = new THREE.CylinderGeometry(0.0115, 0.0115, 0.014, 16);
        ring.translate(0, 0.618, 0);
        this.cueMesh.add(new THREE.Mesh(ring,
            new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.15, metalness: 0.95 })
        ));

        const cap = new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16);
        cap.translate(0, 1.017, 0);
        this.cueMesh.add(new THREE.Mesh(cap,
            new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2, metalness: 0.9 })
        ));
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
            const t = this.strikeProgress / 0.5;
            const offset = THREE.MathUtils.lerp(0.02, 0.15, t);
            this.cueMesh.position.set(0, 0, this.ctx.ballRadius + offset);

        } else if (this.strikeProgress < 0.6) {
            const t = (this.strikeProgress - 0.5) / 0.1;
            const offset = THREE.MathUtils.lerp(0.15, 0.0, t);
            this.cueMesh.position.set(0, 0, this.ctx.ballRadius + offset);

        } else {
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