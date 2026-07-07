import * as THREE from 'three';

const ROOM_W  = 10;
const ROOM_D  = 12;
const ROOM_H  = 4.5;
const FLOOR_Y = -0.75;
const CEIL_Y  = FLOOR_Y + ROOM_H;
const WALL_Y  = FLOOR_Y + ROOM_H / 2;

export class RoomEnvironment {
    constructor(scene) {
        this.scene = scene;
        this._build();
    }

    _build() {
        this._addFog();
        this._addFloor();
        this._addWallsAndCeiling();
        this._addPendantLamps();
        this._addWallSconces();
        this._addWallScreens();
        this._addDecorativeTrim();
        this._addSofas();
        this._addSideTable();
        this._addWallPictures();
        this._addCornerTrees();
        this._addPlayers();
    }

    _addFog() {
        this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.04);
    }

    _addFloor() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1a1008';
        ctx.fillRect(0, 0, 512, 512);

        ctx.strokeStyle = '#0d0804';
        ctx.lineWidth = 2;
        const plankH = 64;
        for (let y = 0; y < 512; y += plankH) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,200,100,0.03)';
            ctx.lineWidth = 1;
            for (let g = 0; g < 6; g++) {
                const gy = y + Math.random() * plankH;
                ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(512, gy); ctx.stroke();
            }
            ctx.strokeStyle = '#0d0804';
            ctx.lineWidth = 2;
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(6, 6);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(ROOM_W + 2, ROOM_D + 2),
            new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = FLOOR_Y - 0.001;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    _addWallsAndCeiling() {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3050, roughness: 0.85 });
        const ceilMat = new THREE.MeshStandardMaterial({ color: 0x252535, roughness: 0.9 });

        this._wall(ROOM_W, ROOM_H, 0,       WALL_Y,  ROOM_D / 2,  Math.PI,       wallMat);
        this._wall(ROOM_W, ROOM_H, 0,       WALL_Y, -ROOM_D / 2,  0,             wallMat);
        this._wall(ROOM_D, ROOM_H, -ROOM_W / 2, WALL_Y, 0,  Math.PI / 2,  wallMat);
        this._wall(ROOM_D, ROOM_H,  ROOM_W / 2, WALL_Y, 0, -Math.PI / 2, wallMat);

        // Ceiling
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(0, CEIL_Y, 0);
        this.scene.add(ceil);

        const panelMat = new THREE.MeshStandardMaterial({ color: 0x0d0d14, roughness: 1.0 });
        [-1.5, 0, 1.5].forEach(x => {
            const strip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, ROOM_D - 0.5), panelMat);
            strip.position.set(x, CEIL_Y - 0.02, 0);
            this.scene.add(strip);
        });
    }

    _wall(w, h, x, y, z, rotY, mat) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
    }

    _addPendantLamps() {
        const lampZ = [-0.8, 0.0, 0.8];
        const lampY = CEIL_Y - 0.9;

        const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2a1f0e, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
        const rimMat   = new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.3, metalness: 0.8 });
        const bulbMat  = new THREE.MeshStandardMaterial({ color: 0xfff5cc, emissive: 0xfff5cc, emissiveIntensity: 3.0 });
        const cordMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });

        lampZ.forEach(z => {
            const group = new THREE.Group();

            const cordLen = CEIL_Y - lampY;
            const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, cordLen, 6), cordMat);
            cord.position.y = cordLen / 2;
            group.add(cord);

            const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 32, 1, true), shadeMat);
            shade.rotation.x = Math.PI;
            shade.position.y = 0;
            group.add(shade);

            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 32), rimMat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = -0.09;
            group.add(rim);

            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), bulbMat);
            bulb.position.y = 0.02;
            group.add(bulb);

            group.position.set(0, lampY, z);
            this.scene.add(group);

            const light = new THREE.PointLight(0xfff0cc, 5.0, 7.0, 1.2);
            light.position.set(0, lampY - 0.12, z);
            light.castShadow = true;
            light.shadow.mapSize.set(512, 512);
            light.shadow.bias = -0.002;
            this.scene.add(light);
        });
    }

    _addWallSconces() {
        const configs = [
            { pos: new THREE.Vector3(-ROOM_W / 2 + 0.05, 2.0,  1.8), rotY:  Math.PI / 2 },
            { pos: new THREE.Vector3(-ROOM_W / 2 + 0.05, 2.0, -1.8), rotY:  Math.PI / 2 },
            { pos: new THREE.Vector3( ROOM_W / 2 - 0.05, 2.0,  1.8), rotY: -Math.PI / 2 },
            { pos: new THREE.Vector3( ROOM_W / 2 - 0.05, 2.0, -1.8), rotY: -Math.PI / 2 },
        ];

        const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 0.5, metalness: 0.6 });
        const glowMat  = new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffcc66, emissiveIntensity: 2.0 });

        configs.forEach(({ pos, rotY }) => {
            const group = new THREE.Group();

            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.04), plateMat);
            group.add(plate);

            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), plateMat);
            arm.position.set(0, 0.04, 0.09);
            group.add(arm);

            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), glowMat);
            glow.position.set(0, 0.04, 0.16);
            group.add(glow);

            group.position.copy(pos);
            group.rotation.y = rotY;
            this.scene.add(group);

            const lightPos = pos.clone();
            const light = new THREE.PointLight(0xffcc66, 2.0, 6.0, 1.4);
            light.position.copy(lightPos);
            this.scene.add(light);
        });
    }

    _addWallScreens() {
        const bezelDepth = 0.06;
        const bezelZ     = ROOM_D / 2 - bezelDepth / 2;
        const screenZ    = ROOM_D / 2 - bezelDepth - 0.002;

        const screenY    = 1.8;
        const positions  = [-2.4, 2.4];

        const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.7 });

        positions.forEach(x => {
            const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, bezelDepth), bezelMat);
            bezel.position.set(x, screenY, bezelZ);
            this.scene.add(bezel);

            const tex = this._makeScreenTexture();
            const screenMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1.65, 0.95),
                new THREE.MeshStandardMaterial({
                    map: tex,
                    emissiveMap: tex,
                    emissive: new THREE.Color(0xffffff),
                    emissiveIntensity: 0.55,
                    roughness: 0.1
                })
            );
            screenMesh.rotation.y = Math.PI;
            screenMesh.position.set(x, screenY, screenZ);
            this.scene.add(screenMesh);

            const glow = new THREE.PointLight(0x4488ff, 0.35, 3.5, 2.0);
            glow.position.set(x, screenY, screenZ - 0.4);
            this.scene.add(glow);
        });
    }

    _makeScreenTexture() {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 300;
        const ctx = c.getContext('2d');

        ctx.fillStyle = '#050d1a';
        ctx.fillRect(0, 0, 512, 300);

        const hdr = ctx.createLinearGradient(0, 0, 512, 0);
        hdr.addColorStop(0, '#0a2a4a'); hdr.addColorStop(1, '#0d1f3a');
        ctx.fillStyle = hdr;
        ctx.fillRect(0, 0, 512, 48);

        ctx.fillStyle = '#7dd3fc';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BILLIARDS', 256, 32);

        ctx.strokeStyle = '#1e4a7a';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(512, 48); ctx.stroke();

        const rows = [
            { label: 'PLAYER 1', val: '●●●●●●●', color: '#60a5fa' },
            { label: 'PLAYER 2', val: '●●●●●',   color: '#fbbf24' },
        ];
        rows.forEach((r, i) => {
            const y = 100 + i * 80;
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fillRect(20, y - 28, 472, 56);
            ctx.fillStyle = r.color;
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(r.label, 36, y + 4);
            ctx.textAlign = 'right';
            ctx.fillText(r.val, 476, y + 4);
        });

        ctx.fillStyle = '#0a2a4a';
        ctx.fillRect(0, 260, 512, 40);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RACK  1  ·  PLAYING', 256, 284);

        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = 0; y < 300; y += 4) ctx.fillRect(0, y, 512, 2);

        return new THREE.CanvasTexture(c);
    }

    _addSofas() {
        const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1c0f08, roughness: 0.75 });
        const cushionMat = new THREE.MeshStandardMaterial({ color: 0x2c1a10, roughness: 0.8 });
        const legMat     = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.4, metalness: 0.35 });

        [{ x: -2.8 }, { x: 2.8 }].forEach(({ x }) => {
            const g = new THREE.Group();
            const z = -ROOM_D / 2 + 0.55;

            const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.7), leatherMat);
            base.position.set(0, FLOOR_Y + 0.11, 0);
            g.add(base);

            [-0.34, 0.34].forEach(cx => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.62), cushionMat);
                m.position.set(cx, FLOOR_Y + 0.29, 0.02);
                g.add(m);
            });

            const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.52, 0.12), leatherMat);
            back.position.set(0, FLOOR_Y + 0.48, -0.29);
            g.add(back);

            [-0.34, 0.34].forEach(cx => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.08), cushionMat);
                m.position.set(cx, FLOOR_Y + 0.48, -0.23);
                g.add(m);
            });

            [-0.69, 0.69].forEach(ax => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.7), leatherMat);
                m.position.set(ax, FLOOR_Y + 0.30, 0);
                g.add(m);
            });

            [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]].forEach(([lx, lz]) => {
                const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.1, 8), legMat);
                m.position.set(lx, FLOOR_Y + 0.05, lz);
                g.add(m);
            });

            g.position.set(x, 0, z);
            g.rotation.y = 0;
            this.scene.add(g);
        });
    }

    _addSideTable() {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b1f0a, roughness: 0.5, metalness: 0.1 });
        const topMat  = new THREE.MeshStandardMaterial({ color: 0x2a1508, roughness: 0.3, metalness: 0.15 });
        const g = new THREE.Group();

        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 32), topMat);
        top.position.y = FLOOR_Y + 0.62;
        g.add(top);

        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.55, 12), woodMat);
        stem.position.y = FLOOR_Y + 0.345;
        g.add(stem);

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.07), woodMat);
            foot.position.set(Math.cos(angle) * 0.12, FLOOR_Y + 0.02, Math.sin(angle) * 0.12);
            foot.rotation.y = angle;
            g.add(foot);
        }

        const glass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.04, 0.1, 16),
            new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 })
        );
        glass.position.y = FLOOR_Y + 0.67;
        g.add(glass);

        g.position.set(0, 0, -ROOM_D / 2 + 0.55);
        this.scene.add(g);
    }

    _addWallPictures() {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1f0e, roughness: 0.4, metalness: 0.3 });
        const pics = [
            { pos: new THREE.Vector3(0,                    2.3, -ROOM_D / 2 + 0.03), rotY:  0            },
            { pos: new THREE.Vector3(-ROOM_W / 2 + 0.03,   2.3,  0),                 rotY:  Math.PI / 2  },
            { pos: new THREE.Vector3( ROOM_W / 2 - 0.03,   2.3,  0),                 rotY: -Math.PI / 2  },
            { pos: new THREE.Vector3(0,                    3.1,  ROOM_D / 2 - 0.03), rotY:  Math.PI      },
        ];

        pics.forEach(({ pos, rotY }, i) => {
            const g = new THREE.Group();

            g.add(new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.64, 0.04), frameMat));

            const tex = this._makePaintingTexture(i);
            const canvas = new THREE.Mesh(
                new THREE.PlaneGeometry(0.72, 0.52),
                new THREE.MeshStandardMaterial({
                    map: tex, emissiveMap: tex,
                    emissive: new THREE.Color(0xffffff),
                    emissiveIntensity: 0.15,
                    roughness: 0.55
                })
            );
            canvas.position.z = 0.022;
            g.add(canvas);

            g.position.copy(pos);
            g.rotation.y = rotY;
            this.scene.add(g);
        });
    }

    _makePaintingTexture(index) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 180;
        const ctx = c.getContext('2d');

        if (index === 0) {
            ctx.fillStyle = '#0a1a10';
            ctx.fillRect(0, 0, 256, 180);
            const grad = ctx.createRadialGradient(128, 90, 8, 128, 90, 115);
            grad.addColorStop(0, 'rgba(20,90,70,0.85)');
            grad.addColorStop(1, 'rgba(5,15,10,0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 180);
            [[80,90,18,0xffcc00],[128,58,14,0xdd2222],[176,90,18,0x1133aa],[128,122,14,0x111111]]
                .forEach(([cx, cy, r, col]) => {
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = '#' + col.toString(16).padStart(6, '0'); ctx.fill();
                });
        } else if (index === 1) {
            ctx.fillStyle = '#1a0e05'; ctx.fillRect(0, 0, 256, 180);
            for (let i = 0; i < 8; i++) {
                const gx = ctx.createLinearGradient(0, i * 22, 256, i * 22 + 22);
                gx.addColorStop(0, `rgba(${120+i*8},${60+i*4},0,0.35)`);
                gx.addColorStop(1, `rgba(${80+i*5},${30+i*3},0,0.1)`);
                ctx.fillStyle = gx; ctx.fillRect(0, i * 22, 256, 22);
            }
            ctx.strokeStyle = 'rgba(200,140,40,0.45)'; ctx.lineWidth = 1.5;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 52, 0);
                ctx.bezierCurveTo(i*52+30, 60, i*52-20, 120, i*52+10, 180);
                ctx.stroke();
            }
        } else if (index === 2) {
            ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, 256, 180);
            const sky = ctx.createLinearGradient(0, 0, 0, 120);
            sky.addColorStop(0, '#0d1a30'); sky.addColorStop(1, '#1a2a40');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 120);
            ctx.fillStyle = '#080e18';
            [[0,30,60,120],[30,25,80,100],[55,35,50,130],[90,20,70,110],
             [110,30,55,125],[140,25,75,105],[165,40,45,135],[205,30,65,115],[235,21,50,130]]
                .forEach(([bx,bw,bh,by]) => ctx.fillRect(bx, by, bw, 180-by));
            ctx.beginPath(); ctx.arc(200, 35, 18, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(220,210,180,0.7)'; ctx.fill();
        } else {
            ctx.fillStyle = '#1a0505'; ctx.fillRect(0, 0, 256, 180);
            const rg = ctx.createRadialGradient(128, 90, 5, 128, 90, 120);
            rg.addColorStop(0, 'rgba(120,20,20,0.7)');
            rg.addColorStop(1, 'rgba(30,5,5,0)');
            ctx.fillStyle = rg; ctx.fillRect(0, 0, 256, 180);
            ctx.strokeStyle = 'rgba(180,140,60,0.7)'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(216, 160); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(216, 20); ctx.lineTo(40, 160); ctx.stroke();
            ctx.beginPath(); ctx.arc(128, 90, 28, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(180,140,60,0.6)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = 'rgba(180,140,60,0.15)'; ctx.fill();
        }
        return new THREE.CanvasTexture(c);
    }

    _addCornerTrees() {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b1f0a, roughness: 0.9 });
        const potMat   = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.7, metalness: 0.1 });
        const soilMat  = new THREE.MeshStandardMaterial({ color: 0x1a0e06, roughness: 1.0 });
        const leafMats = [
            new THREE.MeshStandardMaterial({ color: 0x1a4a1a, roughness: 0.85 }),
            new THREE.MeshStandardMaterial({ color: 0x0f3a12, roughness: 0.85 }),
            new THREE.MeshStandardMaterial({ color: 0x163d18, roughness: 0.85 }),
        ];

        const corners = [
            { x: -4.5, z: -5.5 },
            { x:  4.5, z: -5.5 },
            { x: -4.5, z:  5.5 },
            { x:  4.5, z:  5.5 },
        ];

        corners.forEach(({ x, z }) => {
            const g = new THREE.Group();

            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.28, 16), potMat);
            pot.position.y = FLOOR_Y + 0.14;
            g.add(pot);

            const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 16), soilMat);
            soil.position.y = FLOOR_Y + 0.29;
            g.add(soil);

            const trunkH = 0.75;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, trunkH, 10), trunkMat);
            trunk.position.y = FLOOR_Y + 0.28 + trunkH / 2;
            g.add(trunk);

            const tiers = [
                { r: 0.42, yOff: 0.0  },
                { r: 0.30, yOff: 0.28 },
                { r: 0.18, yOff: 0.50 },
            ];
            tiers.forEach(({ r, yOff }, i) => {
                const cluster = new THREE.Group();
                for (let j = 0; j < 5; j++) {
                    const angle  = (j / 5) * Math.PI * 2;
                    const sphere = new THREE.Mesh(
                        new THREE.SphereGeometry(r, 8, 7),
                        leafMats[i % leafMats.length]
                    );
                    sphere.position.set(
                        Math.cos(angle) * r * 0.5,
                        0,
                        Math.sin(angle) * r * 0.5
                    );
                    cluster.add(sphere);
                }
                cluster.add(new THREE.Mesh(
                    new THREE.SphereGeometry(r * 0.85, 8, 7),
                    leafMats[(i + 1) % leafMats.length]
                ));
                cluster.position.y = FLOOR_Y + 0.28 + trunkH + yOff;
                cluster.rotation.y = (i * Math.PI) / 3;
                g.add(cluster);
            });

            g.position.set(x, 0, z);
            this.scene.add(g);
        });
    }

    _addPlayers() {
        const skinMat   = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.7 });
        const hairMat   = new THREE.MeshStandardMaterial({ color: 0x1a0f00, roughness: 0.9 });
        const shirt1Mat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.75 });
        const shirt2Mat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.75 });
        const pantsMat  = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.8 });
        const shoeMat   = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6, metalness: 0.1 });

        const buildFigure = (shirtMat, pose) => {
            const fig = new THREE.Group();
            const F   = FLOOR_Y;

            const footH   = 0.06,  legLo = 0.42, legHi = 0.44;
            const hipH    = 0.14,  torsoH = 0.46, neckH = 0.08;
            const headR   = 0.115;
            const shoulderW = 0.38, armHi = 0.30, armLo = 0.28;
            const handR   = 0.045;

            [-0.09, 0.09].forEach(ox => {
                const foot = new THREE.Mesh(
                    new THREE.BoxGeometry(0.09, footH, 0.22), shoeMat);
                foot.position.set(ox, F + footH / 2, 0.05);
                fig.add(foot);
            });

            const legLoY = F + footH + legLo / 2;
            [-0.09, 0.09].forEach(ox => {
                const ll = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.055, 0.06, legLo, 10), pantsMat);
                ll.position.set(ox, legLoY, 0);
                fig.add(ll);
            });

            const legHiY = F + footH + legLo + legHi / 2;
            [-0.09, 0.09].forEach(ox => {
                const ul = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.065, 0.065, legHi, 10), pantsMat);
                ul.position.set(ox, legHiY, 0);
                fig.add(ul);
            });

            const hipY = F + footH + legLo + legHi + hipH / 2;
            const hips = new THREE.Mesh(
                new THREE.BoxGeometry(0.28, hipH, 0.20), pantsMat);
            hips.position.set(0, hipY, 0);
            fig.add(hips);

            const torsoY = hipY + hipH / 2 + torsoH / 2;
            const torso = new THREE.Mesh(
                new THREE.BoxGeometry(shoulderW, torsoH, 0.22), shirtMat);
            torso.position.set(0, torsoY, 0);
            fig.add(torso);

            const neckY = torsoY + torsoH / 2 + neckH / 2;
            const neck = new THREE.Mesh(
                new THREE.CylinderGeometry(0.055, 0.06, neckH, 10), skinMat);
            neck.position.set(0, neckY, 0);
            fig.add(neck);

            const headY = neckY + neckH / 2 + headR * 0.9;
            const head = new THREE.Mesh(
                new THREE.SphereGeometry(headR, 16, 14), skinMat);
            head.position.set(0, headY, 0);
            fig.add(head);

            const hair = new THREE.Mesh(
                new THREE.SphereGeometry(headR * 1.02, 16, 8,
                    0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
            hair.position.set(0, headY, 0);
            fig.add(hair);

            const shoulderY = torsoY + torsoH * 0.38;

            if (pose === 'stand') {
                [-1, 1].forEach(side => {
                    const sx = side * (shoulderW / 2 + 0.04);

                    const ua = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.042, 0.038, armHi, 10), shirtMat);
                    ua.position.set(sx, shoulderY - armHi / 2, 0);
                    ua.rotation.z = side * 0.12;
                    fig.add(ua);

                    const elbowY = shoulderY - armHi - 0.02;

                    const la = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.035, 0.032, armLo, 10), skinMat);
                    la.position.set(sx + side * 0.02, elbowY - armLo / 2, 0.04);
                    la.rotation.z = side * 0.10;
                    la.rotation.x = 0.15;
                    fig.add(la);

                    const hand = new THREE.Mesh(
                        new THREE.SphereGeometry(handR, 10, 8), skinMat);
                    hand.position.set(
                        sx + side * 0.03,
                        elbowY - armLo - handR * 0.6,
                        0.07);
                    fig.add(hand);
                });

            } else {
                const raGroup = new THREE.Group();
                raGroup.position.set(shoulderW / 2 + 0.04, shoulderY, 0);

                const raUpper = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.042, 0.038, armHi, 10), shirtMat);
                raUpper.position.set(0, -armHi / 2, 0);
                raGroup.add(raUpper);

                const raLower = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.035, 0.032, armLo, 10), skinMat);
                raLower.position.set(0, -armHi - armLo / 2, 0);
                raGroup.add(raLower);

                const raHand = new THREE.Mesh(
                    new THREE.SphereGeometry(handR, 10, 8), skinMat);
                raHand.position.set(0, -armHi - armLo - handR * 0.6, 0);
                raGroup.add(raHand);

                raGroup.rotation.x =  0.55;
                raGroup.rotation.z = -0.18;
                fig.add(raGroup);

                const laGroup = new THREE.Group();
                laGroup.position.set(-(shoulderW / 2 + 0.04), shoulderY, 0);

                const laUpper = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.042, 0.038, armHi, 10), shirtMat);
                laUpper.position.set(0, -armHi / 2, 0);
                laGroup.add(laUpper);

                const laLower = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.035, 0.032, armLo, 10), skinMat);
                laLower.position.set(0, -armHi - armLo / 2, 0);
                laGroup.add(laLower);

                const laHand = new THREE.Mesh(
                    new THREE.SphereGeometry(handR, 10, 8), skinMat);
                laHand.position.set(0, -armHi - armLo - handR * 0.6, 0);
                laGroup.add(laHand);

                laGroup.rotation.x =  0.45;
                laGroup.rotation.z =  0.22;
                fig.add(laGroup);

                torso.rotation.x = 0.22;
                head.position.z  = headR * 0.35;
                hair.position.z  = headR * 0.35;
            }

            return fig;
        };

        const p1 = buildFigure(shirt1Mat, 'stand');
        p1.position.set(0.18, 0, 1.72);
        p1.rotation.y = Math.PI;
        this.scene.add(p1);

        const p2 = buildFigure(shirt2Mat, 'shoot');
        p2.position.set(-0.15, 0, -1.72);
        p2.rotation.y = 0;
        this.scene.add(p2);
    }

    _addDecorativeTrim() {
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a1f0e, roughness: 0.5, metalness: 0.3 });

        const baseH = 0.12;
        const baseY = FLOOR_Y + baseH / 2;
        const baseboards = [
            { g: [ROOM_W - 0.1, baseH, 0.05], p: [0,  baseY,  ROOM_D / 2 - 0.025] },
            { g: [ROOM_W - 0.1, baseH, 0.05], p: [0,  baseY, -ROOM_D / 2 + 0.025] },
            { g: [0.05, baseH, ROOM_D - 0.1], p: [ ROOM_W / 2 - 0.025, baseY, 0] },
            { g: [0.05, baseH, ROOM_D - 0.1], p: [-ROOM_W / 2 + 0.025, baseY, 0] },
        ];
        baseboards.forEach(({ g, p }) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...g), trimMat);
            mesh.position.set(...p);
            this.scene.add(mesh);
        });

        const crownY = CEIL_Y - 0.04;
        const crowns = [
            { g: [ROOM_W - 0.1, 0.08, 0.05], p: [0,  crownY,  ROOM_D / 2 - 0.025] },
            { g: [ROOM_W - 0.1, 0.08, 0.05], p: [0,  crownY, -ROOM_D / 2 + 0.025] },
            { g: [0.05, 0.08, ROOM_D - 0.1], p: [ ROOM_W / 2 - 0.025, crownY, 0] },
            { g: [0.05, 0.08, ROOM_D - 0.1], p: [-ROOM_W / 2 + 0.025, crownY, 0] },
        ];
        crowns.forEach(({ g, p }) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...g), trimMat);
            mesh.position.set(...p);
            this.scene.add(mesh);
        });
    }
}