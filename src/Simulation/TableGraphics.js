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
        this.scene.background = new THREE.Color(0x0a0a0a);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 15);
        // تم تعديل موقع الكاميرا لتلقط المشهد المرتفع الجديد بالكامل وبشكل مريح
        this.camera.position.set(0, 2.5, 2.8);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0.75, 0); // جعل الكاميرا تدور حول مركز الطاولة المرتفع
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

        const topLight = new THREE.DirectionalLight(0xffffff, 1.2);
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
        const H = 0.75; // الارتفاع المعماري عن الأرض
        const borderThickness = 0.09;
        const borderHeight = 0.05;
        const pRad = this.ctx.physicsWorld.pocketRadius;

        // المجموعة الرئيسية: سنبقيها عند الصفر لكي تتطابق إحداثيات الرسوميات مع الفيزياء تماماً!
        this.tableGroup = new THREE.Group();
        this.scene.add(this.tableGroup);

        // 1️⃣ القماش الأخضر (الملعب) - يبقى عند Y = 0 ليتطابق مع حركة الكرات الفيزيائية
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x145a46, roughness: 0.65 });
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(W, L), clothMat);
        cloth.rotation.x = -Math.PI / 2;
        cloth.position.y = 0.001; // رفع طفيف جداً لمنع أي وميض بصري مع أي مسطح تحتها
        cloth.receiveShadow = true;
        this.tableGroup.add(cloth);

        // 2️⃣ الأرضية (تحت الأرجل بالكامل لتبدو واقعية)
        const floorGeo = new THREE.PlaneGeometry(15, 15);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -H; // إنزال الأرضية للأسفل بمقدار طول الأرجل
        floor.receiveShadow = true;
        this.scene.add(floor);

        // 3️⃣ الحفر والجيوب (تفريغ بصري مائل لأسفل الفوهات)
        const pocketGeo = new THREE.CylinderGeometry(pRad, pRad * 0.8, 0.06, 32);
        const pocketMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
        
        this.ctx.physicsWorld.pockets.forEach(pos => {
            const pocketMesh = new THREE.Mesh(pocketGeo, pocketMat);
            pocketMesh.position.set(pos.x, -0.028, pos.z);
            this.tableGroup.add(pocketMesh);
        });

        // 4️⃣ قطع الحواف الستة المفرغة (تمنع الاصطدام بالخشب الممتد وتفتح الحفر)
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.45, metalness: 0.1 });
        const sideSegmentLength = (L / 2) - (pRad * 2.2);
        const widthSegmentLength = W - (pRad * 2.4);

        // الحواف الطولية (4 قطع)
        const longCushionGeo = new THREE.BoxGeometry(borderThickness, borderHeight, sideSegmentLength);
        const positionsLong = [
            { x: -(W/2 + borderThickness/2), z: -(L/4) },
            { x: -(W/2 + borderThickness/2), z: (L/4) },
            { x: (W/2 + borderThickness/2),  z: -(L/4) },
            { x: (W/2 + borderThickness/2),  z: (L/4) }
        ];
        positionsLong.forEach(p => {
            const mesh = new THREE.Mesh(longCushionGeo, woodMat);
            mesh.position.set(p.x, borderHeight / 2, p.z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.tableGroup.add(mesh);
        });

        // الحواف العرضية (قطعتان)
        const shortCushionGeo = new THREE.BoxGeometry(widthSegmentLength, borderHeight, borderThickness);
        const positionsShort = [
            { x: 0, z: -(L/2 + borderThickness/2) },
            { x: 0, z: (L/2 + borderThickness/2) }
        ];
        positionsShort.forEach(p => {
            const mesh = new THREE.Mesh(shortCushionGeo, woodMat);
            mesh.position.set(p.x, borderHeight / 2, p.z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.tableGroup.add(mesh);
        });

        // 5️⃣ الهيكل السفلي (Chassis) - تم تفريغه ذكياً عبر إنزاله تحت مستوى القماش لتجنب الارتجاف اللوني نهائياً!
        const bodyGeo = new THREE.BoxGeometry(W + borderThickness * 2, 0.15, L + borderThickness * 2);
        const bodyMesh = new THREE.Mesh(bodyGeo, woodMat);
        // إنزاله بالكامل ليكون تحت القماش الأخضر مباشرة ولا يتداخلا
        bodyMesh.position.set(0, -0.075, 0); 
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
        this.tableGroup.add(bodyMesh);

        // 6️⃣ أرجل الطاولة الأربعة (تبدأ من الأرض المفرغة صعوداً لقاع الطاولة)
        const legRadius = 0.06;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.7, H, 16);
        const legX = W / 2 - legRadius;
        const legZ = L / 2 - legRadius;
        const legPositions = [
            { x: -legX, z: -legZ }, { x: legX,  z: -legZ },
            { x: -legX, z: legZ },  { x: legX,  z: legZ }
        ];
        legPositions.forEach(pos => {
            const legMesh = new THREE.Mesh(legGeo, woodMat);
            // تثبيتها في العمق لتبدأ من مستوى الأرضية وتلتحم بأسفل شاسيه الطاولة
            legMesh.position.set(pos.x, -H / 2 - 0.01, pos.z);
            legMesh.castShadow = true; legMesh.receiveShadow = true;
            this.tableGroup.add(legMesh);
        });
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}