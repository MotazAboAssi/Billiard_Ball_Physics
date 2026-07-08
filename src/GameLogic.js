export const GameState = {
    BREAK:        'BREAK',
    PLAYING:      'PLAYING',
    BALL_IN_HAND: 'BALL_IN_HAND',
    GAME_OVER:    'GAME_OVER'
};

export const BallGroup = {
    NONE:    'NONE',
    SOLIDS:  'SOLIDS',
    STRIPES: 'STRIPES',
    EIGHT:   'EIGHT'
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

        this.shotInProgress          = false;
        this.pocketedThisShot        = [];
        this.cueBallPocketedThisShot = false;
        this.firstContactId          = null;
        this.firstContactDone        = false;
    }

    onShotStart() {
        this.shotInProgress          = true;
        this.pocketedThisShot        = [];
        this.cueBallPocketedThisShot = false;
        this.firstContactId          = null;
        this.firstContactDone        = false;
    }

    onBallPocketed(ballId) {
        if (!this.shotInProgress) return;
        if (ballId === 0) {
            this.cueBallPocketedThisShot = true;
        } else if (!this.pocketedThisShot.includes(ballId)) {
            this.pocketedThisShot.push(ballId);
        }
    }

    onFirstContact(otherId) {
        if (!this.shotInProgress || this.firstContactDone) return;
        this.firstContactId   = otherId;
        this.firstContactDone = true;
    }

    onShotEnd(allPocketedIds) {
        if (!this.shotInProgress) return null;
        this.shotInProgress = false;

        const pocketed = this.pocketedThisShot;
        const scratch  = this.cueBallPocketedThisShot;

        let result = {
            nextPlayer: this.currentPlayer,
            ballInHand: false,
            behindLine: false,
            gameOver:   false,
            winner:     null,
            message:    ''
        };

        if (this.state === GameState.BREAK) {
            if (scratch) {
                result.nextPlayer = this._other();
                result.ballInHand = true;
                result.behindLine = true;
                result.message = `💥 خدش في الكسر! الكرة لـ اللاعب ${result.nextPlayer} (خلف خط الرأس)`;

            } else if (pocketed.includes(8)) {
                result.nextPlayer = this.currentPlayer;
                result.ballInHand = true;
                result.message    = '🎱 تهربت الكرة 8 في الكسر! أعد وضع الكرة السوداء';

            } else if (pocketed.length > 0) {
                this._tryAssignGroups(pocketed);
                result.nextPlayer = this.currentPlayer;
                result.message = `✅ كسر ناجح! اللاعب ${this.currentPlayer} → ${this._groupLabel(this.playerGroups[this.currentPlayer])}`;

            } else if (this.firstContactId === null && pocketed.length === 0) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `⚠️ لم تلمس الكرة اي كرة اخرى`;
            this.currentPlayer = result.nextPlayer;
            this.state         = GameState.BALL_IN_HAND;
            this.eventMessage  = result.message;
            return result;
}else {
                result.nextPlayer = this._other();
                result.message = `🎯 كسر بلا نتيجة. دور اللاعب ${result.nextPlayer}`;
            }

            this.state         = result.ballInHand ? GameState.BALL_IN_HAND : GameState.PLAYING;
            this.currentPlayer = result.nextPlayer;
            this.eventMessage  = result.message;
            return result;
        }

        if (this.firstContactId === null && pocketed.length === 0) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `⚠️ لم تلمس الكرة اي كرة اخرى`;
            this.currentPlayer = result.nextPlayer;
            this.state         = GameState.BALL_IN_HAND;
            this.eventMessage  = result.message;
            return result;
}
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

        if (scratch) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `💥 خدش! الكرة البيضاء لـ اللاعب ${result.nextPlayer}`;
            this.currentPlayer = result.nextPlayer;
            this.state         = GameState.BALL_IN_HAND;
            this.eventMessage  = result.message;
            return result;
        }

        const myGroup = this.playerGroups[this.currentPlayer];
        const allPocketedBeforeShot = allPocketedIds.filter(id => !pocketed.includes(id));

        if (this.firstContactId !== null && myGroup !== BallGroup.NONE) {
            const contactGroup = this._groupOf(this.firstContactId);
            const onEightBall  = !this._hasRemaining(myGroup, allPocketedBeforeShot);
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

        if (this.firstContactId === null && myGroup !== BallGroup.NONE && pocketed.length === 0) {
            result.nextPlayer = this._other();
            result.ballInHand = true;
            result.message    = `⚠️ مخالفة! لم تُلمس أي كرة. الكرة لـ اللاعب ${result.nextPlayer}`;
            this.currentPlayer = result.nextPlayer;
            this.state         = GameState.BALL_IN_HAND;
            this.eventMessage  = result.message;
            return result;
        }

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
            const groupInfo = updatedGroup !== BallGroup.NONE
                ? ` | مجموعتك: ${this._groupLabel(updatedGroup)}`
                : '';
            result.message = `⚠️ مخالفة! تهريب كرة خاطئة${groupInfo}. الكرة لـ اللاعب ${result.nextPlayer}`;

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
        const firstNonEight = pocketedIds.find(id => {
            const g = this._groupOf(id);
            return g === BallGroup.SOLIDS || g === BallGroup.STRIPES;
        });
        if (!firstNonEight) return;
        const firstGroup = this._groupOf(firstNonEight);
        if (firstGroup === BallGroup.SOLIDS) {
            this.playerGroups[this.currentPlayer] = BallGroup.SOLIDS;
            this.playerGroups[this._other()]      = BallGroup.STRIPES;
            this.groupAssigned = true;
        } else if (firstGroup === BallGroup.STRIPES) {
            this.playerGroups[this.currentPlayer] = BallGroup.STRIPES;
            this.playerGroups[this._other()]      = BallGroup.SOLIDS;
            this.groupAssigned = true;
        }
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