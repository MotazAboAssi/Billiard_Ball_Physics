import * as THREE from 'three';
import GUI from 'lil-gui';
import { PhysicsWorld } from '/src/Physic/PhysicsWorld.js';
import { PhysicalBall } from '/src/Physic/PhysicalBall.js';
import { WindBlowForce, MagneticCueBallForce } from '/src/IExternalForce.js';
import { TableGraphics } from '/src/Simulation/TableGraphics.js';
import { CueStickManager } from '/src/Simulation/CueStickManager.js';
import { GameLogic, GameState, BallGroup } from '/src/GameLogic.js';

export class SimulationApp {
    constructor() {
        this.animate       = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.onPointerDown  = this.onPointerDown.bind(this);
        this.onPointerMove  = this.onPointerMove.bind(this);
        this.onPointerUp    = this.onPointerUp.bind(this);

        // فيزياء
        this.physicsWorld   = new PhysicsWorld();
        this.ballMeshes     = [];
        this.tableWidth     = 1.27;
        this.tableLength    = 2.54;
        this.ballRadius     = 0.028575;
        this.ballMass       = 0.17;
        this.fixedTimeStep  = 1 / 120;
        this.accumulator    = 0;
        this.lastTime       = 0;

        // منطق اللعبة
        this.gameLogic      = new GameLogic();
        this.allPocketedIds = [];   // الكرات المُهربة تراكمياً (بدون الكرة البيضاء)

        // تتبع نهاية الضربة
        this.shotLaunched      = false;
        this.shotSettleTimer   = 0;
        this.SETTLE_DELAY      = 0.4;   // ثانية انتظار بعد سكون الكرات

        // وضع الكرة باليد
        this.raycaster         = new THREE.Raycaster();
        this.mouse             = new THREE.Vector2();
        this.tablePlane        = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.ballRadius);
        this.ballInHandPos     = new THREE.Vector3();
        this.ballInHandGhost   = null;

        this.physicsWorld.registerExternalForce(new WindBlowForce());
        this.physicsWorld.registerExternalForce(new MagneticCueBallForce());

        this.tableGraphics = new TableGraphics(this);
        this.cueManager    = new CueStickManager(this, this.tableGraphics.scene);

        this.initPhysicsWorld();
        this.initGameCallbacks();
        this.initBallInHandGhost();
        this.initTelemetryDOM();
        this.initTelemetryBallSelect();
        this.initGameUI();
        this.initKeyboardSwitching();
        this.initGUI();
        this.initControlsInteraction();

        this.lastTime = performance.now();
        window.requestAnimationFrame(this.animate);
    }

    /* ═══════════════════════════════════════════════════
       تهيئة الكرات والمشهد
       ═══════════════════════════════════════════════════ */
    initPhysicsWorld() {
        const ballGeo = new THREE.SphereGeometry(this.ballRadius, 32, 32);

        // الكرة البيضاء
        const cueBallPhys = new PhysicalBall(0, new THREE.Vector3(0, this.ballRadius, this.tableLength / 4), this.ballRadius, this.ballMass);
        const cueBallMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
        cueBallMesh.castShadow = true;
        this.tableGraphics.scene.add(cueBallMesh);
        this.physicsWorld.addBall(cueBallPhys);
        this.ballMeshes.push({ physics: cueBallPhys, mesh: cueBallMesh });

        const rackData = [
            { id: 9,  color: 0xffcc00, isStriped: true  },
            { id: 7,  color: 0x990011, isStriped: false },
            { id: 12, color: 0x222288, isStriped: true  },
            { id: 15, color: 0x990011, isStriped: true  },
            { id: 8,  color: 0x111111, isStriped: false },
            { id: 1,  color: 0xffcc00, isStriped: false },
            { id: 6,  color: 0x008844, isStriped: false },
            { id: 10, color: 0x1133aa, isStriped: true  },
            { id: 3,  color: 0xdd2222, isStriped: false },
            { id: 14, color: 0x008844, isStriped: true  },
            { id: 11, color: 0xdd2222, isStriped: true  },
            { id: 2,  color: 0x1133aa, isStriped: false },
            { id: 13, color: 0xff6600, isStriped: true  },
            { id: 4,  color: 0x441166, isStriped: false },
            { id: 5,  color: 0xff6600, isStriped: false }
        ];

        const apexZ      = -this.tableLength / 4;
        const rowSpacing = this.ballRadius * Math.sqrt(3) + 0.0001;
        const colSpacing = this.ballRadius * 2 + 0.0001;
        let dataIndex    = 0;

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                const ballInfo = rackData[dataIndex++];
                const x = (col - row * 0.5) * colSpacing;
                const z = apexZ - row * rowSpacing;

                const ballPhys = new PhysicalBall(ballInfo.id, new THREE.Vector3(x, this.ballRadius, z), this.ballRadius, this.ballMass);
                this.physicsWorld.addBall(ballPhys);

                let ballMesh;
                if (ballInfo.isStriped) {
                    ballMesh = new THREE.Group();
                    const baseMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 }));
                    baseMesh.castShadow = true;
                    ballMesh.add(baseMesh);
                    const stripeGeo = new THREE.CylinderGeometry(this.ballRadius + 0.0002, this.ballRadius + 0.0002, this.ballRadius * 0.8, 32, 1, true);
                    const stripeMat = new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1, side: THREE.DoubleSide });
                    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
                    stripeMesh.rotation.x = Math.PI / 2;
                    ballMesh.add(stripeMesh);
                } else {
                    ballMesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: ballInfo.color, roughness: 0.1 }));
                    ballMesh.castShadow = true;
                }

                const numberSprite = this.createFloatingNumberSprite(ballInfo.id);
                numberSprite.position.set(0, this.ballRadius * 1.6, 0);
                ballMesh.add(numberSprite);

                this.tableGraphics.scene.add(ballMesh);
                this.ballMeshes.push({ physics: ballPhys, mesh: ballMesh, sprite: numberSprite });
            }
        }
    }

    initGameCallbacks() {
        // تهريب كرة
        this.physicsWorld.onBallPocketed = (id) => {
            if (id !== 0 && !this.allPocketedIds.includes(id)) {
                this.allPocketedIds.push(id);
            }
            this.gameLogic.onBallPocketed(id);
        };
        // أول تلامس للكرة البيضاء
        this.physicsWorld.onCueBallFirstContact = (id) => {
            this.gameLogic.onFirstContact(id);
        };
    }

    /* ═══════════════════════════════════════════════════
       كرة شبح للوضع باليد
       ═══════════════════════════════════════════════════ */
    initBallInHandGhost() {
        const geo = new THREE.SphereGeometry(this.ballRadius, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        this.ballInHandGhost = new THREE.Mesh(geo, mat);
        this.ballInHandGhost.visible = false;
        this.tableGraphics.scene.add(this.ballInHandGhost);

        // خط إرشادي متقطع حول منطقة المطبخ (خط الرأس)
        const headStringPoints = [
            new THREE.Vector3(-0.635, 0.002, 0),
            new THREE.Vector3( 0.635, 0.002, 0)
        ];
        const headStringGeo = new THREE.BufferGeometry().setFromPoints(headStringPoints);
        const headStringMat = new THREE.LineDashedMaterial({ color: 0xffff00, dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.5 });
        this.headStringLine = new THREE.Line(headStringGeo, headStringMat);
        this.headStringLine.computeLineDistances();
        this.headStringLine.visible = false;
        this.tableGraphics.scene.add(this.headStringLine);
    }

    /* ═══════════════════════════════════════════════════
       واجهة اللعبة (Game HUD)
       ═══════════════════════════════════════════════════ */
    initGameUI() {
        const hud = document.createElement('div');
        hud.id = 'game-hud';
        hud.style.cssText = `
            position: absolute; bottom: 0; left: 0; right: 0;
            background: rgba(10, 15, 30, 0.92);
            border-top: 2px solid #1e3a5f;
            display: flex; align-items: stretch;
            font-family: 'Segoe UI', sans-serif;
            z-index: 900; user-select: none;
            min-height: 90px;
        `;

        hud.innerHTML = `
            <!-- اللاعب 1 -->
            <div id="hud-p1" style="
                flex: 1; padding: 10px 16px; border-right: 1px solid #1e3a5f;
                display: flex; flex-direction: column; justify-content: center; gap: 4px;">
                <div style="font-size:13px; color:#94a3b8; font-weight:600; letter-spacing:1px;">اللاعب 1</div>
                <div id="hud-p1-group" style="font-size:14px; color:#e2e8f0;">—</div>
                <div id="hud-p1-balls" style="font-size:18px; letter-spacing:2px;"></div>
                <div id="hud-p1-remaining" style="font-size:11px; color:#64748b;"></div>
            </div>

            <!-- المنتصف -->
            <div style="
                flex: 2; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 6px; padding: 8px;">
                <div id="hud-state-badge" style="
                    font-size: 11px; font-weight: 700; letter-spacing: 2px;
                    padding: 2px 10px; border-radius: 10px;
                    background: #1e3a5f; color: #7dd3fc;">BREAK</div>
                <div id="hud-turn" style="font-size: 15px; color: #f8fafc; font-weight: 600; text-align:center;"></div>
                <div id="hud-message" style="
                    font-size: 12px; color: #94a3b8; text-align: center;
                    max-width: 280px; line-height: 1.5;"></div>
                <div id="hud-ball-in-hand-hint" style="
                    display:none; font-size:12px; color:#fbbf24; font-weight:600;
                    background: rgba(251,191,36,0.1); padding: 4px 12px; border-radius:8px;
                    border: 1px solid rgba(251,191,36,0.3);">
                    🖱️ انقر على الطاولة لوضع الكرة البيضاء
                </div>
            </div>

            <!-- اللاعب 2 -->
            <div id="hud-p2" style="
                flex: 1; padding: 10px 16px; border-left: 1px solid #1e3a5f;
                display: flex; flex-direction: column; justify-content: center; gap: 4px; text-align: right;">
                <div style="font-size:13px; color:#94a3b8; font-weight:600; letter-spacing:1px;">اللاعب 2</div>
                <div id="hud-p2-group" style="font-size:14px; color:#e2e8f0;">—</div>
                <div id="hud-p2-balls" style="font-size:18px; letter-spacing:2px;"></div>
                <div id="hud-p2-remaining" style="font-size:11px; color:#64748b;"></div>
            </div>
        `;

        document.body.appendChild(hud);

        // مرجع سريع للـ DOM
        this.hudEl = {
            p1:          document.getElementById('hud-p1'),
            p2:          document.getElementById('hud-p2'),
            p1Group:     document.getElementById('hud-p1-group'),
            p2Group:     document.getElementById('hud-p2-group'),
            p1Balls:     document.getElementById('hud-p1-balls'),
            p2Balls:     document.getElementById('hud-p2-balls'),
            p1Remaining: document.getElementById('hud-p1-remaining'),
            p2Remaining: document.getElementById('hud-p2-remaining'),
            stateBadge:  document.getElementById('hud-state-badge'),
            turn:        document.getElementById('hud-turn'),
            message:     document.getElementById('hud-message'),
            bihHint:     document.getElementById('hud-ball-in-hand-hint'),
        };

        this.updateGameUI();
    }

    updateGameUI() {
        const gl  = this.gameLogic;
        const hud = this.hudEl;
        if (!hud) return;

        // شارة الحالة
        const stateLabels = {
            [GameState.BREAK]:        { label: 'BREAK',       bg: '#1e3a5f', color: '#7dd3fc' },
            [GameState.PLAYING]:      { label: 'PLAYING',     bg: '#14532d', color: '#86efac' },
            [GameState.BALL_IN_HAND]: { label: 'BALL IN HAND',bg: '#713f12', color: '#fde68a' },
            [GameState.GAME_OVER]:    { label: 'GAME OVER',   bg: '#7f1d1d', color: '#fca5a5' },
        };
        const stateInfo = stateLabels[gl.state] || stateLabels[GameState.PLAYING];
        hud.stateBadge.textContent        = stateInfo.label;
        hud.stateBadge.style.background   = stateInfo.bg;
        hud.stateBadge.style.color        = stateInfo.color;

        // دور من؟
        if (gl.state === GameState.GAME_OVER) {
            hud.turn.textContent = gl.winner ? `🏆 اللاعب ${gl.winner} فاز!` : 'انتهت اللعبة';
            hud.turn.style.color = '#fbbf24';
        } else if (gl.state === GameState.BALL_IN_HAND) {
            hud.turn.textContent = `اللاعب ${gl.currentPlayer} — ضع الكرة البيضاء`;
            hud.turn.style.color = '#fde68a';
        } else {
            hud.turn.textContent = `دور اللاعب ${gl.currentPlayer}`;
            hud.turn.style.color = '#f8fafc';
        }

        // رسالة الحدث
        hud.message.textContent = gl.eventMessage;

        // تلميح وضع الكرة
        hud.bihHint.style.display = gl.state === GameState.BALL_IN_HAND ? 'block' : 'none';

        // تمييز اللاعب النشط
        hud.p1.style.background = gl.currentPlayer === 1 && gl.state !== GameState.GAME_OVER
            ? 'rgba(56,189,248,0.07)' : 'transparent';
        hud.p2.style.background = gl.currentPlayer === 2 && gl.state !== GameState.GAME_OVER
            ? 'rgba(56,189,248,0.07)' : 'transparent';
        hud.p1.style.borderRight = gl.currentPlayer === 1 && gl.state !== GameState.GAME_OVER
            ? '3px solid #38bdf8' : '1px solid #1e3a5f';
        hud.p2.style.borderLeft  = gl.currentPlayer === 2 && gl.state !== GameState.GAME_OVER
            ? '3px solid #38bdf8' : '1px solid #1e3a5f';

        // مجموعات اللاعبين
        const groupLabels = {
            [BallGroup.NONE]:    { text: '— (غير محددة)', color: '#64748b' },
            [BallGroup.SOLIDS]:  { text: '🔵 مصمتة 1–7',  color: '#60a5fa' },
            [BallGroup.STRIPES]: { text: '🟡 مخططة 9–15', color: '#fbbf24' },
        };
        const g1 = groupLabels[gl.playerGroups[1]];
        const g2 = groupLabels[gl.playerGroups[2]];
        hud.p1Group.textContent = g1.text; hud.p1Group.style.color = g1.color;
        hud.p2Group.textContent = g2.text; hud.p2Group.style.color = g2.color;

        // عداد الكرات المتبقية
        this._updateBallIndicators(1);
        this._updateBallIndicators(2);

        // خط الرأس: ظاهر فقط في وضع الكرة باليد + قيد خلف الخط
        this.headStringLine.visible = gl.state === GameState.BALL_IN_HAND;
    }

    _updateBallIndicators(player) {
        const gl    = this.gameLogic;
        const group = gl.playerGroups[player];
        const hud   = this.hudEl;

        if (group === BallGroup.NONE) {
            hud[`p${player}Balls`].textContent     = '';
            hud[`p${player}Remaining`].textContent = 'لم تُحدَّد المجموعة بعد';
            return;
        }

        const ids      = group === BallGroup.SOLIDS ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15];
        const remaining = ids.filter(id => !this.allPocketedIds.includes(id));
        const pocketed  = ids.filter(id =>  this.allPocketedIds.includes(id));

        hud[`p${player}Balls`].textContent =
            remaining.map(() => '●').join('') +
            // '<span style="opacity:.3">' +
            pocketed.map(() => '●').join('') ;
            //  + '</span>';

        // هل انتهى من مجموعته؟ أظهر مؤشر الكرة 8
        const eightPocketed = this.allPocketedIds.includes(8);
        if (remaining.length === 0 && !eightPocketed) {
            hud[`p${player}Remaining`].textContent = '🎯 الآن هرّب الكرة 8!';
            hud[`p${player}Remaining`].style.color = '#f59e0b';
        } else {
            hud[`p${player}Remaining`].textContent = `${remaining.length} كرة متبقية`;
            hud[`p${player}Remaining`].style.color = '#64748b';
        }
    }

    /* ═══════════════════════════════════════════════════
       نهاية الضربة — تقييم اللعبة
       ═══════════════════════════════════════════════════ */
    onShotComplete() {
        const result = this.gameLogic.onShotEnd(this.allPocketedIds);
        if (!result) return;

        if (result.gameOver) {
            this.cueManager.cuePivot.visible = false;
            this.cueManager.aimLine.visible  = false;

            // تأثير بصري للفوز: لون الخلفية لحظياً
            this.tableGraphics.renderer.domElement.style.outline = '4px solid #fbbf24';
        }

        if (result.ballInHand) {
            // أظهر الشبح وفعّل وضع الكرة باليد
            this.ballInHandGhost.visible = true;
            // ضع الشبح في موقع ابتدائي في منتصف الطاولة
            const startZ = result.behindLine ? this.tableLength / 4 * 0.5 : 0;
            this.ballInHandGhost.position.set(0, this.ballRadius, startZ);
            this.ballInHandPos.set(0, this.ballRadius, startZ);
            this.headStringLine.visible = result.behindLine;
        }

        this.updateGameUI();
    }

    /* ═══════════════════════════════════════════════════
       Telemetry (لوحة البيانات اللحظية — unchanged)
       ═══════════════════════════════════════════════════ */
    initTelemetryDOM() {
        const panel = document.createElement('div');
        panel.id = 'physics-telemetry-panel';
        panel.style.cssText = `
            position: absolute; top: 10px; left: 10px; width: 300px;
            background: rgba(15, 23, 42, 0.95); color: #e2e8f0;
            font-family: 'Courier New', monospace; font-size: 12px;
            padding: 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            border: 1px solid #334155; z-index: 1000; pointer-events: auto; direction: ltr;
        `;
        panel.innerHTML = `
            <h3 style="margin-top:0;border-bottom:2px solid #00ffaa;padding-bottom:5px;color:#00ffaa;font-family:sans-serif;font-size:14px;">📊 اللوحة اللحظية للمختبر الفيزيائي</h3>
            <div style="margin-bottom:10px;">
                <label for="telemetry-ball-select" style="font-family:sans-serif;color:#94a3b8;">اختر الكرة للمراقبة اللحظية:</label>
                <select id="telemetry-ball-select" style="background:#1e293b;color:#fff;border:1px solid #475569;padding:4px;width:100%;margin-top:5px;border-radius:4px;font-family:sans-serif;"></select>
            </div>
            <div style="border-bottom:1px solid #334155;padding:4px 0;display:flex;justify-content:space-between;"><span>System Total KE:</span><span id="tel-sys-ke" style="color:#10b981;font-weight:bold;">0.00000 J</span></div>
            <div style="border-bottom:1px solid #334155;padding:4px 0;display:flex;justify-content:space-between;"><span>Ball State:</span><span id="tel-state" style="font-weight:bold;">-</span></div>
            <div style="border-bottom:1px solid #334155;padding:4px 0;display:flex;justify-content:space-between;"><span>Ball Indiv KE:</span><span id="tel-ball-ke">0.00000 J</span></div>
            <div style="border-bottom:1px solid #334155;padding:4px 0;display:flex;justify-content:space-between;"><span>Linear Vel |v|:</span><span id="tel-velocity">0.0000 m/s</span></div>
            <div style="border-bottom:1px solid #334155;padding:4px 0;display:flex;justify-content:space-between;"><span>Angular Vel |w|:</span><span id="tel-angular">0.0000 rad/s</span></div>
            <div style="border-bottom:1px solid #334155;padding:4px 0;display:flex;justify-content:space-between;"><span>Contact Vel |vc|:</span><span id="tel-vc">0.0000 m/s</span></div>
            <div style="padding:4px 0;display:flex;justify-content:space-between;"><span>Kinetic Phase:</span><span id="tel-phase" style="font-weight:bold;">-</span></div>
            <div style="color:#ffaa00;font-size:10px;margin-top:8px;font-family:sans-serif;border-top:1px dashed #475569;padding-top:5px;">💡 اسحب بالماوس مع زر الأيمن (أو Shift) للتصويب</div>
        `;
        document.body.appendChild(panel);

        this.domETotal   = document.getElementById('tel-sys-ke');
        this.domCueState = document.getElementById('tel-state');
        this.domBallKE   = document.getElementById('tel-ball-ke');
        this.domVelocity = document.getElementById('tel-velocity');
        this.domAngular  = document.getElementById('tel-angular');
        this.domVc       = document.getElementById('tel-vc');
        this.domPhase    = document.getElementById('tel-phase');
        this.ballSelect  = document.getElementById('telemetry-ball-select');
    }

    initTelemetryBallSelect() {
        if (!this.ballSelect) return;
        this.ballSelect.innerHTML = '';
        this.ballMeshes.forEach(item => {
            const opt = document.createElement('option');
            opt.value     = item.physics.id;
            opt.innerText = item.physics.id === 0
                ? 'الكرة البيضاء (Cue Ball)'
                : `كرة الهدف الرقمية [${item.physics.id}]`;
            this.ballSelect.appendChild(opt);
        });
    }

    /* ═══════════════════════════════════════════════════
       Sprite الأرقام
       ═══════════════════════════════════════════════════ */
    createFloatingNumberSprite(number) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(15,23,42,0.25)';
        ctx.beginPath(); ctx.arc(64,64,50,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'transparent'; ctx.lineWidth = 6; ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 55px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(number, 64, 64);
        const texture  = new THREE.CanvasTexture(canvas);
        const sprite   = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }));
        sprite.scale.set(0.12, 0.12, 1);
        return sprite;
    }

    /* ═══════════════════════════════════════════════════
       GUI
       ═══════════════════════════════════════════════════ */
    initGUI() {
        this.gui = new GUI({ title: '🕹️ لوحة هندسة القوانين الفيزيائية' });
        this.gui.domElement.style.top   = '10px';
        this.gui.domElement.style.right = '10px';
        const config = this.physicsWorld.config;

        const fStrike = this.gui.addFolder('🏑 التحكم بالعصا والضربة');
        fStrike.add(config, 'strikeImpulse', 0.1, 3.0, 0.05).name('دفع الضربة (Impulse)').onChange(v => this.physicsWorld.updateParameters({ strikeImpulse: v }));
        fStrike.add(config, 'strikeOffsetX', -0.02, 0.02, 0.001).name('انحراف أفقي (X)').onChange(v => this.physicsWorld.updateParameters({ strikeOffsetX: v }));
        fStrike.add(config, 'strikeOffsetY', -0.02, 0.02, 0.001).name('انحراف رأسي (Y)').onChange(v => this.physicsWorld.updateParameters({ strikeOffsetY: v }));
        fStrike.add(this, 'triggerAdvancedStrike').name('🚀 إطلاق القوة');
        fStrike.add(this, 'resetGame').name('🔄 إعادة اللعبة');
        fStrike.open();

        const fEnv = this.gui.addFolder('🌍 البيئة والاحتكاك');
        fEnv.add(config, 'gravity',       0.0, 25.0,  0.1  ).name('الجاذبية (g)').onChange(v => this.physicsWorld.updateParameters({ gravity: v }));
        fEnv.add(config, 'mu_sliding',    0.0,  0.8,  0.01 ).name('احتكاك الانزلاق').onChange(v => this.physicsWorld.updateParameters({ mu_sliding: v }));
        fEnv.add(config, 'mu_rolling',    0.0,  0.1,  0.001).name('احتكاك التدحرج').onChange(v => this.physicsWorld.updateParameters({ mu_rolling: v }));
        fEnv.add(config, 'k_air',         0.0,  0.05, 0.001).name('مقاومة الهواء').onChange(v => this.physicsWorld.updateParameters({ k_air: v }));

        const fColl = this.gui.addFolder('💥 مرونة التصادمات');
        fColl.add(config, 'e_ball',          0.0, 1.0, 0.01).name('كرة مع كرة').onChange(v => this.physicsWorld.updateParameters({ e_ball: v }));
        fColl.add(config, 'e_cushion',       0.0, 1.0, 0.01).name('كرة مع حافة').onChange(v => this.physicsWorld.updateParameters({ e_cushion: v }));
        fColl.add(config, 'cushion_friction',0.0, 1.0, 0.05).name('احتكاك الحافة').onChange(v => this.physicsWorld.updateParameters({ cushion_friction: v }));

        this.physicsWorld.registeredForces.forEach(force => {
            const folder = this.gui.addFolder(`🔧 قانون خارجي: ${force.name}`);
            force.setupGUI(folder);
            folder.close();
        });
    }

    /* ═══════════════════════════════════════════════════
       أحداث المؤشر والكيبورد
       ═══════════════════════════════════════════════════ */
    initControlsInteraction() {
        window.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup',   this.onPointerUp);
        window.addEventListener('resize',      this.onWindowResize);
        // منع قائمة السياق عند زر الأيمن للتصويب
        window.addEventListener('contextmenu', e => e.preventDefault());
    }

    onPointerDown(e) {
        // ── وضع الكرة باليد: زر أيسر على الطاولة ──
        if (this.gameLogic.state === GameState.BALL_IN_HAND && e.button === 0) {
            this._placeCueBallAtGhost(this.gameLogic.playerGroups);
            return;
        }

        // ── التصويب: زر أيمن أو Shift ──
        const cueBall    = this.ballMeshes[0].physics;
        const stopCamera = this.cueManager.handlePointerDown(e, cueBall);
        if (stopCamera) this.tableGraphics.controls.enabled = false;
    }

    onPointerMove(e) {
        // تحديث الكرة الشبح في وضع الكرة باليد
        if (this.gameLogic.state === GameState.BALL_IN_HAND && this.ballInHandGhost) {
            this._updateGhostPosition(e);
        }
        this.cueManager.handlePointerMove(e);
    }

    onPointerUp() {
        this.cueManager.handlePointerUp();
        this.tableGraphics.controls.enabled = true;
    }

    _updateGhostPosition(e) {
        this.mouse.x = (e.clientX / window.innerWidth)  *  2 - 1;
        this.mouse.y = (e.clientY / window.innerHeight) * -2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.tableGraphics.camera);

        const target = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.tablePlane, target)) return;

        const b = this.physicsWorld.tableBounds;
        const r = this.ballRadius;
        target.x = Math.max(b.minX + r, Math.min(b.maxX - r, target.x));
        target.z = Math.max(b.minZ + r, Math.min(b.maxZ - r, target.z));

        // قيد "المطبخ" (خلف خط الرأس) عند الكسر
        if (this.headStringLine.visible) {
            target.z = Math.max(r, target.z);   // يجب أن يكون z > 0
        }

        this.ballInHandGhost.position.set(target.x, this.ballRadius, target.z);
        this.ballInHandPos.copy(this.ballInHandGhost.position);
    }

    _placeCueBallAtGhost() {
        const cueBall = this.ballMeshes[0].physics;
        cueBall.position.copy(this.ballInHandPos);
        cueBall.velocity.set(0, 0, 0);
        cueBall.angularVelocity.set(0, 0, 0);
        cueBall.isSleeping   = true;
        cueBall.isPocketted  = false;

        this.ballInHandGhost.visible    = false;
        this.headStringLine.visible     = false;
        this.gameLogic.state            = GameState.PLAYING;
        this.tableGraphics.renderer.domElement.style.outline = '';

        this.updateGameUI();
    }

    initKeyboardSwitching() {
        window.addEventListener('keydown', (event) => {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;

            let targetId = null;
            if (event.key >= '1' && event.key <= '9') {
                const num = parseInt(event.key);
                if (event.shiftKey) {
                    if (num >= 1 && num <= 7) targetId = num + 8;
                } else {
                    if (num >= 1 && num <= 8) targetId = num;
                }
            } else if (event.key === '0' || event.key === ' ') {
                targetId = 0;
                if (event.key === ' ') event.preventDefault();
            }

            if (targetId !== null && this.ballSelect) {
                const exists = this.ballMeshes.some(item => item.physics.id === targetId);
                if (exists) {
                    this.ballSelect.value = targetId;
                    this.ballSelect.dispatchEvent(new Event('change'));
                }
            }
        });
    }

    /* ═══════════════════════════════════════════════════
       ضربة العصا
       ═══════════════════════════════════════════════════ */
    triggerAdvancedStrike() {
        const gl      = this.gameLogic;
        const cueBall = this.ballMeshes[0].physics;

        // لا تُطلق إذا اللعبة منتهية أو في وضع الكرة باليد أو الكرة متحركة
        if (gl.state === GameState.GAME_OVER)    return;
        if (gl.state === GameState.BALL_IN_HAND) return;
        if (!cueBall || !cueBall.isSleeping || cueBall.isPocketted) return;
        if (this.cueManager.isStrikingAnimation) return;

        // إخبار منطق اللعبة ببداية ضربة جديدة
        gl.onShotStart();
        this.shotLaunched    = false;
        this.shotSettleTimer = 0;

        this.cueManager.strikeProgress          = 0;
        this.cueManager.isStrikingAnimation     = true;
        this.cueManager.cueMesh.visible         = true;
    }

    resetGame() {
        // إعادة تحميل الصفحة لإعادة ضبط كل شيء
        window.location.reload();
    }

    onWindowResize() { this.tableGraphics.handleResize(); }

    /* ═══════════════════════════════════════════════════
       حلقة الرسوم المتحركة
       ═══════════════════════════════════════════════════ */
    animate(timestamp) {
        window.requestAnimationFrame(this.animate);

        if (!this.lastTime) this.lastTime = timestamp;
        let frameTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (frameTime > 0.25) frameTime = 0.25;

        this.accumulator += frameTime;
        while (this.accumulator >= this.fixedTimeStep) {
            this.physicsWorld.update(this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
        }

        const cueBall  = this.ballMeshes[0].physics;
        const totalKE  = this.physicsWorld.getTotalKineticEnergy();

        // ── تتبع نهاية الضربة ──
        if (this.gameLogic.shotInProgress) {
            if (!this.shotLaunched && totalKE > 0.0001) {
                this.shotLaunched = true;
            }
            if (this.shotLaunched) {
                if (totalKE < 0.000005) {
                    this.shotSettleTimer += frameTime;
                    if (this.shotSettleTimer >= this.SETTLE_DELAY) {
                        this.onShotComplete();
                        this.shotLaunched    = false;
                        this.shotSettleTimer = 0;
                    }
                } else {
                    this.shotSettleTimer = 0;
                }
            }
        }

        // ── تحريك العصا ──
        if (this.cueManager.isStrikingAnimation) {
            this.cueManager.animateStrike(frameTime, cueBall);
        } else {
            const canAim = this.gameLogic.state !== GameState.GAME_OVER
                        && this.gameLogic.state !== GameState.BALL_IN_HAND;
            if (canAim) this.cueManager.updateState(cueBall);
            else {
                this.cueManager.cuePivot.visible = false;
                this.cueManager.aimLine.visible  = false;
            }
        }

        // ── تحديث mesh positions ──
        for (let item of this.ballMeshes) {
            item.mesh.position.copy(item.physics.position);
            item.mesh.visible = !item.physics.isPocketted;

            if (!item.physics.isSleeping && !item.physics.isPocketted) {
                const dRot = item.physics.angularVelocity.clone().multiplyScalar(this.fixedTimeStep);
                const q    = new THREE.Quaternion().setFromEuler(new THREE.Euler(dRot.x, dRot.y, dRot.z, 'XYZ'));
                item.mesh.quaternion.multiplyQuaternions(q, item.mesh.quaternion);
            }

            if (item.sprite) {
                item.sprite.quaternion.copy(item.mesh.quaternion).invert();
            }
        }

        this.updateTelemetryUI();
        this.tableGraphics.controls.update();
        this.tableGraphics.renderer.render(this.tableGraphics.scene, this.tableGraphics.camera);
    }

    /* ═══════════════════════════════════════════════════
       Telemetry UI
       ═══════════════════════════════════════════════════ */
    updateTelemetryUI() {
        const totalEnergy = this.physicsWorld.getTotalKineticEnergy();
        if (this.domETotal) this.domETotal.innerText = `${totalEnergy.toFixed(5)} J`;

        if (!this.ballSelect) return;
        const selectedId      = parseInt(this.ballSelect.value) || 0;
        const targetBallItem  = this.ballMeshes.find(item => item.physics.id === selectedId);
        if (!targetBallItem) return;

        const ball = targetBallItem.physics;
        if (this.domCueState) {
            this.domCueState.innerText    = ball.isPocketted ? '🕳️ POCKETTED' : (ball.isSleeping ? '💤 SLEEPING' : '🔥 ACTIVE');
            this.domCueState.style.color  = ball.isSleeping ? '#f59e0b' : '#10b981';
        }
        if (this.domBallKE)   this.domBallKE.innerText   = `${ball.getKineticEnergy().toFixed(5)} J`;
        if (this.domVelocity) this.domVelocity.innerText = `${ball.velocity.length().toFixed(4)} m/s`;
        if (this.domAngular)  this.domAngular.innerText  = `${ball.angularVelocity.length().toFixed(4)} rad/s`;

        const rVec  = new THREE.Vector3(0, -ball.radius, 0);
        const vTang = new THREE.Vector3().crossVectors(ball.angularVelocity, rVec);
        const vcMag = new THREE.Vector3().addVectors(ball.velocity, vTang).length();

        if (this.domVc) {
            this.domVc.innerText    = `${vcMag.toFixed(4)} m/s`;
            this.domVc.style.color  = vcMag > 0.005 ? '#f43f5e' : '#10b981';
        }
        if (this.domPhase) {
            if      (ball.isSleeping) { this.domPhase.innerText = 'STATIONARY'; this.domPhase.style.color = '#94a3b8'; }
            else if (vcMag > 0.005)   { this.domPhase.innerText = 'SLIDING (طور الانزلاق)'; this.domPhase.style.color = '#f43f5e'; }
            else                      { this.domPhase.innerText = 'PURE ROLLING (تدحرج نقي)'; this.domPhase.style.color = '#38bdf8'; }
        }
    }
}
