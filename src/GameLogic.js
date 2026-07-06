// GameLogic.js — نظام قواعد لعبة البلياردو (8-Ball Pool)

export const GameState = {
    BREAK:        'BREAK',        // ضربة الكسر الأولى
    PLAYING:      'PLAYING',      // دور طبيعي
    BALL_IN_HAND: 'BALL_IN_HAND', // الكرة البيضاء باليد (بعد خدش)
    GAME_OVER:    'GAME_OVER'     // انتهت اللعبة
};

export const BallGroup = {
    NONE:    'NONE',
    SOLIDS:  'SOLIDS',   // 1–7  المصمتة
    STRIPES: 'STRIPES',  // 9–15 المخططة
    EIGHT:   'EIGHT'     // 8
};

export class GameLogic {
    constructor() {
        this.reset();
    }

    reset() {
        this.state         = GameState.BREAK;
        this.currentPlayer = 1;
        this.playerGroups  = { 1: BallGroup.NONE, 2: BallGroup.NONE };
        this.groupAssigned = false;
        this.winner        = null;
        this.eventMessage  = 'اللاعب 1 يبدأ بالكسر — اضغط "إطلاق القوة"';

        // تتبع الضربة الجارية
        this.shotInProgress          = false;
        this.pocketedThisShot        = [];
        this.cueBallPocketedThisShot = false;
        this.firstContactId          = null;
        this.firstContactDone        = false;
    }

    /* ═══════════════════════════════════════
       واجهة تتبع الضربة — يستدعيها SimulationApp
       ═══════════════════════════════════════ */

    onShotStart() {
        this.shotInProgress          = true;
        this.pocketedThisShot        = [];
        this.cueBallPocketedThisShot = false;
        this.firstContactId          = null;
        this.firstContactDone        = false;
    }

    /** تُستدعى من PhysicsWorld عند تهريب أي كرة */
    onBallPocketed(ballId) {
        if (!this.shotInProgress) return;
        if (ballId === 0) {
            this.cueBallPocketedThisShot = true;
        } else if (!this.pocketedThisShot.includes(ballId)) {
            this.pocketedThisShot.push(ballId);
        }
    }

    /** تُستدعى من PhysicsWorld عند أول تلامس للكرة البيضاء */
    onFirstContact(otherId) {
        if (!this.shotInProgress || this.firstContactDone) return;
        this.firstContactId   = otherId;
        this.firstContactDone = true;
    }

    /* ═══════════════════════════════════════
       تقييم نهاية الضربة
       @param allPocketedIds  — مصفوفة كل الكرات المُهربة في اللعبة حتى الآن
       ═══════════════════════════════════════ */
    onShotEnd(allPocketedIds) {
        if (!this.shotInProgress) return null;
        this.shotInProgress = false;

        const pocketed = this.pocketedThisShot;
        const scratch  = this.cueBallPocketedThisShot;

        let result = {
            nextPlayer: this.currentPlayer,
            ballInHand: false,
            behindLine: false,   // قيد "المطبخ" بعد خدش الكسر
            gameOver:   false,
            winner:     null,
            message:    ''
        };

        /* ─────────── ضربة الكسر ─────────── */
        if (this.state === GameState.BREAK) {
            if (scratch) {
                result.nextPlayer = this._other();
                result.ballInHand = true;
                result.behindLine = true;
                result.message = `💥 خدش في الكسر! الكرة لـ اللاعب ${result.nextPlayer} (خلف خط الرأس)`;

            } else if (pocketed.includes(8)) {
                // الكرة 8 في الكسر → أعد وضع الكرة البيضاء للكاسر نفسه
                result.nextPlayer = this.currentPlayer;
                result.ballInHand = true;
                result.message    = '🎱 تهربت الكرة 8 في الكسر! أعد وضع الكرة البيضاء';

            } else if (pocketed.length > 0) {
                this._tryAssignGroups(pocketed);
                result.nextPlayer = this.currentPlayer; // الكاسر يحتفظ بالدور
                result.message = `✅ كسر ناجح! اللاعب ${this.currentPlayer} → ${this._groupLabel(this.playerGroups[this.currentPlayer])}`;

            } else {
                result.nextPlayer = this._other();
                result.message = `🎯 كسر بلا نتيجة. دور اللاعب ${result.nextPlayer}`;
            }

            this.state         = result.ballInHand ? GameState.BALL_IN_HAND : GameState.PLAYING;
            this.currentPlayer = result.nextPlayer;
            this.eventMessage  = result.message;
            return result;
        }

        /* ─────────── اللعب الطبيعي ─────────── */

        // — تهريب الكرة 8 —
        if (pocketed.includes(8)) {
            const myGroup       = this.playerGroups[this.currentPlayer];
            const stillHasOwn   = this._hasRemaining(myGroup, allPocketedIds);

            if (scratch || myGroup === BallGroup.NONE || stillHasOwn) {
                result.gameOver = true;
                result.winner   = this._other();
                result.message  = `💀 اللاعب ${this.currentPlayer} خسر! (الكرة 8 في غير أوانها)`;
            } else {
                result.gameOver = true;
                result.winner   = this.currentPlayer;
                result.message  = `🏆 اللاعب ${this.currentPlayer} فاز بتهريب الكرة 8!`;
            }
            result.nextPlayer = this.currentPlayer;
            this.state        = GameState.GAME_OVER;
            this.winner       = result.winner;
            this.eventMessage = result.message;
            return result;
        }

        // — خدش —
        if (scratch) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `💥 خدش! الكرة البيضاء لـ اللاعب ${result.nextPlayer}`;
            this.currentPlayer = result.nextPlayer;
            this.state         = GameState.BALL_IN_HAND;
            this.eventMessage  = result.message;
            return result;
        }

        // — مخالفة: لمس كرة خاطئة أولاً —
        const myGroup = this.playerGroups[this.currentPlayer];
        if (this.firstContactId !== null && myGroup !== BallGroup.NONE) {
            const contactGroup = this._groupOf(this.firstContactId);
            const onEightBall  = !this._hasRemaining(myGroup, allPocketedIds);
            const legalFirst   = onEightBall
                ? (contactGroup === BallGroup.EIGHT)
                : (contactGroup === myGroup);

            if (!legalFirst) {
                result.nextPlayer = this._other();
                result.ballInHand = true;
                result.message    = `⚠️ مخالفة! لمست كرة خاطئة أولاً. الكرة لـ اللاعب ${result.nextPlayer}`;
                this.currentPlayer = result.nextPlayer;
                this.state         = GameState.BALL_IN_HAND;
                this.eventMessage  = result.message;
                return result;
            }
        }

        // — مخالفة: لم تُلمس أي كرة —
        if (this.firstContactId === null && myGroup !== BallGroup.NONE) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `⚠️ مخالفة! لم تُلمس أي كرة. الكرة لـ اللاعب ${result.nextPlayer}`;
            this.currentPlayer = result.nextPlayer;
            this.state         = GameState.BALL_IN_HAND;
            this.eventMessage  = result.message;
            return result;
        }

        // — تعيين المجموعات إن لزم —
        if (!this.groupAssigned && pocketed.filter(id => id !== 8).length > 0) {
            this._tryAssignGroups(pocketed);
        }

        const updatedGroup    = this.playerGroups[this.currentPlayer];
        const correctPocketed = pocketed.filter(id => this._groupOf(id) === updatedGroup);
        const wrongPocketed   = pocketed.filter(id => {
            const g = this._groupOf(id);
            return g !== updatedGroup && g !== BallGroup.EIGHT && g !== BallGroup.NONE;
        });

        if (wrongPocketed.length > 0) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `⚠️ مخالفة! تهريب كرة خاطئة. الكرة لـ اللاعب ${result.nextPlayer}`;

        } else if (correctPocketed.length > 0) {
            result.nextPlayer = this.currentPlayer;
            result.message    = `✅ اللاعب ${this.currentPlayer} يُهرب ${correctPocketed.length} كرة! دوره مرة أخرى`;

        } else {
            result.nextPlayer = this._other();
            result.message    = `🎯 لا كرات مُهربة. دور اللاعب ${result.nextPlayer}`;
        }

        this.currentPlayer = result.nextPlayer;
        this.state         = result.ballInHand ? GameState.BALL_IN_HAND : GameState.PLAYING;
        this.eventMessage  = result.message;
        return result;
    }

    /* ═══════════════════════════════════════
       مساعدات عامة
       ═══════════════════════════════════════ */

    getRemainingCount(group, allPocketedIds) {
        if (group === BallGroup.SOLIDS)
            return [1,2,3,4,5,6,7].filter(id => !allPocketedIds.includes(id)).length;
        if (group === BallGroup.STRIPES)
            return [9,10,11,12,13,14,15].filter(id => !allPocketedIds.includes(id)).length;
        return 7;
    }

    _other() { return this.currentPlayer === 1 ? 2 : 1; }

    _groupOf(id) {
        if (id >= 1 && id <= 7)  return BallGroup.SOLIDS;
        if (id === 8)             return BallGroup.EIGHT;
        if (id >= 9 && id <= 15) return BallGroup.STRIPES;
        return BallGroup.NONE;
    }

    _tryAssignGroups(pocketedIds) {
        if (this.groupAssigned) return;
        const hasSolid  = pocketedIds.some(id => id >= 1 && id <= 7);
        const hasStripe = pocketedIds.some(id => id >= 9 && id <= 15);
        if (hasSolid && !hasStripe) {
            this.playerGroups[this.currentPlayer] = BallGroup.SOLIDS;
            this.playerGroups[this._other()]      = BallGroup.STRIPES;
            this.groupAssigned = true;
        } else if (hasStripe && !hasSolid) {
            this.playerGroups[this.currentPlayer] = BallGroup.STRIPES;
            this.playerGroups[this._other()]      = BallGroup.SOLIDS;
            this.groupAssigned = true;
        }
        // إذا تهربت نوعان معاً في ضربة واحدة: لا تعيين حتى تُحسم
    }

    _hasRemaining(group, allPocketedIds) {
        if (group === BallGroup.SOLIDS)
            return [1,2,3,4,5,6,7].some(id => !allPocketedIds.includes(id));
        if (group === BallGroup.STRIPES)
            return [9,10,11,12,13,14,15].some(id => !allPocketedIds.includes(id));
        return false;
    }

    _groupLabel(group) {
        if (group === BallGroup.SOLIDS)  return '🔵 مصمتة (1-7)';
        if (group === BallGroup.STRIPES) return '🟡 مخططة (9-15)';
        return '—';
    }
}
