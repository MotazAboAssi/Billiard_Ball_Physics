import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class TableGraphics {
    constructor(appContext) {
        this.ctx = appContext;
        this.initScene();
        this.initLights();
        this.initTableStructure();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.4;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        document.body.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 30);
        this.camera.position.set(0, 2.5, 2.8);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0.75, 0);
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0xc8d0e8, 2.5));

        const topLight = new THREE.DirectionalLight(0xfff8ee, 1.2);
        topLight.position.set(0, 5, 0);
        topLight.castShadow = true;
        topLight.shadow.mapSize.width = 2048;
        topLight.shadow.mapSize.height = 2048;

        const d = 2.0;
        topLight.shadow.camera.left = -d * 0.6;
        topLight.shadow.camera.right = d * 0.6;
        topLight.shadow.camera.top = d;
        topLight.shadow.camera.bottom = -d;
        topLight.shadow.bias = -0.001;

        this.scene.add(topLight);
    }

    initTableStructure() {
        const W = this.ctx.tableWidth;
        const L = this.ctx.tableLength;
        const H = 0.75;
        const borderThickness = 0.09;
        const borderHeight = 0.05;
        const pRad = this.ctx.physicsWorld.pocketRadius;

        this.tableGroup = new THREE.Group();
        this.scene.add(this.tableGroup);

        const clothMat = new THREE.MeshStandardMaterial({ color: 0x145a46, roughness: 0.65 });
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(W, L), clothMat);
        cloth.rotation.x = -Math.PI / 2;
        cloth.position.y = 0.001;
        cloth.receiveShadow = true;
        this.tableGroup.add(cloth);

        const floorGeo = new THREE.PlaneGeometry(15, 15);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -H;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const pocketGeo = new THREE.CylinderGeometry(pRad, pRad * 0.8, 0.06, 32);
        const pocketMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });

        this.ctx.physicsWorld.pockets.forEach(pos => {
            const pocketMesh = new THREE.Mesh(pocketGeo, pocketMat);
            pocketMesh.position.set(pos.x, -0.028, pos.z);
            this.tableGroup.add(pocketMesh);
        });

        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.45, metalness: 0.1 });
        const sideSegmentLength = (L / 2) - (pRad * 2.2);
        const widthSegmentLength = W - (pRad * 2.4);

        const longCushionGeo = new THREE.BoxGeometry(borderThickness, borderHeight, sideSegmentLength);
        const positionsLong = [
            { x: -(W / 2 + borderThickness / 2), z: -(L / 4) },
            { x: -(W / 2 + borderThickness / 2), z: (L / 4) },
            { x: (W / 2 + borderThickness / 2), z: -(L / 4) },
            { x: (W / 2 + borderThickness / 2), z: (L / 4) }
        ];
        positionsLong.forEach(p => {
            const mesh = new THREE.Mesh(longCushionGeo, woodMat);
            mesh.position.set(p.x, borderHeight / 2, p.z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.tableGroup.add(mesh);
        });

        const shortCushionGeo = new THREE.BoxGeometry(widthSegmentLength, borderHeight, borderThickness);
        const positionsShort = [
            { x: 0, z: -(L / 2 + borderThickness / 2) },
            { x: 0, z: (L / 2 + borderThickness / 2) }
        ];
        positionsShort.forEach(p => {
            const mesh = new THREE.Mesh(shortCushionGeo, woodMat);
            mesh.position.set(p.x, borderHeight / 2, p.z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.tableGroup.add(mesh);
        });

        const bodyGeo = new THREE.BoxGeometry(W + borderThickness * 2, 0.15, L + borderThickness * 2);
        const bodyMesh = new THREE.Mesh(bodyGeo, woodMat);
        bodyMesh.position.set(0, -0.075, 0);
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
        this.tableGroup.add(bodyMesh);

        const legRadius = 0.06;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.7, H, 16);
        const legX = W / 2 - legRadius;
        const legZ = L / 2 - legRadius;
        const legPositions = [
            { x: -legX, z: -legZ }, { x: legX, z: -legZ },
            { x: -legX, z: legZ }, { x: legX, z: legZ }
        ];
        legPositions.forEach(pos => {
            const legMesh = new THREE.Mesh(legGeo, woodMat);
            legMesh.position.set(pos.x, -H / 2 - 0.01, pos.z);
            legMesh.castShadow = true; legMesh.receiveShadow = true;
            this.tableGroup.add(legMesh);
        });

        this._addTableMarkings(W, L);
    }

    _addTableMarkings(W, L) {
        const Y = 0.002;   // just above cloth surface
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
        const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.30 });

        const headLine = new THREE.Mesh(
            new THREE.PlaneGeometry(W - 0.02, 0.006),
            lineMat
        );
        headLine.rotation.x = -Math.PI / 2;
        headLine.position.set(0, Y, L / 4);
        this.tableGroup.add(headLine);

        const footSpot = new THREE.Mesh(
            new THREE.CircleGeometry(0.012, 16),
            spotMat
        );
        footSpot.rotation.x = -Math.PI / 2;
        footSpot.position.set(0, Y, -L / 4);
        this.tableGroup.add(footSpot);

        const headSpot = new THREE.Mesh(
            new THREE.CircleGeometry(0.012, 16),
            spotMat
        );
        headSpot.rotation.x = -Math.PI / 2;
        headSpot.position.set(0, Y, L / 4);
        this.tableGroup.add(headSpot);

        const centreSpot = new THREE.Mesh(
            new THREE.CircleGeometry(0.012, 16),
            spotMat
        );
        centreSpot.rotation.x = -Math.PI / 2;
        centreSpot.position.set(0, Y, 0);
        this.tableGroup.add(centreSpot);

        const centreLine = new THREE.Mesh(
            new THREE.PlaneGeometry(0.004, L - 0.02),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 })
        );
        centreLine.rotation.x = -Math.PI / 2;
        centreLine.position.set(0, Y, 0);
        this.tableGroup.add(centreLine);

        this._addChalkCube(W, L);
    }

    _addChalkCube(W, L) {
        const borderH   = 0.05;
        const borderThk = 0.09;
        const cubeSize  = 0.028;

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(cubeSize, cubeSize * 0.85, cubeSize),
            new THREE.MeshStandardMaterial({ color: 0x2e6b8a, roughness: 0.95, metalness: 0.0 })
        );
        const worn = new THREE.Mesh(
            new THREE.CircleGeometry(cubeSize * 0.35, 16),
            new THREE.MeshStandardMaterial({ color: 0x1a4a62, roughness: 1.0 })
        );
        worn.rotation.x = -Math.PI / 2;
        worn.position.y = cubeSize * 0.425 + 0.001;
        body.add(worn);

        body.position.set(
            W / 2 + borderThk * 0.5,          
            borderH + cubeSize * 0.425,        
            L / 4 - 0.06                       
        );
        this.tableGroup.add(body);
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}